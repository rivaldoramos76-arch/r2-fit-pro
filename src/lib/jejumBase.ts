// Jejum intermitente: lógica pura (testada em tests/logica.test.ts).

export interface JejumAtivo { inicio: string; horas: number }
export interface RegistroJejum { inicio: string; fim: string; meta: number }
export interface DadosJejum { ativo: JejumAtivo | null; historico: RegistroJejum[]; protocolo: number }

export const PROTOCOLOS = [12, 14, 16, 18, 20, 24]
export const jejumVazio = (): DadosJejum => ({ ativo: null, historico: [], protocolo: 16 })

export function normalizarJejum(raw: unknown): DadosJejum {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DadosJejum>
  const valida = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s))
  const ativo = r.ativo && valida(r.ativo.inicio) && Number(r.ativo.horas) > 0 ? { inicio: r.ativo.inicio, horas: Math.min(72, Number(r.ativo.horas)) } : null
  const historico = (Array.isArray(r.historico) ? r.historico : []).filter(h => h && valida(h.inicio) && valida(h.fim)).slice(0, 60)
    .map(h => ({ inicio: h.inicio, fim: h.fim, meta: Number(h.meta) || 16 }))
  return { ativo, historico, protocolo: PROTOCOLOS.includes(Number(r.protocolo)) ? Number(r.protocolo) : 16 }
}

/** Situação do jejum agora: horas feitas, quanto falta, fim previsto e a fase. */
export function situacaoJejum(j: JejumAtivo, agora = Date.now()) {
  const inicio = Date.parse(j.inicio)
  const fim = inicio + j.horas * 3_600_000
  const feito = Math.max(0, agora - inicio)
  const horas = feito / 3_600_000
  return {
    horas, fim: new Date(fim), restanteMs: Math.max(0, fim - agora), pct: Math.min(1, feito / (fim - inicio)), concluido: agora >= fim,
    fase: horas < 4 ? 'Digestão da última refeição' : horas < 12 ? 'Corpo usando a energia guardada' : horas < 16 ? 'Mais gordura sendo usada como energia' : horas < 24 ? 'Jejum longo: beba bastante água' : 'Jejum prolongado: só com orientação profissional',
  }
}

/** "16h05" */
export function duracao(ms: number): string {
  const min = Math.floor(ms / 60_000)
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

/** Encerra o jejum ativo e guarda no histórico (mais novo primeiro, até 60). */
export function encerrar(d: DadosJejum, agora = new Date()): DadosJejum {
  if (!d.ativo) return d
  return { ...d, ativo: null, historico: [{ inicio: d.ativo.inicio, fim: agora.toISOString(), meta: d.ativo.horas }, ...d.historico].slice(0, 60) }
}
