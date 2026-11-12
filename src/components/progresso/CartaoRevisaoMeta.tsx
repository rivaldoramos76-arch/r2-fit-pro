import { useEffect, useState } from 'react'
import { Scale } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { salvarMeta, type MetaSalva } from '../../lib/nutricao'
import { historicoPeso } from '../../lib/progresso'
import { ajustarPorCalorias } from '../../lib/metas'
import { revisaoSemanal, segundaDa, type Revisao } from '../../lib/progressoBase'
import { carregarPrefsApp, salvarPrefApp } from '../../lib/prefsApp'
import { dataLocalHoje } from '../../lib/treinoModel'

const somar = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` }

/**
 * Início, uma vez por semana: revisão da meta de calorias pelo que o peso fez com o que a pessoa comeu.
 * Só aparece com dados suficientes (2 pesagens em ~2 semanas e 7 dias de diário). Aplicar ajusta a meta e os macros na mesma proporção.
 */
export default function CartaoRevisaoMeta({ userId, meta, onMudou }: { userId: string; meta: MetaSalva | null; onMudou: () => void }) {
  const [rev, setRev] = useState<Revisao | null>(null)
  const [feito, setFeito] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const hoje = dataLocalHoje()
  const semana = segundaDa(hoje)

  useEffect(() => {
    if (!meta) return
    let vivo = true
    ;(async () => {
      const prefs = await carregarPrefsApp(userId).catch(() => ({} as Record<string, unknown>))
      if ((prefs.revisao_meta as { semana?: string } | undefined)?.semana === semana) return
      const [pesos, { data: logs }] = await Promise.all([
        historicoPeso(userId, somar(hoje, -21)),
        supabase.from('food_logs').select('data, calorias').eq('user_id', userId).gte('data', somar(hoje, -14)).lt('data', hoje),
      ])
      const porDia = new Map<string, number>()
      for (const l of (logs ?? []) as { data: string; calorias: number }[]) porDia.set(l.data, (porDia.get(l.data) ?? 0) + Number(l.calorias || 0))
      const r = revisaoSemanal({ calorias: meta.calorias, objetivo: meta.objetivo, ritmo_kg_semana: meta.ritmo_kg_semana, sexo: meta.sexo,
        pesos, consumo: [...porDia].map(([data, kcal]) => ({ data, kcal })), hoje })
      if (vivo) setRev(r)
    })().catch(() => {})
    return () => { vivo = false }
  }, [userId, meta, hoje, semana])

  if (!meta || (!rev && !feito)) return null
  const fechar = (aplicada: boolean) => salvarPrefApp(userId, 'revisao_meta', { semana, aplicada, sugeridas: rev?.sugeridas ?? null }).catch(() => {})

  async function aplicar() {
    if (!rev || !meta) return
    setOcupado(true)
    try {
      await salvarMeta({ ...meta, ...ajustarPorCalorias(meta, rev.sugeridas), personalizada: true })
      await fechar(true)
      setFeito(`Meta atualizada para ${rev.sugeridas.toLocaleString('pt-BR')} kcal.`); setRev(null); onMudou()
    } catch { setFeito('Não foi possível salvar. Tente de novo.') }
    setOcupado(false)
  }

  if (feito) return <p role="status" className="text-sm text-green-400 px-1">{feito}</p>
  return (
    <section aria-label="Revisão da semana" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-fade-up">
      <h2 className="font-bold text-zinc-50 flex items-center gap-2"><Scale className="w-5 h-5 text-green-400" />Revisão da semana</h2>
      <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{rev!.texto}</p>
      <div className="flex gap-2 mt-4">
        {rev!.tipo === 'ajustar' ? (
          <>
            <button type="button" onClick={() => { fechar(false); setRev(null) }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">Agora não</button>
            <button type="button" disabled={ocupado} onClick={aplicar} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-green-500 text-zinc-950 disabled:opacity-50">
              Usar {rev!.sugeridas.toLocaleString('pt-BR')} kcal
            </button>
          </>
        ) : (
          <button type="button" onClick={() => { fechar(false); setRev(null) }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-zinc-800 text-zinc-200 border border-zinc-700">Entendi</button>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 mt-2">Calculado pelo seu peso e pelo diário. Muda no máximo 250 kcal por semana.</p>
    </section>
  )
}
