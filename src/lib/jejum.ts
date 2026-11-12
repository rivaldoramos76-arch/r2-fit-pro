// Jejum: guardado nas preferências da pessoa; no app Android, alarme no fim do jejum.
import { carregarPrefsApp, salvarPrefApp } from './prefsApp'
import { lembretesNativo } from './nativo'
import { normalizarJejum, type DadosJejum } from './jejumBase'

export async function carregarJejum(userId: string): Promise<DadosJejum> {
  return normalizarJejum((await carregarPrefsApp(userId)).jejum)
}

export async function salvarJejum(userId: string, d: DadosJejum): Promise<void> {
  await salvarPrefApp(userId, 'jejum', d)
  avisoFimJejum(d).catch(() => {})
}

/** App Android (1.9+): aviso no fim do jejum (uma vez só). Sem jejum ativo, apaga o aviso. */
async function avisoFimJejum(d: DadosJejum) {
  const n = lembretesNativo()
  if (!n) return
  const itens: { id: string; data: string; hora: number; minuto: number; url: string; titulo: string; corpo: string }[] = []
  if (d.ativo) {
    const fim = new Date(Date.parse(d.ativo.inicio) + d.ativo.horas * 3_600_000)
    const data = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`
    itens.push({ id: 'jejum', data, hora: fim.getHours(), minuto: fim.getMinutes(), url: '/jejum',
      titulo: `Jejum de ${d.ativo.horas}h concluído 🎉`, corpo: 'Toque para encerrar e registrar o seu jejum.' })
  }
  await Promise.resolve().then(() => n.agendarRotina({ grupo: 'jejum', itens }))
}
