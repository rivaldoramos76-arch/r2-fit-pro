-- ============================================================
-- R2 Fit Pro — Administrador confirma o e-mail de um cliente manualmente
-- (quando o e-mail de confirmação não chega). Auditado.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_confirmar_email(p_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()), updated_at = NOW()
  WHERE id = p_user RETURNING email INTO v_email;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  INSERT INTO public.audit_logs (actor_id, acao, alvo, detalhes)
  VALUES (auth.uid(), 'admin.email_confirmado', p_user::TEXT, jsonb_build_object('email', v_email));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_confirmar_email(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirmar_email(UUID) TO authenticated;
