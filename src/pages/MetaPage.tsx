import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, AlertTriangle, Pencil } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ATIVIDADES, OBJETIVOS, RITMOS, calcularMeta, idadeEm, ajustarPorCalorias, ajustarPorMacro, percentuais } from '../lib/metas'
import type { Atividade, Objetivo, Sexo } from '../lib/metas'
import { useMeta, salvarMeta } from '../lib/nutricao'
import { Button, Input, Spinner } from '../components/UI'
import { useContagem, fmt } from '../components/nutricao/Graficos'

const ICONE_OBJETIVO: Record<Objetivo, string> = { perder: '🔥', manter: '⚖️', ganhar: '💪' }

function Opcao({ ativa, onClick, titulo, descricao, icone }: { ativa: boolean; onClick: () => void; titulo: string; descricao?: string; icone?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativa}
      className={`w-full flex items-center gap-3 text-left rounded-2xl border px-4 py-3.5 transition active:scale-[0.99] ${ativa ? 'border-green-500 bg-green-500/10' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'}`}>
      {icone && <span className="text-2xl shrink-0" aria-hidden>{icone}</span>}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-zinc-100">{titulo}</span>
        {descricao && <span className="block text-sm text-zinc-400 mt-0.5">{descricao}</span>}
      </span>
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${ativa ? 'border-green-500 bg-green-500' : 'border-zinc-600'}`}>
        {ativa && <Check className="w-3 h-3 text-zinc-950" strokeWidth={3} />}
      </span>
    </button>
  )
}

const numero = (s: string) => Number(s.replace(',', '.'))
/** Calorias e gramas são inteiros: ignora pontos, vírgulas e espaços ("2.300" = 2300). */
const inteiro = (s: string) => (s.replace(/\D/g, '') === '' ? NaN : Number(s.replace(/\D/g, '')))

export default function MetaPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { meta, carregando } = useMeta(user?.id)
  const [passo, setPasso] = useState(0)
  const [objetivo, setObjetivo] = useState<Objetivo>('perder')
  const [sexo, setSexo] = useState<Sexo | null>(null)
  const [nascimento, setNascimento] = useState('')
  const [altura, setAltura] = useState('')
  const [peso, setPeso] = useState('')
  const [atividade, setAtividade] = useState<Atividade>('leve')
  const [ritmo, setRitmo] = useState(0.5)
  const [manual, setManual] = useState<null | { calorias: string; proteina_g: string; carboidrato_g: string; gordura_g: string }>(null)
  const [somarExercicio, setSomarExercicio] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Preenche com a meta salva (abre direto no resultado) ou com a data de nascimento do perfil
  useEffect(() => {
    if (carregando || !user) return
    if (meta) {
      setObjetivo(meta.objetivo); setSexo(meta.sexo); setNascimento(meta.nascimento)
      setAltura(String(meta.altura_cm).replace('.', ',')); setPeso(String(meta.peso_kg).replace('.', ','))
      setAtividade(meta.atividade); setRitmo(meta.ritmo_kg_semana || 0.5); setSomarExercicio(meta.somar_exercicio)
      if (meta.personalizada) setManual({ calorias: String(meta.calorias), proteina_g: String(meta.proteina_g), carboidrato_g: String(meta.carboidrato_g), gordura_g: String(meta.gordura_g) })
      setPasso(4)
    } else {
      supabase.from('profiles').select('data_nascimento').eq('id', user.id).maybeSingle()
        .then(({ data }) => { if (data?.data_nascimento) setNascimento(d => d || data.data_nascimento) })
    }
  }, [carregando, meta, user])

  const idade = nascimento ? idadeEm(nascimento) : NaN
  const alturaN = numero(altura), pesoN = numero(peso)
  const dadosValidos = !!sexo && idade >= 14 && idade <= 100 && alturaN >= 100 && alturaN <= 250 && pesoN >= 30 && pesoN <= 350
  const calculada = useMemo(() => dadosValidos
    ? calcularMeta({ sexo: sexo!, idade, altura_cm: alturaN, peso_kg: pesoN, atividade, objetivo, ritmo_kg_semana: ritmo })
    : null, [dadosValidos, sexo, idade, alturaN, pesoN, atividade, objetivo, ritmo])

  const final = manual
    ? { calorias: inteiro(manual.calorias), proteina_g: inteiro(manual.proteina_g), carboidrato_g: inteiro(manual.carboidrato_g), gordura_g: inteiro(manual.gordura_g) }
    : calculada
  const manualValido = !manual || (final!.calorias >= 800 && final!.calorias <= 6000 && [final!.proteina_g, final!.carboidrato_g, final!.gordura_g].every(v => Number.isFinite(v) && v >= 0))

  const temRitmo = objetivo !== 'manter'
  const avancar = () => setPasso(p => (p === 2 && !temRitmo ? 4 : p + 1))
  const voltar = () => (passo === 0 ? navigate(-1) : setPasso(p => (p === 4 && !temRitmo ? 2 : p - 1)))

  const salvar = async () => {
    if (!user || !final || !calculada) return
    setErro(''); setSalvando(true)
    try {
      await salvarMeta({
        user_id: user.id, sexo: sexo!, nascimento, altura_cm: alturaN, peso_kg: pesoN, atividade, objetivo,
        ritmo_kg_semana: temRitmo ? ritmo : 0, ...final, personalizada: !!manual, somar_exercicio: somarExercicio,
      })
      // Leva a data de nascimento para o perfil, se ainda não estiver lá
      await supabase.from('profiles').update({ data_nascimento: nascimento }).eq('id', user.id).is('data_nascimento', null)
      navigate('/dashboard')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar')
      setSalvando(false)
    }
  }

  if (carregando) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const totalPassos = temRitmo ? 5 : 4
  const passoVisivel = !temRitmo && passo === 4 ? 3 : passo
  const titulos = ['Qual é o seu objetivo?', 'Sobre você', 'Como é a sua rotina?', objetivo === 'perder' ? 'Quanto quer perder por semana?' : 'Quanto quer ganhar por semana?', 'Sua meta diária']

  return (
    <div className="flex flex-col gap-5 min-h-[70vh]">
      <div className="flex items-center gap-3">
        <button onClick={voltar} aria-label="Voltar" className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full barra-progresso" style={{ width: `${((passoVisivel + 1) / totalPassos) * 100}%` }} />
        </div>
        <span className="text-xs text-zinc-500 tabular-nums w-8 text-right">{passoVisivel + 1}/{totalPassos}</span>
      </div>

      <div key={passo} className="flex flex-col gap-3 animate-fade-up">
        <h1 className="text-2xl font-bold text-zinc-50">{titulos[passo]}</h1>

        {passo === 0 && OBJETIVOS.map(o => (
          <Opcao key={o.valor} ativa={objetivo === o.valor} onClick={() => setObjetivo(o.valor)} titulo={o.rotulo} descricao={o.descricao} icone={ICONE_OBJETIVO[o.valor]} />
        ))}

        {passo === 1 && (
          <>
            <p className="text-sm text-zinc-400 -mt-1">Usamos esses dados só para calcular o seu gasto diário.</p>
            <div>
              <p className="text-sm font-medium text-zinc-300 mb-1.5">Sexo biológico</p>
              <div className="grid grid-cols-2 gap-2">
                {(['feminino', 'masculino'] as Sexo[]).map(s => (
                  <button key={s} type="button" onClick={() => setSexo(s)} aria-pressed={sexo === s}
                    className={`rounded-xl border py-3 font-semibold capitalize transition ${sexo === s ? 'border-green-500 bg-green-500/10 text-green-300' : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'}`}>{s}</button>
                ))}
              </div>
            </div>
            <Input label="Data de nascimento" type="date" value={nascimento} onChange={e => setNascimento(e.target.value)}
              error={nascimento && !(idade >= 14 && idade <= 100) ? 'Idade entre 14 e 100 anos' : undefined} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Altura (cm)" inputMode="numeric" placeholder="170" value={altura} onChange={e => setAltura(e.target.value)}
                error={altura && !(alturaN >= 100 && alturaN <= 250) ? 'Entre 100 e 250' : undefined} />
              <Input label="Peso (kg)" inputMode="decimal" placeholder="70,5" value={peso} onChange={e => setPeso(e.target.value)}
                error={peso && !(pesoN >= 30 && pesoN <= 350) ? 'Entre 30 e 350' : undefined} />
            </div>
          </>
        )}

        {passo === 2 && ATIVIDADES.map(a => (
          <Opcao key={a.valor} ativa={atividade === a.valor} onClick={() => setAtividade(a.valor)} titulo={a.rotulo} descricao={a.descricao} />
        ))}

        {passo === 3 && temRitmo && (
          <>
            <p className="text-sm text-zinc-400 -mt-1">Um ritmo moderado é mais fácil de manter.</p>
            {RITMOS[objetivo].map(r => (
              <Opcao key={r} ativa={ritmo === r} onClick={() => setRitmo(r)}
                titulo={`${String(r).replace('.', ',')} kg por semana`}
                descricao={`${objetivo === 'perder' ? '−' : '+'}${fmt(r * 1100)} kcal por dia${r === 0.5 && objetivo === 'perder' ? ' · recomendado' : r === 0.25 && objetivo === 'ganhar' ? ' · recomendado' : ''}`} />
            ))}
          </>
        )}

        {passo === 4 && final && (
          <Resultado final={final} gasto={calculada?.gasto ?? 0} abaixoDoMinimo={!manual && !!calculada?.abaixoDoMinimo}
            manual={manual} setManual={setManual}
            somarExercicio={somarExercicio} setSomarExercicio={setSomarExercicio} refazer={() => { setManual(null); setPasso(0) }} />
        )}
        {erro && <p className="text-sm text-red-400">{erro}</p>}
      </div>

      <div className="mt-auto pt-2">
        {passo < 4
          ? <Button size="lg" className="w-full" disabled={passo === 1 && !dadosValidos} onClick={avancar}>Continuar</Button>
          : <Button size="lg" className="w-full" loading={salvando} disabled={!manualValido || !final} onClick={salvar}>Salvar minha meta</Button>}
      </div>
    </div>
  )
}

type Valores = { calorias: number; proteina_g: number; carboidrato_g: number; gordura_g: number }

function Resultado({ final, gasto, abaixoDoMinimo, manual, setManual, somarExercicio, setSomarExercicio, refazer }: {
  final: Valores; gasto: number; abaixoDoMinimo: boolean
  manual: null | Record<keyof Valores, string>; setManual: (m: null | Record<keyof Valores, string>) => void
  somarExercicio: boolean; setSomarExercicio: (v: boolean) => void; refazer: () => void
}) {
  const kcal = useContagem(final.calorias, 1100)
  const pct = percentuais(final)
  // Proporção de referência: mudar as calorias redistribui os macros a partir dela
  // (evita perder a proporção enquanto a pessoa digita número por número)
  const base = useRef<Omit<Valores, 'calorias'>>(final)
  const texto = (v: Valores) => ({ calorias: String(v.calorias), proteina_g: String(v.proteina_g), carboidrato_g: String(v.carboidrato_g), gordura_g: String(v.gordura_g) })
  const mudarCalorias = (t: string) => {
    const n = inteiro(t)
    if (!manual) return
    if (!(n > 0)) { setManual({ ...manual, calorias: t }); return }
    setManual({ ...texto(ajustarPorCalorias(base.current, n)), calorias: t })
  }
  const mudarMacro = (k: Exclude<keyof Valores, 'calorias'>, t: string) => {
    if (!manual) return
    const n = inteiro(t)
    const atual = { calorias: inteiro(manual.calorias) || 0, proteina_g: inteiro(manual.proteina_g) || 0, carboidrato_g: inteiro(manual.carboidrato_g) || 0, gordura_g: inteiro(manual.gordura_g) || 0 }
    const novo = ajustarPorMacro(atual, k, n >= 0 ? n : 0)
    base.current = { proteina_g: novo.proteina_g, carboidrato_g: novo.carboidrato_g, gordura_g: novo.gordura_g }
    setManual({ ...texto(novo), [k]: t })
  }
  const macros: [keyof Valores, string, string][] = [['carboidrato_g', 'Carboidrato', 'text-lime-400'], ['proteina_g', 'Proteína', 'text-emerald-400'], ['gordura_g', 'Gordura', 'text-amber-400']]
  return (
    <>
      <div className="relative overflow-hidden rounded-3xl border border-green-500/25 bg-gradient-to-br from-green-500/15 via-zinc-900 to-zinc-950 p-6 text-center">
        <p className="text-sm text-zinc-400">Calorias por dia</p>
        <p className="text-6xl font-extrabold tracking-tight text-green-400 tabular-nums mt-1">{fmt(kcal)}</p>
        {gasto > 0 && !manual && <p className="text-xs text-zinc-500 mt-2">Seu gasto estimado: {fmt(gasto)} kcal/dia</p>}
        {manual && <p className="text-xs text-zinc-500 mt-2">Meta ajustada por você</p>}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {macros.map(([k, r, c]) => (
            <div key={k} className="bg-zinc-950/50 rounded-2xl py-3">
              <p className={`text-xl font-bold tabular-nums ${c}`}>{fmt(final[k])}g</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{r} · {pct[k as Exclude<keyof Valores, 'calorias'>]}%</p>
            </div>
          ))}
        </div>
      </div>

      {abaixoDoMinimo && (
        <div className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Limitamos sua meta ao mínimo seguro. Para metas menores, procure acompanhamento de um nutricionista.</p>
        </div>
      )}

      {manual ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 animate-fade-up">
          <Input label="Calorias (kcal)" inputMode="numeric" value={manual.calorias} onChange={e => mudarCalorias(e.target.value)}
            error={!(final.calorias >= 800 && final.calorias <= 6000) ? 'Entre 800 e 6.000 kcal' : undefined} />
          <div className="grid grid-cols-3 gap-2">
            {macros.map(([k, r]) => <Input key={k} label={`${r} (g)`} inputMode="numeric" value={manual[k]} onChange={e => mudarMacro(k as Exclude<keyof Valores, 'calorias'>, e.target.value)} />)}
          </div>
          <p className="text-xs text-zinc-500">Mudou as calorias? Os macros acompanham na mesma proporção. Mudou um macro? As calorias são recalculadas.</p>
          <button type="button" onClick={() => setManual(null)} className="text-sm text-green-400 self-start">Voltar ao cálculo automático</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => { base.current = final; setManual(texto(final)) }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-3 text-sm font-semibold text-zinc-200 hover:border-zinc-600"><Pencil className="w-4 h-4" />Ajustar valores</button>
          <button type="button" onClick={refazer} className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 py-3 text-sm font-semibold text-zinc-200 hover:border-zinc-600">Refazer cálculo</button>
        </div>
      )}

      <label className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 cursor-pointer">
        <span className="flex-1">
          <span className="block text-sm font-semibold text-zinc-100">Somar calorias do exercício à meta</span>
          <span className="block text-xs text-zinc-400 mt-0.5">Desligado: sua meta fica fixa, mesmo nos dias de treino (recomendado).</span>
        </span>
        <input type="checkbox" className="sr-only peer" checked={somarExercicio} onChange={e => setSomarExercicio(e.target.checked)} />
        <span aria-hidden className="relative w-11 h-6 rounded-full bg-zinc-700 peer-checked:bg-green-500 transition shrink-0 after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
      </label>
    </>
  )
}
