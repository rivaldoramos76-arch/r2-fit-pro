export const brl = (centavos: number | null | undefined) =>
  (Number(centavos ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'

export type EstadoAcesso =
  | 'visitante' | 'sem_assinatura' | 'pagamento_pendente' | 'ativa' | 'tolerancia'
  | 'cancelada_vigente' | 'expirada' | 'admin' | 'teste'

export const ROTULO_ESTADO: Record<EstadoAcesso, { texto: string; cor: 'green' | 'yellow' | 'red' | 'zinc' | 'blue' }> = {
  visitante: { texto: 'Visitante', cor: 'zinc' },
  sem_assinatura: { texto: 'Sem assinatura', cor: 'zinc' },
  pagamento_pendente: { texto: 'Pagamento pendente', cor: 'yellow' },
  ativa: { texto: 'Assinatura ativa', cor: 'green' },
  tolerancia: { texto: 'Pagamento em atraso (acesso temporário)', cor: 'yellow' },
  cancelada_vigente: { texto: 'Cancelada — acesso até o fim do período', cor: 'blue' },
  expirada: { texto: 'Assinatura expirada', cor: 'red' },
  admin: { texto: 'Administrador', cor: 'blue' },
  teste: { texto: 'Teste grátis', cor: 'blue' },
}

export const ROTULO_PAGAMENTO: Record<string, { texto: string; cor: 'green' | 'yellow' | 'red' | 'zinc' | 'blue' }> = {
  aprovado: { texto: 'Aprovado', cor: 'green' },
  pendente: { texto: 'Pendente', cor: 'yellow' },
  recusado: { texto: 'Recusado', cor: 'red' },
  estornado: { texto: 'Estornado', cor: 'blue' },
  cancelado: { texto: 'Cancelado', cor: 'zinc' },
  em_disputa: { texto: 'Em disputa', cor: 'red' },
}

/** Senha forte o suficiente: 8+ caracteres, com letras e números. */
export function validarSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.'
  if (senha.length > 72) return 'A senha deve ter no máximo 72 caracteres.'
  return null
}

export const validarEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

/** Traduz mensagens do Supabase Auth para português. */
export function traduzirErroAuth(msg: string): string {
  if (/Invalid login/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada e o spam.'
  if (/already registered|already been registered/i.test(msg)) return 'Este e-mail já está cadastrado.'
  if (/rate limit|too many|security purposes/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  // Antes da regra de senha fraca: "New password should be different..." também casa com /Password should be/
  if (/same.*password|different from the old/i.test(msg)) return 'A nova senha deve ser diferente da atual.'
  if (/Password should be|weak/i.test(msg)) return 'Senha fraca. Use pelo menos 8 caracteres com letras e números.'
  if (/invalid.*email|email.*invalid/i.test(msg)) return 'E-mail inválido.'
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return msg
}

/** Dias restantes (arredondados para cima) até uma data; 0 se já passou. */
export function diasRestantes(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = Date.parse(iso) - Date.now()
  return ms > 0 ? Math.ceil(ms / 86400000) : 0
}

/** CPF com dígitos verificadores válidos. */
export function cpfValido(valor: string): boolean {
  const c = valor.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/** 52998224725 → 529.982.247-25 (enquanto digita). */
export function mascaraCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}
