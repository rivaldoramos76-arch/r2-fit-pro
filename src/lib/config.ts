import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Configuração comercial central (tabela app_config). Preço e textos vêm
// sempre do banco, editáveis no painel administrativo — nada fixo no código.
export interface ConfigPlano {
  produto: string
  nome: string
  preco_centavos: number
  /** Preço do plano anual (12 meses, pagamento único). Ausente ou nulo: plano anual não é oferecido. */
  preco_anual_centavos?: number | null
  parcelas_max_anual?: number
  /** Dias de teste grátis para contas novas (0 = desligado) e limite diário de IA durante o teste. */
  teste_dias?: number
  teste_limite_ia?: number
  moeda: 'BRL'
  intervalo: 'mensal'
  tolerancia_dias: number
  arrependimento_dias: number
  vendas_ativas: boolean
  beneficios: string[]
}
export interface ConfigEmpresa {
  nome_fantasia: string
  razao_social: string | null
  cnpj: string | null
  endereco: string | null
  email_suporte: string | null
  email_privacidade: string | null
  telefone: string | null
  encarregado_dados: string | null
  foro: string | null
}
export interface ConfigTextos {
  versao_termos: string
  versao_privacidade: string
  aviso_global: string | null
  horario_suporte: string | null
  /** WhatsApp de atendimento (com DDD). Vazio: usa o telefone da empresa. */
  whatsapp?: string | null
}
export interface AppConfig { plano: ConfigPlano; empresa: ConfigEmpresa; textos: ConfigTextos }

let cache: Promise<AppConfig> | null = null

export function carregarConfig(forcar = false): Promise<AppConfig> {
  if (!cache || forcar) {
    cache = (async () => {
      const { data, error } = await supabase.from('app_config').select('chave, valor')
      if (error) throw error
      const m = Object.fromEntries((data ?? []).map(r => [r.chave, r.valor]))
      if (!m.plano || !m.empresa || !m.textos) throw new Error('Configuração comercial incompleta')
      return m as unknown as AppConfig
    })()
    cache.catch(() => { cache = null })
  }
  return cache
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    carregarConfig().then(c => vivo && setConfig(c)).catch(() => vivo && setErro('Não foi possível carregar as informações. Verifique sua conexão.'))
    return () => { vivo = false }
  }, [])
  return { config, erro }
}

/** Link do WhatsApp de atendimento com mensagem pronta, ou null se não houver número. */
export function linkWhatsapp(config: AppConfig | null, mensagem: string): string | null {
  let numero = (config?.textos.whatsapp || config?.empresa.telefone || '').replace(/\D/g, '')
  if (numero.length === 10 || numero.length === 11) numero = '55' + numero // número brasileiro sem o código do país
  if (numero.length < 12 || numero.length > 15) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

/** Texto exibido quando um dado empresarial ainda não foi informado pelo responsável. */
export const PENDENTE = '[a definir pelo responsável]'
export const ou = (v: string | null | undefined) => (v && v.trim()) || PENDENTE
