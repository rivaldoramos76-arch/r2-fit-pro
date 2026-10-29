import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { X, Gift, CalendarPlus, Ban, HandCoins, Trash2 } from 'lucide-react'
import { chamarApi, ErroApi } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { brl, dataBR, dataHoraBR, ROTULO_ESTADO, ROTULO_PAGAMENTO, type EstadoAcesso } from '../../lib/formatos'
import { Badge, Button, Input, Select } from '../../components/UI'
import { Erro, msgErro } from './comum'

export interface ResumoCliente { id: string; nome: string | null; email: string; criado_em: string; ultimo_login: string | null; email_confirmado: boolean; estado: EstadoAcesso; admin: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Acao = null | 'cortesia' | 'estender' | 'encerrar' | 'pagamento_manual'

const MODALIDADE: Record<string, string> = { recorrente: 'Recorrente (cartão)', avulso: 'Pagamento único', cortesia: 'Cortesia', teste: 'Teste grátis' }

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-3">{titulo}</h3>
      {children}
    </section>
  )
}

/** Ficha do cliente no painel: dados, acesso, assinaturas, pagamentos e ações manuais. */
export default function Cliente({ resumo, onClose, onAlterado }: { resumo: ResumoCliente; onClose: () => void; onAlterado: () => void }) {
  const [estado, setEstado] = useState<EstadoAcesso>(resumo.estado)
  const [perfil, setPerfil] = useState<Linha | null>(null)
  const [assinaturas, setAssinaturas] = useState<Linha[]>([])
  const [pagamentos, setPagamentos] = useState<Linha[]>([])
  const [uso, setUso] = useState<{ treinos: number; dietas: number; alimentos: number }>({ treinos: 0, dietas: 0, alimentos: 0 })
  const [acao, setAcao] = useState<Acao>(null)
  const [form, setForm] = useState({ ate: '', vitalicio: true, dias: '30', meses: '1', valor: '19,90', observacao: '' })
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [apagar, setApagar] = useState<null | string>(null)
  const [apagando, setApagando] = useState(false)

  const carregar = useCallback(async () => {
    const id = resumo.id
    const contar = (t: 'treinos' | 'dietas' | 'food_logs') => supabase.from(t).select('id', { count: 'exact', head: true }).eq('user_id', id)
    const [p, s, pg, t, d, f] = await Promise.all([
      supabase.from('profiles').select('nome, telefone, data_nascimento, created_at').eq('id', id).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('user_id', id).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('user_id', id).order('created_at', { ascending: false }),
      contar('treinos'), contar('dietas'), contar('food_logs'),
    ])
    setPerfil(p.data); setAssinaturas(s.data ?? []); setPagamentos(pg.data ?? [])
    setUso({ treinos: t.count ?? 0, dietas: d.count ?? 0, alimentos: f.count ?? 0 })
  }, [resumo.id])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const executar = async (nome: string, dados: Record<string, unknown>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return
    setErro(''); setAviso(''); setExecutando(true)
    const { data, error } = await supabase.rpc('admin_gerenciar_acesso', { p_user: resumo.id, p_acao: nome, p: dados })
    setExecutando(false)
    if (error) { setErro(msgErro(error)); return }
    const r = data as { estado?: EstadoAcesso; aviso?: string; acesso_ate?: string }
    if (r?.estado) setEstado(r.estado)
    setAviso(r?.aviso ?? `Feito.${r?.acesso_ate ? ` Acesso até ${dataBR(r.acesso_ate)}.` : ''}`)
    setAcao(null)
    await carregar(); onAlterado()
  }

  const apagarConta = async () => {
    setErro(''); setApagando(true)
    try {
      await chamarApi('admin', { acao: 'excluir_usuario', user_id: resumo.id, confirmacao: apagar })
      onAlterado(); onClose()
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível apagar a conta.')
      setApagando(false)
    }
  }

  const centavos = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100)
  const rotulo = ROTULO_ESTADO[estado] ?? { texto: estado, cor: 'zinc' as const }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`Cliente ${resumo.email}`} onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl h-full overflow-y-auto bg-zinc-950 border-l border-zinc-800 animate-fade-in">
        <header className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{perfil?.nome ?? resumo.nome ?? 'Sem nome'}{resumo.admin && <Badge variant="blue" className="ml-2">admin</Badge>}</p>
            <p className="text-sm text-zinc-400 break-all">{resumo.email}</p>
            <Badge variant={rotulo.cor} className="mt-1.5">{rotulo.texto}</Badge>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-lg hover:bg-zinc-800"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-4 flex flex-col gap-4">
          {aviso && <p role="status" className="text-sm text-green-300 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">{aviso}</p>}
          <Erro texto={erro} />

          <Bloco titulo="Ações de acesso">
            <div className="grid grid-cols-2 gap-2">
              {([
                ['cortesia', 'Liberar acesso', Gift], ['estender', 'Estender acesso', CalendarPlus],
                ['pagamento_manual', 'Registrar pagamento', HandCoins], ['encerrar', 'Encerrar acesso', Ban],
              ] as const).map(([id, r, Icone]) => (
                <button key={id} type="button" onClick={() => { setAcao(acao === id ? null : id); setErro('') }} aria-pressed={acao === id}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold text-left transition ${acao === id ? 'border-green-500 bg-green-500/10 text-green-300' : id === 'encerrar' ? 'border-zinc-800 text-red-300 hover:border-red-500/40' : 'border-zinc-800 text-zinc-200 hover:border-zinc-600'}`}>
                  <Icone className="w-4 h-4 shrink-0" />{r}
                </button>
              ))}
            </div>

            {acao === 'cortesia' && (
              <div className="mt-4 flex flex-col gap-3 animate-fade-up">
                <p className="text-xs text-zinc-400">Acesso Premium sem cobrança (amigos, família, parceiros).</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.vitalicio} onChange={e => setForm({ ...form, vitalicio: e.target.checked })} className="accent-green-500 w-4 h-4" />Sem data de término (vitalício)</label>
                {!form.vitalicio && <Input label="Acesso até" type="date" value={form.ate} onChange={e => setForm({ ...form, ate: e.target.value })} />}
                <Button loading={executando} disabled={!form.vitalicio && !form.ate} onClick={() => executar('cortesia', { ate: form.vitalicio ? null : form.ate })}>Liberar acesso</Button>
              </div>
            )}
            {acao === 'estender' && (
              <div className="mt-4 flex flex-col gap-3 animate-fade-up">
                <p className="text-xs text-zinc-400">Soma dias ao acesso que o cliente já tem (ex.: compensar um problema).</p>
                <Input label="Dias a mais" inputMode="numeric" value={form.dias} onChange={e => setForm({ ...form, dias: e.target.value.replace(/\D/g, '') })} />
                <Button loading={executando} disabled={!Number(form.dias)} onClick={() => executar('estender', { dias: Number(form.dias) })}>Estender {form.dias || 0} dia(s)</Button>
              </div>
            )}
            {acao === 'pagamento_manual' && (
              <div className="mt-4 flex flex-col gap-3 animate-fade-up">
                <p className="text-xs text-zinc-400">Para pagamentos recebidos fora do app (Pix direto, dinheiro). Libera o acesso e envia o e-mail de confirmação.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Select label="Período" value={form.meses} onChange={e => setForm({ ...form, meses: e.target.value, valor: e.target.value === '12' ? '199,00' : '19,90' })}>
                    <option value="1">1 mês</option><option value="12">12 meses</option>
                  </Select>
                  <Input label="Valor recebido (R$)" inputMode="decimal" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
                </div>
                <Input label="Observação (opcional)" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} maxLength={200} placeholder="Ex.: Pix recebido em 30/10" />
                <Button loading={executando} disabled={!(centavos(form.valor) >= 100)}
                  onClick={() => executar('pagamento_manual', { meses: Number(form.meses), valor_centavos: centavos(form.valor), observacao: form.observacao }, `Registrar pagamento de ${brl(centavos(form.valor))} e liberar ${form.meses === '12' ? '12 meses' : '1 mês'}?`)}>
                  Registrar e liberar
                </Button>
              </div>
            )}
            {acao === 'encerrar' && (
              <div className="mt-4 flex flex-col gap-3 animate-fade-up">
                <p className="text-xs text-zinc-400">Encerra agora cortesias, testes e pagamentos únicos. Assinatura recorrente precisa ser cancelada no Mercado Pago. Não devolve dinheiro.</p>
                <Button variant="danger" loading={executando} onClick={() => executar('encerrar', {}, 'Encerrar o acesso Premium deste cliente agora?')}>Encerrar acesso agora</Button>
              </div>
            )}
          </Bloco>

          <Bloco titulo="Dados">
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-zinc-500">Cadastro</dt><dd>{dataHoraBR(resumo.criado_em)}</dd>
              <dt className="text-zinc-500">Último acesso</dt><dd>{dataHoraBR(resumo.ultimo_login)}</dd>
              <dt className="text-zinc-500">E-mail</dt><dd>{resumo.email_confirmado ? 'confirmado' : <span className="text-yellow-400">não confirmado</span>}</dd>
              <dt className="text-zinc-500">Telefone</dt><dd>{perfil?.telefone ?? '—'}</dd>
              <dt className="text-zinc-500">Nascimento</dt><dd>{dataBR(perfil?.data_nascimento)}</dd>
              <dt className="text-zinc-500">Uso</dt><dd>{uso.treinos} treino(s) · {uso.dietas} dieta(s) · {uso.alimentos} alimento(s) no diário</dd>
            </dl>
          </Bloco>

          <Bloco titulo={`Assinaturas e acessos (${assinaturas.length})`}>
            {assinaturas.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma.</p> : (
              <ul className="flex flex-col divide-y divide-zinc-800">
                {assinaturas.map(s => (
                  <li key={s.id} className="py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{MODALIDADE[s.modalidade] ?? s.modalidade}</span>
                    <Badge variant={s.status === 'ativa' ? 'green' : s.status === 'pendente' ? 'yellow' : s.status === 'inadimplente' ? 'red' : 'zinc'}>{s.status}</Badge>
                    <span className="text-zinc-400">até {s.periodo_atual_fim && new Date(s.periodo_atual_fim).getFullYear() >= 2099 ? 'vitalício' : dataBR(s.periodo_atual_fim)}</span>
                    {s.modalidade !== 'cortesia' && s.modalidade !== 'teste' && <span className="text-zinc-500">{brl(s.preco_centavos)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo={`Pagamentos (${pagamentos.length})`}>
            {pagamentos.length === 0 ? <p className="text-sm text-zinc-500">Nenhum.</p> : (
              <ul className="flex flex-col divide-y divide-zinc-800">
                {pagamentos.map(p => (
                  <li key={p.id} className="py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="tabular-nums">{dataHoraBR(p.pago_em ?? p.created_at)}</span>
                    <span className="font-semibold">{brl(p.valor_centavos)}</span>
                    <span className="text-zinc-500 text-xs">{p.meses === 12 ? '12 meses' : '1 mês'} · {p.metodo ?? '—'}</span>
                    <label className="ml-auto flex items-center gap-2">
                      <span className="sr-only">Status do pagamento</span>
                      <select value={p.status} disabled={executando}
                        onChange={e => executar('status_pagamento', { payment_id: p.id, status: e.target.value },
                          `Mudar este pagamento de "${ROTULO_PAGAMENTO[p.status]?.texto ?? p.status}" para "${ROTULO_PAGAMENTO[e.target.value]?.texto}"? Isso atualiza o acesso do cliente${e.target.value === 'estornado' ? ' (o dinheiro em si é devolvido pelo Mercado Pago)' : ''}.`)}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs">
                        {['aprovado', 'pendente', 'recusado', 'estornado', 'cancelado'].concat(p.status === 'em_disputa' ? ['em_disputa'] : []).map(st => <option key={st} value={st}>{ROTULO_PAGAMENTO[st]?.texto ?? st}</option>)}
                      </select>
                    </label>
                    {p.status_detalhe && <span className="basis-full text-xs text-zinc-500">{p.status_detalhe}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>
          {!resumo.admin && (
            <Bloco titulo="Apagar conta">
              {apagar === null ? (
                <button type="button" onClick={() => { setApagar(''); setErro('') }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4" />Apagar esta conta
                </button>
              ) : (
                <div className="flex flex-col gap-3 animate-fade-up">
                  <p className="text-xs text-zinc-400">Apaga o cliente e todos os dados pessoais (treinos, dietas, diário, metas). Assinatura recorrente é cancelada no Mercado Pago antes. Pagamentos ficam guardados sem identificação, como exige a lei. <b className="text-red-300">Não dá para desfazer.</b></p>
                  <Input label={`Digite o e-mail do cliente (${resumo.email}) para confirmar`} value={apagar} onChange={e => setApagar(e.target.value)} autoComplete="off" />
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setApagar(null)}>Cancelar</Button>
                    <Button variant="danger" className="flex-1" loading={apagando} disabled={apagar.trim().toLowerCase() !== resumo.email.toLowerCase()} onClick={apagarConta}>Apagar definitivamente</Button>
                  </div>
                </div>
              )}
            </Bloco>
          )}
        </div>
      </aside>
    </div>
  )
}
