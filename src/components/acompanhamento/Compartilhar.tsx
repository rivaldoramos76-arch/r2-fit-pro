import type { Compartilhamento } from '../../lib/acompanhamento'

const OPCOES: { chave: keyof Compartilhamento; titulo: string; descricao: string }[] = [
  { chave: 'ver_treinos', titulo: 'Treinos', descricao: 'Seus treinos e os dias em que você treinou' },
  { chave: 'ver_diario', titulo: 'Diário alimentar', descricao: 'O que você comeu, água, exercícios e sua meta' },
  { chave: 'ver_peso', titulo: 'Peso', descricao: 'Seus registros de peso e o gráfico' },
  { chave: 'editar_planos', titulo: 'Enviar treinos, dietas e metas', descricao: 'O personal pode mandar treinos e dietas novos e ajustar sua meta diária' },
]

/** Escolhas do aluno sobre o que o personal vê e pode fazer. */
export default function Compartilhar({ valor, onChange, desabilitado }: { valor: Compartilhamento; onChange: (v: Compartilhamento) => void; desabilitado?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-zinc-800">
      {OPCOES.map(o => (
        <label key={o.chave} className="flex items-start gap-3 py-2.5 cursor-pointer">
          <input type="checkbox" role="switch" checked={valor[o.chave]} disabled={desabilitado}
            onChange={e => onChange({ ...valor, [o.chave]: e.target.checked })} className="mt-0.5 w-5 h-5 accent-green-500 shrink-0" />
          <span>
            <span className="block text-sm font-medium text-zinc-100">{o.titulo}</span>
            <span className="block text-xs text-zinc-500">{o.descricao}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
