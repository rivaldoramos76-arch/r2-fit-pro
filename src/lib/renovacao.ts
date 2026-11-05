// Aviso de renovação para quem pagou a assinatura sem cartão de crédito (débito, Pix…):
// nesses casos o Asaas não consegue cobrar sozinho no mês seguinte.

export const DIAS_AVISO_RENOVACAO = 5

/** Dias até o vencimento (negativo = vencido) se o aviso deve aparecer; null se não precisa. */
export function diasAvisoRenovacao(a: { metodo: string | null; status: string; fim: string | null }, agora = new Date()): number | null {
  if (!a.fim || a.metodo === 'credit_card') return null
  if (!['ativa', 'inadimplente'].includes(a.status)) return null
  const dias = Math.ceil((Date.parse(a.fim) - agora.getTime()) / 86400000)
  return dias <= DIAS_AVISO_RENOVACAO ? dias : null
}

export function textoVencimento(dias: number): string {
  if (dias < 0) return 'Sua assinatura venceu'
  if (dias === 0) return 'Sua assinatura vence hoje'
  if (dias === 1) return 'Sua assinatura vence amanhã'
  return `Sua assinatura vence em ${dias} dias`
}
