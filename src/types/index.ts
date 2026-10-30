import type { User } from '@supabase/supabase-js'
import type { PlanoAlimentar } from '../lib/openai'
import type { PlanoTreino } from '../lib/treinoModel'

export type { User }

export interface Profile {
  id: string
  nome: string | null
  email: string | null
  avatar_url: string | null
  created_at: string
}

export interface Dieta {
  id: string
  user_id: string
  nome: string
  objetivo: string
  calorias_dia: number
  plano: PlanoAlimentar
  created_at: string
}

export interface Treino {
  id: string
  user_id: string
  nome: string
  objetivo: string
  nivel: string
  frequencia_semanal: number
  plano: PlanoTreino
  created_at: string
  /** Personal que enviou o treino (acompanhamento) */
  enviado_por?: string | null
}

export interface SessaoTreino {
  id: string
  user_id: string
  treino_id: string
  treino_nome: string
  dia_index: number
  data_inicio: string
  data_fim: string | null
  concluido: boolean
  series_realizadas: Record<string, number>
}

export type ObjetivoOptions =
  | 'Perda de gordura'
  | 'Ganho de massa muscular'
  | 'Manutenção'
  | 'Condicionamento'

export type NivelOptions = 'Iniciante' | 'Intermediário' | 'Avançado'

export type NivelAtividadeOptions =
  | 'Sedentário'
  | 'Levemente ativo'
  | 'Moderadamente ativo'
  | 'Muito ativo'
  | 'Extremamente ativo'
