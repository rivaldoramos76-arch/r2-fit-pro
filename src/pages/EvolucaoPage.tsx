import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Ruler, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { redimensionarImagem } from '../lib/imagem'
import { dataLocalHoje } from '../lib/treinoModel'
import { Spinner } from '../components/UI'

// Evolução: medidas do corpo e fotos de antes e depois (fotos num armazenamento privado: só a própria pessoa vê).

const CAMPOS = [
  ['cintura_cm', 'Cintura', 'cm'], ['quadril_cm', 'Quadril', 'cm'], ['peito_cm', 'Peito', 'cm'], ['braco_cm', 'Braço', 'cm'],
  ['coxa_cm', 'Coxa', 'cm'], ['panturrilha_cm', 'Panturrilha', 'cm'], ['gordura_pct', 'Gordura', '%'],
] as const
type Campo = typeof CAMPOS[number][0]
type Medida = { id: string; data: string } & Partial<Record<Campo, number | null>>
type Foto = { id: string; data: string; pose: 'frente' | 'lado' | 'costas'; caminho: string; url?: string }
const POSES = [['frente', 'Frente'], ['lado', 'Lado'], ['costas', 'Costas']] as const

const dataCurta = (iso: string) => iso.split('-').reverse().join('/')
const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function EvolucaoPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [aba, setAba] = useState<'medidas' | 'fotos'>('medidas')
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar">←</button>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Evolução</h1>
          <p className="text-sm text-zinc-500">Medidas e fotos de antes e depois. Só você vê.</p>
        </div>
      </div>
      <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
        {([['medidas', 'Medidas', Ruler], ['fotos', 'Fotos', Camera]] as const).map(([k, r, I]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold ${aba === k ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400'}`}><I className="w-4 h-4" />{r}</button>
        ))}
      </div>
      {user && (aba === 'medidas' ? <Medidas userId={user.id} /> : <Fotos userId={user.id} />)}
    </div>
  )
}

function Medidas({ userId }: { userId: string }) {
  const [lista, setLista] = useState<Medida[] | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ data: dataLocalHoje() })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const carregar = useCallback(() => {
    supabase.from('medidas_corporais').select('*').eq('user_id', userId).order('data', { ascending: false }).limit(100)
      .then(({ data }) => setLista(((data ?? []) as Medida[]).map(m => ({ ...m, ...Object.fromEntries(CAMPOS.map(([c]) => [c, num(m[c])])) }))))
  }, [userId])
  useEffect(() => { carregar() }, [carregar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    const valores = Object.fromEntries(CAMPOS.map(([c]) => [c, form[c] ? Number(form[c].replace(',', '.')) : null]))
    if (Object.values(valores).every(v => v == null)) { setErro('Preencha pelo menos uma medida.'); return }
    if (Object.values(valores).some(v => v != null && !Number.isFinite(v))) { setErro('Use só números (ex.: 82,5).'); return }
    setSalvando(true)
    const { error } = await supabase.from('medidas_corporais').upsert({ user_id: userId, data: form.data, ...valores }, { onConflict: 'user_id,data' })
    setSalvando(false)
    if (error) { setErro(error.message.includes('check') ? 'Alguma medida está fora do normal. Confira os números.' : 'Não foi possível salvar. Tente de novo.'); return }
    setForm({ data: dataLocalHoje() }); carregar()
  }
  async function apagar(id: string) {
    if (!confirm('Apagar estas medidas?')) return
    await supabase.from('medidas_corporais').delete().eq('id', id); carregar()
  }

  const primeira = lista?.[lista.length - 1]
  return (
    <>
      <form onSubmit={salvar} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3" aria-label="Novas medidas">
        <label className="flex items-center justify-between gap-3 text-sm text-zinc-300">Data
          <input type="date" value={form.data} max={dataLocalHoje()} onChange={e => e.target.value && setForm(f => ({ ...f, data: e.target.value }))}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CAMPOS.map(([c, r, u]) => (
            <label key={c} className="flex flex-col gap-1 text-xs text-zinc-400">{r} ({u})
              <input inputMode="decimal" value={form[c] ?? ''} onChange={e => setForm(f => ({ ...f, [c]: e.target.value }))} aria-label={r}
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-100" placeholder="—" />
            </label>
          ))}
        </div>
        {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
        <button disabled={salvando} className="py-2.5 rounded-xl text-sm font-bold bg-green-500 text-zinc-950 disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar medidas'}</button>
        <p className="text-[11px] text-zinc-500">Meça sempre do mesmo jeito: de manhã, em jejum, com a fita sem apertar.</p>
      </form>

      {!lista ? <div className="flex justify-center py-6"><Spinner /></div> : lista.length > 0 && (
        <section aria-label="Histórico de medidas" className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <ul className="divide-y divide-zinc-800/70">
            {lista.map(m => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-100">{dataCurta(m.data)}</span>
                  <button onClick={() => apagar(m.id)} aria-label={`Apagar medidas de ${dataCurta(m.data)}`} className="p-1 text-zinc-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-zinc-400">
                  {CAMPOS.filter(([c]) => m[c] != null).map(([c, r, u]) => {
                    const dif = primeira && primeira.id !== m.id && primeira[c] != null ? (m[c] as number) - (primeira[c] as number) : null
                    return <span key={c}>{r} <b className="text-zinc-200">{fmt(m[c] as number)}{u}</b>{dif ? <span className={dif < 0 ? 'text-green-400' : 'text-amber-400'}> ({dif > 0 ? '+' : ''}{fmt(dif)})</span> : null}</span>
                  })}
                </div>
              </li>
            ))}
          </ul>
          {lista.length > 1 && <p className="px-4 pb-3 text-[11px] text-zinc-500">Entre parênteses: diferença desde a primeira medida ({dataCurta(primeira!.data)}).</p>}
        </section>
      )}
    </>
  )
}

function Fotos({ userId }: { userId: string }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null)
  const [pose, setPose] = useState<Foto['pose']>('frente')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [comparar, setComparar] = useState<{ antes?: string; depois?: string }>({})

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('fotos_evolucao').select('*').eq('user_id', userId).order('data', { ascending: false }).limit(120)
    const lista = (data ?? []) as Foto[]
    if (lista.length) {
      const { data: urls } = await supabase.storage.from('evolucao').createSignedUrls(lista.map(f => f.caminho), 3600)
      const porCaminho = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
      lista.forEach(f => { f.url = porCaminho.get(f.caminho) ?? undefined })
    }
    setFotos(lista)
  }, [userId])
  useEffect(() => { carregar().catch(() => setFotos([])) }, [carregar])

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(''); setEnviando(true)
    try {
      const blob = await (await fetch(await redimensionarImagem(arquivo, 1280, 0.82))).blob()
      const data = dataLocalHoje()
      const caminho = `${userId}/${data}-${pose}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const up = await supabase.storage.from('evolucao').upload(caminho, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error } = await supabase.from('fotos_evolucao').insert({ user_id: userId, data, pose, caminho })
      if (error) { await supabase.storage.from('evolucao').remove([caminho]); throw error }
      await carregar()
    } catch { setErro('Não foi possível enviar a foto. Tente de novo.') }
    setEnviando(false)
  }
  async function apagar(f: Foto) {
    if (!confirm('Apagar esta foto?')) return
    await supabase.storage.from('evolucao').remove([f.caminho])
    await supabase.from('fotos_evolucao').delete().eq('id', f.id)
    carregar()
  }

  const datas = useMemo(() => [...new Set((fotos ?? []).filter(f => f.pose === pose).map(f => f.data))], [fotos, pose])
  const fotoDe = (data?: string) => fotos?.find(f => f.pose === pose && f.data === data)
  const antes = fotoDe(comparar.antes ?? datas[datas.length - 1])
  const depois = fotoDe(comparar.depois ?? datas[0])

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <div role="group" aria-label="Pose" className="flex gap-2">
          {POSES.map(([k, r]) => (
            <button key={k} type="button" aria-pressed={pose === k} onClick={() => { setPose(k); setComparar({}) }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${pose === k ? 'bg-green-500/10 border-green-500/40 text-green-400' : 'bg-zinc-800 border-zinc-700 text-zinc-300'}`}>{r}</button>
          ))}
        </div>
        <label className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${enviando ? 'bg-zinc-800 text-zinc-500' : 'bg-green-500 text-zinc-950'}`}>
          <Camera className="w-4 h-4" />{enviando ? 'Enviando…' : `Adicionar foto de hoje (${POSES.find(p => p[0] === pose)![1].toLowerCase()})`}
          <input type="file" accept="image/*" className="hidden" disabled={enviando} onChange={e => { enviar(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
        <p className="text-[11px] text-zinc-500">Dica: mesma luz, mesmo lugar e mesma distância. As fotos ficam guardadas só para você.</p>
      </div>

      {!fotos ? <div className="flex justify-center py-6"><Spinner /></div> : datas.length > 1 && antes && depois && (
        <section aria-label="Antes e depois" className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
          <div className="grid grid-cols-2 gap-2">
            {([['antes', antes], ['depois', depois]] as const).map(([k, f]) => (
              <div key={k} className="flex flex-col gap-1">
                <select value={f.data} onChange={e => setComparar(c => ({ ...c, [k]: e.target.value }))} aria-label={k === 'antes' ? 'Data do antes' : 'Data do depois'}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200">
                  {datas.map(d => <option key={d} value={d}>{k === 'antes' ? 'Antes' : 'Depois'}: {dataCurta(d)}</option>)}
                </select>
                {f.url && <img src={f.url} alt={`${k === 'antes' ? 'Antes' : 'Depois'} em ${dataCurta(f.data)}`} className="w-full aspect-[3/4] object-cover rounded-lg bg-zinc-800" />}
              </div>
            ))}
          </div>
        </section>
      )}

      {fotos && fotos.filter(f => f.pose === pose).length > 0 && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Fotos">
          {fotos.filter(f => f.pose === pose).map(f => (
            <li key={f.id} className="relative">
              {f.url && <img src={f.url} alt={`Foto de ${dataCurta(f.data)}`} loading="lazy" className="w-full aspect-[3/4] object-cover rounded-lg bg-zinc-800" />}
              <span className="absolute left-1 bottom-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white">{dataCurta(f.data).slice(0, 5)}</span>
              <button onClick={() => apagar(f)} aria-label={`Apagar foto de ${dataCurta(f.data)}`} className="absolute right-1 top-1 p-1 rounded bg-black/60 text-white"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {fotos && fotos.length === 0 && <p className="text-sm text-zinc-500 text-center">Nenhuma foto ainda. A primeira vira o seu "antes".</p>}
    </>
  )
}
