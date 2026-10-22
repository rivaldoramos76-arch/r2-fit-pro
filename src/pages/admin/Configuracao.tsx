import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { carregarConfig, type AppConfig } from '../../lib/config'
import { brl } from '../../lib/formatos'
import { Button, Input, Spinner, Textarea } from '../../components/UI'
import { Erro, msgErro } from './comum'

const CAMPOS_EMPRESA: [keyof AppConfig['empresa'], string][] = [
  ['nome_fantasia', 'Nome fantasia'], ['razao_social', 'Nome completo (pessoa física) ou razão social'], ['cnpj', 'CPF ou CNPJ'], ['endereco', 'Endereço completo'],
  ['email_suporte', 'E-mail de suporte'], ['email_privacidade', 'E-mail de privacidade (LGPD)'], ['telefone', 'Telefone'],
  ['encarregado_dados', 'Encarregado de dados (DPO)'], ['foro', 'Foro (cidade/UF)'],
]

export default function Configuracao() {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [preco, setPreco] = useState('')
  const [beneficios, setBeneficios] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    carregarConfig(true).then(c => {
      setCfg(structuredClone(c))
      setPreco((c.plano.preco_centavos / 100).toFixed(2).replace('.', ','))
      setBeneficios(c.plano.beneficios.join('\n'))
    }).catch(e => setErro(msgErro(e)))
  }, [])

  if (!cfg) return erro ? <Erro texto={erro} /> : <div className="flex justify-center py-10"><Spinner /></div>

  const salvar = async (chave: keyof AppConfig, valor: unknown) => {
    setErro(''); setOk(''); setSalvando(chave)
    const { data, error } = await supabase.from('app_config').update({ valor }).eq('chave', chave).select('chave')
    setSalvando(null)
    if (error) return setErro(msgErro(error))
    if (!data?.length) return setErro('Sem permissão para alterar a configuração.')
    await carregarConfig(true)
    setOk('Configuração salva e registrada na auditoria.')
  }

  const salvarPlano = () => {
    const centavos = Math.round(Number(preco.replace(/\./g, '').replace(',', '.')) * 100)
    if (!Number.isInteger(centavos) || centavos < 100) return setErro('Preço inválido.')
    const plano = { ...cfg.plano, preco_centavos: centavos, beneficios: beneficios.split('\n').map(s => s.trim()).filter(Boolean) }
    if (centavos !== cfg.plano.preco_centavos && !confirm(`Alterar o preço para ${brl(centavos)}? O novo valor vale para novas assinaturas. Assinantes atuais continuam no valor contratado e devem ser avisados com 30 dias de antecedência antes de qualquer reajuste.`)) return
    salvar('plano', plano)
    setCfg({ ...cfg, plano })
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Erro texto={erro} />
      {ok && <p role="status" className="text-green-400 text-sm">{ok}</p>}

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">Plano comercial</h2>
        <Input label="Nome do plano" value={cfg.plano.nome} onChange={e => setCfg({ ...cfg, plano: { ...cfg.plano, nome: e.target.value } })} maxLength={80} />
        <Input label="Preço mensal (R$)" value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" hint="Moeda: BRL · Cobrança mensal recorrente" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tolerância após falha (dias)" type="number" min={0} max={15} value={cfg.plano.tolerancia_dias}
            onChange={e => setCfg({ ...cfg, plano: { ...cfg.plano, tolerancia_dias: Number(e.target.value) } })} />
          <Input label="Prazo de arrependimento (dias)" type="number" min={7} value={cfg.plano.arrependimento_dias}
            onChange={e => setCfg({ ...cfg, plano: { ...cfg.plano, arrependimento_dias: Number(e.target.value) } })} />
        </div>
        <Textarea label="Benefícios (um por linha)" rows={6} value={beneficios} onChange={e => setBeneficios(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cfg.plano.vendas_ativas} onChange={e => setCfg({ ...cfg, plano: { ...cfg.plano, vendas_ativas: e.target.checked } })} className="accent-green-500" />
          Vendas ativas (novos checkouts permitidos)
        </label>
        <Button onClick={salvarPlano} loading={salvando === 'plano'}>Salvar plano</Button>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">Dados da empresa</h2>
        <p className="text-xs text-zinc-500">Exibidos nos Termos de Uso, Política de Privacidade, Sobre e Suporte. Campos vazios aparecem como "a definir".</p>
        {CAMPOS_EMPRESA.map(([k, rotulo]) => (
          <Input key={k} label={rotulo} value={cfg.empresa[k] ?? ''} onChange={e => setCfg({ ...cfg, empresa: { ...cfg.empresa, [k]: e.target.value || null } })} />
        ))}
        <Button onClick={() => salvar('empresa', cfg.empresa)} loading={salvando === 'empresa'}>Salvar dados da empresa</Button>
      </section>

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
        <h2 className="font-semibold">Textos e contato</h2>
        <Input label="Horário de atendimento" value={cfg.textos.horario_suporte ?? ''} onChange={e => setCfg({ ...cfg, textos: { ...cfg.textos, horario_suporte: e.target.value || null } })} placeholder="Ex.: seg. a sex., 9h às 18h" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Versão dos Termos" value={cfg.textos.versao_termos} onChange={e => setCfg({ ...cfg, textos: { ...cfg.textos, versao_termos: e.target.value } })} hint="Alterar exige novo aceite dos usuários" />
          <Input label="Versão da Privacidade" value={cfg.textos.versao_privacidade} onChange={e => setCfg({ ...cfg, textos: { ...cfg.textos, versao_privacidade: e.target.value } })} />
        </div>
        <Textarea label="Aviso global (opcional)" rows={2} value={cfg.textos.aviso_global ?? ''} onChange={e => setCfg({ ...cfg, textos: { ...cfg.textos, aviso_global: e.target.value || null } })} hint="Exibido no topo do app para todos os usuários" />
        <Button onClick={() => salvar('textos', cfg.textos)} loading={salvando === 'textos'}>Salvar textos</Button>
      </section>
    </div>
  )
}
