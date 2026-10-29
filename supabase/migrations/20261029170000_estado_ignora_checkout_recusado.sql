-- estado_acesso: assinaturas canceladas que nunca tiveram período pago (o Mercado Pago
-- cria e cancela a assinatura quando o cartão é recusado na validação) deixam de contar.
-- Antes, o cliente que nunca pagou aparecia como "Assinatura expirada".

CREATE OR REPLACE FUNCTION public.estado_acesso(uid UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s RECORD;
  tolerancia INTEGER;
BEGIN
  IF uid IS NULL THEN RETURN 'visitante'; END IF;
  -- Clientes (anon/authenticated) só consultam o próprio estado, exceto admins.
  -- service_role e acesso direto ao banco não têm essa restrição.
  IF uid IS DISTINCT FROM auth.uid() AND auth.role() IN ('anon', 'authenticated')
     AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = uid) THEN RETURN 'admin'; END IF;

  SELECT COALESCE((valor ->> 'tolerancia_dias')::INTEGER, 0) INTO tolerancia
  FROM public.app_config WHERE chave = 'plano';
  tolerancia := COALESCE(tolerancia, 0);

  -- Prioriza assinatura com acesso vigente; depois a mais recente
  SELECT * INTO s FROM public.subscriptions
  WHERE user_id = uid
    -- checkout que nunca chegou a ser pago (ex.: cartão recusado na validação) não conta
    AND NOT (status = 'cancelada' AND iniciada_em IS NULL)
  ORDER BY
    COALESCE(status IN ('ativa', 'inadimplente', 'cancelada') AND periodo_atual_fim > NOW(), FALSE) DESC,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN 'sem_assinatura'; END IF;

  IF s.status = 'ativa' THEN
    -- Sem pagamento aprovado não há período pago: não libera acesso
    IF s.periodo_atual_fim IS NULL THEN RETURN 'pagamento_pendente'; END IF;
    IF s.periodo_atual_fim > NOW() THEN RETURN 'ativa'; END IF;
    IF s.periodo_atual_fim + make_interval(days => tolerancia) > NOW() THEN RETURN 'tolerancia'; END IF;
    RETURN 'expirada';
  ELSIF s.status = 'inadimplente' THEN
    IF s.periodo_atual_fim IS NOT NULL AND s.periodo_atual_fim + make_interval(days => tolerancia) > NOW() THEN
      RETURN 'tolerancia';
    END IF;
    RETURN 'pagamento_pendente';
  ELSIF s.status = 'cancelada' THEN
    IF s.periodo_atual_fim IS NOT NULL AND s.periodo_atual_fim > NOW() THEN RETURN 'cancelada_vigente'; END IF;
    RETURN 'expirada';
  ELSIF s.status = 'pendente' THEN
    RETURN 'pagamento_pendente';
  END IF;
  RETURN 'expirada';
END;
$$;
