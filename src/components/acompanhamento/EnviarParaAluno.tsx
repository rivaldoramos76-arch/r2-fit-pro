import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import { enviarTreino } from '../../lib/acompanhamento'
import { Button } from '../UI'

interface Edicao { treinoId: string; alunoId: string; substituir: string; nome: string }
const CHAVE = 'r2-acomp-edicao'

/** Lembra que o treino aberto é a cópia de um treino do aluno (vale enquanto a aba estiver aberta). */
export function guardarEdicaoAluno(e: Edicao) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(e)) } catch { /* sem armazenamento */ }
}
function lerEdicao(treinoId: string): Edicao | null {
  try {
    const e = JSON.parse(sessionStorage.getItem(CHAVE) ?? 'null') as Edicao | null
    return e?.treinoId === treinoId ? e : null
  } catch { return null }
}

/** Faixa no treino copiado de um aluno: depois de editar, envia de volta substituindo o original. */
export default function EnviarParaAluno({ treinoId }: { treinoId: string }) {
  const navigate = useNavigate()
  const [edicao, setEdicao] = useState(() => lerEdicao(treinoId))
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  if (!edicao) return null
  const enviar = async () => {
    setOcupado(true); setErro('')
    try {
      await enviarTreino(edicao.alunoId, treinoId, edicao.substituir)
      sessionStorage.removeItem(CHAVE)
      navigate(`/alunos/${edicao.alunoId}`)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.'); setOcupado(false) }
  }
  return (
    <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm text-green-100">Cópia do treino de <strong>{edicao.nome}</strong>. Ajuste o que quiser em “Editar” e depois envie de volta para o aluno.</p>
        <button onClick={() => { sessionStorage.removeItem(CHAVE); setEdicao(null) }} aria-label="Fechar aviso" className="text-green-200/70 hover:text-green-100"><X className="w-4 h-4" /></button>
      </div>
      <Button size="sm" loading={ocupado} onClick={enviar}><Send className="w-4 h-4" />Enviar para {edicao.nome}</Button>
      {erro && <p className="text-sm text-red-300">{erro}</p>}
    </div>
  )
}
