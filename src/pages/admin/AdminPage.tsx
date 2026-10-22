import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import VisaoGeral from './VisaoGeral'
import Usuarios from './Usuarios'
import { Assinaturas, Pagamentos } from './Financeiro'
import { Integracoes, Suporte, Privacidade, Auditoria } from './Operacao'
import Configuracao from './Configuracao'

const ABAS = [
  ['geral', 'Visão geral', VisaoGeral], ['usuarios', 'Usuários', Usuarios], ['assinaturas', 'Assinaturas', Assinaturas],
  ['pagamentos', 'Pagamentos', Pagamentos], ['integracoes', 'Integrações e erros', Integracoes], ['suporte', 'Suporte', Suporte],
  ['privacidade', 'LGPD', Privacidade], ['config', 'Plano e empresa', Configuracao], ['auditoria', 'Auditoria', Auditoria],
] as const

/** Painel administrativo. A rota é protegida no cliente, mas todas as leituras e
 *  alterações são autorizadas no servidor (RLS e funções que exigem is_admin). */
export default function AdminPage() {
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>('geral')
  const Atual = ABAS.find(a => a[0] === aba)![2]
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/menu" className="p-2 -ml-2 rounded-lg hover:bg-zinc-800" aria-label="Voltar ao app"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="font-bold">Painel administrativo · R2 Fit Pro</h1>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto pb-2" aria-label="Seções do painel">
          {ABAS.map(([id, rotulo]) => (
            <button key={id} onClick={() => setAba(id)} aria-current={aba === id ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${aba === id ? 'bg-green-500 text-zinc-950 font-semibold' : 'text-zinc-400 hover:bg-zinc-800'}`}>{rotulo}</button>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6"><Atual /></main>
    </div>
  )
}
