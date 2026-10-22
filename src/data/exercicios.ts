// Catálogo de exercícios de musculação.
// Para adicionar um exercício, inclua uma linha em RAW — a interface e a busca
// passam a encontrá-lo automaticamente.

export type GrupoMuscular =
  | 'peito' | 'costas' | 'ombros' | 'biceps' | 'triceps' | 'antebracos' | 'trapezio'
  | 'abdomen' | 'lombar' | 'quadriceps' | 'posteriores' | 'gluteos' | 'adutores' | 'panturrilhas'

export type Equipamento =
  | 'barra' | 'barra_w' | 'halteres' | 'maquina' | 'cabo' | 'smith' | 'elastico'
  | 'peso_corporal' | 'kettlebell' | 'anilha' | 'barra_fixa'

export type TipoMovimento = 'composto' | 'isolado'
export type Dificuldade = 'iniciante' | 'intermediario' | 'avancado'

export interface ExercicioCatalogo {
  id: string
  nome: string
  sinonimos: string[]
  grupo: GrupoMuscular
  secundarios: GrupoMuscular[]
  equipamento: Equipamento
  tipo: TipoMovimento
  nivel: Dificuldade
  instrucoes?: string
}

export const GRUPOS: Record<GrupoMuscular, string> = {
  peito: 'Peito', costas: 'Costas', ombros: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps',
  antebracos: 'Antebraços', trapezio: 'Trapézio', abdomen: 'Abdômen', lombar: 'Lombar',
  quadriceps: 'Quadríceps', posteriores: 'Posteriores de coxa', gluteos: 'Glúteos',
  adutores: 'Adutores', panturrilhas: 'Panturrilhas',
}

export const EQUIPAMENTOS: Record<Equipamento, string> = {
  barra: 'Barra', barra_w: 'Barra W', halteres: 'Halteres', maquina: 'Máquina', cabo: 'Cabo / polia',
  smith: 'Smith', elastico: 'Elástico', peso_corporal: 'Peso corporal', kettlebell: 'Kettlebell',
  anilha: 'Anilha', barra_fixa: 'Barra fixa / paralelas',
}

// [nome, grupo, equipamento, C(omposto)|I(solado), nível 1-3, secundários, sinônimos, instruções?]
type Raw = [string, GrupoMuscular, Equipamento, 'C' | 'I', 1 | 2 | 3, string, string, string?]

const RAW: Raw[] = [
  // ── Peito ──
  ['Supino reto com barra', 'peito', 'barra', 'C', 1, 'triceps,ombros', 'supino reto|supino plano|bench press', 'Deitado no banco, desça a barra controlando até o meio do peito e empurre até estender os cotovelos.'],
  ['Supino reto com halteres', 'peito', 'halteres', 'C', 1, 'triceps,ombros', 'supino halter|dumbbell press', 'Deitado no banco, desça os halteres ao lado do peito e empurre unindo-os acima do tronco.'],
  ['Supino inclinado com barra', 'peito', 'barra', 'C', 2, 'ombros,triceps', 'supino inclinado|incline bench', 'Banco a 30–45°, desça a barra na parte alta do peito e empurre.'],
  ['Supino inclinado com halteres', 'peito', 'halteres', 'C', 1, 'ombros,triceps', 'supino inclinado halter', 'Banco a 30–45°, desça os halteres ao lado do peito e empurre para cima.'],
  ['Supino declinado com barra', 'peito', 'barra', 'C', 2, 'triceps', 'supino declinado|decline bench', 'Banco declinado, desça a barra na parte baixa do peito e empurre.'],
  ['Supino declinado com halteres', 'peito', 'halteres', 'C', 2, 'triceps', 'supino declinado halter'],
  ['Supino reto na máquina', 'peito', 'maquina', 'C', 1, 'triceps,ombros', 'supino máquina|chest press|supino articulado', 'Ajuste o banco para as pegadas ficarem na linha do peito e empurre sem travar os cotovelos.'],
  ['Supino inclinado na máquina', 'peito', 'maquina', 'C', 1, 'ombros,triceps', 'supino inclinado articulado|incline chest press'],
  ['Supino reto no Smith', 'peito', 'smith', 'C', 1, 'triceps,ombros', 'supino smith'],
  ['Supino inclinado no Smith', 'peito', 'smith', 'C', 1, 'ombros,triceps', 'supino inclinado smith'],
  ['Supino com halteres pegada neutra', 'peito', 'halteres', 'C', 2, 'triceps', 'squeeze press|supino neutro'],
  ['Crucifixo reto com halteres', 'peito', 'halteres', 'I', 1, 'ombros', 'crucifixo|fly|crucifixo reto', 'Com cotovelos levemente flexionados, abra os braços até alongar o peito e feche em arco.'],
  ['Crucifixo inclinado com halteres', 'peito', 'halteres', 'I', 1, 'ombros', 'crucifixo inclinado|incline fly'],
  ['Crucifixo declinado com halteres', 'peito', 'halteres', 'I', 2, '', 'crucifixo declinado'],
  ['Crucifixo na máquina', 'peito', 'maquina', 'I', 1, 'ombros', 'peck deck|voador|fly máquina|pec deck', 'Sentado com as costas apoiadas, feche os braços à frente do peito e retorne devagar.'],
  ['Crossover polia alta', 'peito', 'cabo', 'I', 2, 'ombros', 'crossover|cross over|crucifixo no cabo', 'Com as polias no alto, puxe os cabos em arco para baixo e à frente, cruzando as mãos.'],
  ['Crossover polia média', 'peito', 'cabo', 'I', 2, 'ombros', 'crossover médio|cable fly'],
  ['Crossover polia baixa', 'peito', 'cabo', 'I', 2, 'ombros', 'crossover baixo|low cable fly'],
  ['Crucifixo com cabos no banco', 'peito', 'cabo', 'I', 2, 'ombros', 'crucifixo polia deitado'],
  ['Flexão de braço', 'peito', 'peso_corporal', 'C', 1, 'triceps,ombros,abdomen', 'flexão|push-up|apoio', 'Corpo alinhado da cabeça aos pés, desça o peito próximo ao chão e empurre.'],
  ['Flexão de braço com joelhos apoiados', 'peito', 'peso_corporal', 'C', 1, 'triceps,ombros', 'flexão ajoelhada|flexão feminina'],
  ['Flexão de braço inclinada', 'peito', 'peso_corporal', 'C', 1, 'triceps,ombros', 'flexão mãos elevadas|incline push-up'],
  ['Flexão de braço declinada', 'peito', 'peso_corporal', 'C', 2, 'ombros,triceps', 'flexão pés elevados|decline push-up'],
  ['Mergulho nas paralelas com foco no peito', 'peito', 'barra_fixa', 'C', 2, 'triceps,ombros', 'paralelas peito|dips peito', 'Incline o tronco à frente, desça até os ombros ficarem na altura dos cotovelos e suba.'],
  ['Pullover com halter', 'peito', 'halteres', 'C', 2, 'costas,triceps', 'pullover|pull over', 'Deitado no banco, leve o halter atrás da cabeça com braços semiestendidos e retorne acima do peito.'],
  ['Svend press', 'peito', 'anilha', 'I', 2, 'ombros', 'press com anilha'],
  ['Supino com elástico', 'peito', 'elastico', 'C', 1, 'triceps,ombros', 'supino elástico|chest press elástico'],
  ['Crucifixo com elástico', 'peito', 'elastico', 'I', 1, 'ombros', 'fly elástico'],

  // ── Costas ──
  ['Puxada frontal aberta', 'costas', 'cabo', 'C', 1, 'biceps,ombros', 'pulldown|puxada alta|puxada frente|lat pulldown', 'Pegada aberta, puxe a barra até a parte alta do peito levando os cotovelos para baixo.'],
  ['Puxada frontal pegada fechada', 'costas', 'cabo', 'C', 1, 'biceps', 'puxada triângulo|puxada neutra|close grip pulldown'],
  ['Puxada frontal supinada', 'costas', 'cabo', 'C', 1, 'biceps', 'puxada supinada|reverse grip pulldown'],
  ['Puxada atrás da nuca', 'costas', 'cabo', 'C', 3, 'biceps,ombros', 'pulldown nuca'],
  ['Puxada unilateral na polia', 'costas', 'cabo', 'C', 2, 'biceps', 'puxada unilateral'],
  ['Pulldown com braços estendidos', 'costas', 'cabo', 'I', 2, 'triceps', 'straight arm pulldown|pullover na polia|puxada braço reto', 'Em pé, braços estendidos, leve a barra da altura dos olhos até as coxas contraindo as costas.'],
  ['Barra fixa pronada', 'costas', 'barra_fixa', 'C', 2, 'biceps,ombros', 'barra fixa|pull-up|pullup|barra', 'Pendurado com pegada pronada, puxe o corpo até o queixo passar a barra e desça controlando.'],
  ['Barra fixa supinada', 'costas', 'barra_fixa', 'C', 2, 'biceps', 'chin-up|barra supinada'],
  ['Barra fixa pegada neutra', 'costas', 'barra_fixa', 'C', 2, 'biceps', 'barra neutra|neutral grip pull-up'],
  ['Barra fixa assistida na máquina', 'costas', 'maquina', 'C', 1, 'biceps', 'gravitron|barra assistida'],
  ['Barra fixa com elástico', 'costas', 'elastico', 'C', 1, 'biceps', 'barra assistida elástico'],
  ['Remada curvada com barra', 'costas', 'barra', 'C', 2, 'biceps,lombar,trapezio', 'remada curvada|bent over row|remada pronada', 'Tronco inclinado à frente e coluna neutra, puxe a barra até o abdômen.'],
  ['Remada curvada supinada', 'costas', 'barra', 'C', 2, 'biceps,lombar', 'remada yates|remada supinada'],
  ['Remada Pendlay', 'costas', 'barra', 'C', 3, 'biceps,lombar,trapezio', 'pendlay row'],
  ['Remada curvada com halteres', 'costas', 'halteres', 'C', 2, 'biceps,lombar', 'remada halteres'],
  ['Remada unilateral com halter', 'costas', 'halteres', 'C', 1, 'biceps', 'serrote|remada serrote|one arm row', 'Apoiado no banco, puxe o halter em direção ao quadril mantendo o tronco estável.'],
  ['Remada baixa no cabo', 'costas', 'cabo', 'C', 1, 'biceps,trapezio', 'remada sentada|remada baixa|seated row|remada triângulo', 'Sentado, coluna ereta, puxe o triângulo até o abdômen aproximando as escápulas.'],
  ['Remada unilateral na polia', 'costas', 'cabo', 'C', 2, 'biceps', 'remada unilateral cabo'],
  ['Remada sentada na máquina', 'costas', 'maquina', 'C', 1, 'biceps,trapezio', 'remada articulada|remada máquina|machine row'],
  ['Remada cavalinho', 'costas', 'barra', 'C', 2, 'biceps,lombar,trapezio', 't-bar row|remada t|remada landmine'],
  ['Remada cavalinho apoiada na máquina', 'costas', 'maquina', 'C', 1, 'biceps', 'remada cavalinho máquina|chest supported row'],
  ['Remada no Smith', 'costas', 'smith', 'C', 2, 'biceps,lombar', 'remada curvada smith'],
  ['Remada Meadows', 'costas', 'barra', 'C', 3, 'biceps', 'meadows row'],
  ['Remada invertida', 'costas', 'peso_corporal', 'C', 1, 'biceps', 'remada australiana|australian pull-up|inverted row'],
  ['Remada com elástico', 'costas', 'elastico', 'C', 1, 'biceps', 'remada elástico'],
  ['Puxada com elástico', 'costas', 'elastico', 'C', 1, 'biceps', 'pulldown elástico'],
  ['Levantamento terra', 'costas', 'barra', 'C', 3, 'gluteos,posteriores,lombar,trapezio,quadriceps', 'terra|deadlift|levantamento terra convencional', 'Barra junto às canelas, coluna neutra, empurre o chão e estenda quadril e joelhos juntos.'],
  ['Rack pull', 'costas', 'barra', 'C', 3, 'lombar,trapezio,gluteos', 'terra parcial|levantamento terra no rack'],
  ['Pullover no cabo com corda', 'costas', 'cabo', 'I', 2, 'triceps', 'pullover corda'],

  // ── Trapézio ──
  ['Encolhimento com barra', 'trapezio', 'barra', 'I', 1, '', 'encolhimento|shrug', 'Em pé com a barra à frente, eleve os ombros em direção às orelhas e desça devagar.'],
  ['Encolhimento com halteres', 'trapezio', 'halteres', 'I', 1, '', 'encolhimento halter|dumbbell shrug'],
  ['Encolhimento no Smith', 'trapezio', 'smith', 'I', 1, '', 'encolhimento smith'],
  ['Encolhimento na máquina', 'trapezio', 'maquina', 'I', 1, '', 'shrug máquina'],

  // ── Ombros ──
  ['Desenvolvimento militar com barra', 'ombros', 'barra', 'C', 2, 'triceps,trapezio', 'desenvolvimento em pé|overhead press|ohp|press militar', 'Em pé, empurre a barra do alto do peito até acima da cabeça, sem arquear a lombar.'],
  ['Desenvolvimento com barra sentado', 'ombros', 'barra', 'C', 2, 'triceps', 'desenvolvimento barra sentado'],
  ['Desenvolvimento com halteres sentado', 'ombros', 'halteres', 'C', 1, 'triceps', 'desenvolvimento halteres|shoulder press', 'Sentado com apoio, empurre os halteres da altura das orelhas até acima da cabeça.'],
  ['Desenvolvimento Arnold', 'ombros', 'halteres', 'C', 2, 'triceps', 'arnold press'],
  ['Desenvolvimento na máquina', 'ombros', 'maquina', 'C', 1, 'triceps', 'desenvolvimento articulado|shoulder press máquina'],
  ['Desenvolvimento no Smith', 'ombros', 'smith', 'C', 1, 'triceps', 'desenvolvimento smith'],
  ['Desenvolvimento com kettlebell', 'ombros', 'kettlebell', 'C', 2, 'triceps,abdomen', 'kettlebell press'],
  ['Desenvolvimento com elástico', 'ombros', 'elastico', 'C', 1, 'triceps', 'desenvolvimento elástico'],
  ['Desenvolvimento landmine', 'ombros', 'barra', 'C', 2, 'peito,triceps', 'landmine press'],
  ['Push press', 'ombros', 'barra', 'C', 3, 'triceps,quadriceps', 'desenvolvimento com impulso'],
  ['Flexão pike', 'ombros', 'peso_corporal', 'C', 2, 'triceps', 'pike push-up|flexão em v'],
  ['Elevação lateral com halteres', 'ombros', 'halteres', 'I', 1, 'trapezio', 'elevação lateral|lateral raise', 'Com cotovelos levemente flexionados, eleve os halteres lateralmente até a altura dos ombros.'],
  ['Elevação lateral no cabo', 'ombros', 'cabo', 'I', 2, '', 'elevação lateral polia|cable lateral raise'],
  ['Elevação lateral na máquina', 'ombros', 'maquina', 'I', 1, '', 'elevação lateral máquina'],
  ['Elevação lateral com elástico', 'ombros', 'elastico', 'I', 1, '', 'elevação lateral elástico'],
  ['Elevação frontal com halteres', 'ombros', 'halteres', 'I', 1, 'peito', 'elevação frontal|front raise', 'Eleve os halteres à frente até a altura dos ombros e desça controlando.'],
  ['Elevação frontal com barra', 'ombros', 'barra', 'I', 1, 'peito', 'elevação frontal barra'],
  ['Elevação frontal com anilha', 'ombros', 'anilha', 'I', 1, 'peito', 'elevação frontal anilha'],
  ['Elevação frontal no cabo', 'ombros', 'cabo', 'I', 1, 'peito', 'elevação frontal polia'],
  ['Crucifixo invertido com halteres', 'ombros', 'halteres', 'I', 2, 'costas,trapezio', 'crucifixo inverso|deltoide posterior|reverse fly', 'Tronco inclinado à frente, abra os braços lateralmente contraindo a parte posterior dos ombros.'],
  ['Crucifixo invertido na máquina', 'ombros', 'maquina', 'I', 1, 'costas,trapezio', 'peck deck invertido|voador invertido|reverse pec deck'],
  ['Crucifixo invertido no cabo', 'ombros', 'cabo', 'I', 2, 'costas', 'crucifixo inverso polia'],
  ['Face pull', 'ombros', 'cabo', 'I', 2, 'trapezio,costas', 'puxada para o rosto|face pull corda', 'Com a corda na altura do rosto, puxe abrindo as mãos e levando os cotovelos para trás.'],
  ['Remada alta com barra', 'ombros', 'barra', 'C', 2, 'trapezio,biceps', 'remada alta|upright row'],
  ['Remada alta no cabo', 'ombros', 'cabo', 'C', 2, 'trapezio', 'remada alta polia'],
  ['Remada alta com halteres', 'ombros', 'halteres', 'C', 2, 'trapezio', 'remada alta halter'],

  // ── Bíceps ──
  ['Rosca direta com barra', 'biceps', 'barra', 'I', 1, 'antebracos', 'rosca direta|barbell curl|rosca barra', 'Cotovelos junto ao corpo, flexione os braços levando a barra até os ombros e desça devagar.'],
  ['Rosca direta com barra W', 'biceps', 'barra_w', 'I', 1, 'antebracos', 'rosca w|rosca barra w|ez curl'],
  ['Rosca alternada com halteres', 'biceps', 'halteres', 'I', 1, 'antebracos', 'rosca alternada|alternate curl', 'Flexione um braço por vez girando a palma para cima durante a subida.'],
  ['Rosca simultânea com halteres', 'biceps', 'halteres', 'I', 1, 'antebracos', 'rosca halteres|dumbbell curl'],
  ['Rosca martelo', 'biceps', 'halteres', 'I', 1, 'antebracos', 'hammer curl|rosca neutra', 'Com pegada neutra (palmas voltadas uma para a outra), flexione os cotovelos sem balançar o tronco.'],
  ['Rosca martelo no cabo com corda', 'biceps', 'cabo', 'I', 1, 'antebracos', 'rosca corda|rope hammer curl'],
  ['Rosca concentrada', 'biceps', 'halteres', 'I', 1, '', 'concentration curl', 'Sentado, cotovelo apoiado na parte interna da coxa, flexione o braço até o ombro.'],
  ['Rosca Scott com barra W', 'biceps', 'barra_w', 'I', 1, '', 'rosca scott|preacher curl|banco scott'],
  ['Rosca Scott com halter', 'biceps', 'halteres', 'I', 1, '', 'scott unilateral'],
  ['Rosca Scott na máquina', 'biceps', 'maquina', 'I', 1, '', 'rosca máquina|scott máquina'],
  ['Rosca direta no cabo', 'biceps', 'cabo', 'I', 1, 'antebracos', 'rosca polia|cable curl'],
  ['Rosca bayesian no cabo', 'biceps', 'cabo', 'I', 2, '', 'bayesian curl|rosca polia atrás do corpo'],
  ['Rosca inclinada com halteres', 'biceps', 'halteres', 'I', 2, '', 'rosca banco inclinado|incline curl'],
  ['Rosca spider', 'biceps', 'barra_w', 'I', 2, '', 'spider curl'],
  ['Rosca 21', 'biceps', 'barra', 'I', 2, 'antebracos', 'rosca vinte e um|21s'],
  ['Rosca Zottman', 'biceps', 'halteres', 'I', 2, 'antebracos', 'zottman curl'],
  ['Rosca com elástico', 'biceps', 'elastico', 'I', 1, 'antebracos', 'rosca elástico'],

  // ── Tríceps ──
  ['Tríceps pulley com barra reta', 'triceps', 'cabo', 'I', 1, '', 'tríceps pulley|tríceps polia|pushdown|tríceps barra', 'Cotovelos fixos ao lado do corpo, estenda os braços empurrando a barra para baixo.'],
  ['Tríceps pulley com corda', 'triceps', 'cabo', 'I', 1, '', 'tríceps corda|rope pushdown', 'Estenda os cotovelos e abra a corda no final do movimento, mantendo os braços junto ao corpo.'],
  ['Tríceps pulley com barra V', 'triceps', 'cabo', 'I', 1, '', 'tríceps barra v'],
  ['Tríceps pulley inverso', 'triceps', 'cabo', 'I', 2, '', 'tríceps supinado|reverse pushdown'],
  ['Tríceps testa com barra W', 'triceps', 'barra_w', 'I', 2, '', 'tríceps testa|skull crusher|rosca testa', 'Deitado, desça a barra em direção à testa flexionando só os cotovelos e estenda.'],
  ['Tríceps testa com halteres', 'triceps', 'halteres', 'I', 2, '', 'tríceps testa halter'],
  ['Tríceps francês com halter', 'triceps', 'halteres', 'I', 1, '', 'tríceps francês|tríceps nuca|overhead extension', 'Segure o halter acima da cabeça com as duas mãos, desça atrás da nuca e estenda.'],
  ['Tríceps francês unilateral', 'triceps', 'halteres', 'I', 2, '', 'francês unilateral'],
  ['Tríceps overhead no cabo com corda', 'triceps', 'cabo', 'I', 2, '', 'tríceps francês na polia|overhead cable extension'],
  ['Tríceps coice com halter', 'triceps', 'halteres', 'I', 1, '', 'tríceps coice|kickback'],
  ['Tríceps coice no cabo', 'triceps', 'cabo', 'I', 2, '', 'kickback polia'],
  ['Mergulho nas paralelas', 'triceps', 'barra_fixa', 'C', 2, 'peito,ombros', 'paralelas|dips|mergulho', 'Tronco ereto, desça flexionando os cotovelos até cerca de 90° e empurre para cima.'],
  ['Mergulho no banco', 'triceps', 'peso_corporal', 'C', 1, 'ombros', 'tríceps banco|bench dips'],
  ['Supino pegada fechada', 'triceps', 'barra', 'C', 2, 'peito,ombros', 'supino fechado|close grip bench press'],
  ['Flexão diamante', 'triceps', 'peso_corporal', 'C', 2, 'peito', 'flexão fechada|diamond push-up'],
  ['Tríceps na máquina', 'triceps', 'maquina', 'I', 1, '', 'tríceps máquina|dips máquina'],
  ['Tríceps com elástico', 'triceps', 'elastico', 'I', 1, '', 'tríceps elástico'],
  ['JM press', 'triceps', 'barra', 'C', 3, 'peito', 'jm press'],

  // ── Antebraços ──
  ['Rosca de punho com barra', 'antebracos', 'barra', 'I', 1, '', 'flexão de punho|wrist curl|rosca punho'],
  ['Rosca de punho inversa', 'antebracos', 'barra', 'I', 1, '', 'extensão de punho|reverse wrist curl'],
  ['Rosca de punho com halter', 'antebracos', 'halteres', 'I', 1, '', 'flexão de punho halter'],
  ['Rosca inversa com barra', 'antebracos', 'barra', 'I', 1, 'biceps', 'rosca pronada|reverse curl'],
  ['Caminhada do fazendeiro', 'antebracos', 'halteres', 'C', 1, 'trapezio,abdomen', "farmer's walk|farmer walk|caminhada com carga"],
  ['Rolo de punho', 'antebracos', 'anilha', 'I', 1, '', 'wrist roller|enrolador de punho'],
  ['Suspensão na barra fixa', 'antebracos', 'barra_fixa', 'I', 1, 'costas', 'dead hang|pegada estática'],

  // ── Abdômen ──
  ['Abdominal supra', 'abdomen', 'peso_corporal', 'I', 1, '', 'abdominal|crunch|abdominal reto', 'Deitado com joelhos flexionados, eleve o tronco enrolando a coluna sem puxar o pescoço.'],
  ['Abdominal infra', 'abdomen', 'peso_corporal', 'I', 1, '', 'elevação de pernas deitado|leg raise|abdominal inferior'],
  ['Elevação de pernas na barra fixa', 'abdomen', 'barra_fixa', 'I', 3, 'antebracos', 'elevação de pernas suspenso|hanging leg raise'],
  ['Elevação de joelhos nas paralelas', 'abdomen', 'barra_fixa', 'I', 2, '', "captain's chair|elevação de joelhos|abdominal na paralela"],
  ['Prancha frontal', 'abdomen', 'peso_corporal', 'I', 1, 'ombros,lombar', 'prancha|plank', 'Apoiado nos antebraços e pontas dos pés, mantenha o corpo alinhado contraindo o abdômen.'],
  ['Prancha lateral', 'abdomen', 'peso_corporal', 'I', 1, 'ombros', 'side plank|prancha oblíquos'],
  ['Abdominal bicicleta', 'abdomen', 'peso_corporal', 'I', 1, '', 'bicycle crunch|abdominal oblíquo'],
  ['Abdominal canivete', 'abdomen', 'peso_corporal', 'I', 2, '', 'v-up|canivete'],
  ['Abdominal na polia', 'abdomen', 'cabo', 'I', 2, '', 'abdominal ajoelhado na polia|cable crunch|abdominal cabo'],
  ['Abdominal na máquina', 'abdomen', 'maquina', 'I', 1, '', 'abdominal máquina|crunch machine'],
  ['Abdominal declinado', 'abdomen', 'peso_corporal', 'I', 2, '', 'abdominal banco declinado|decline crunch'],
  ['Abdominal remador', 'abdomen', 'peso_corporal', 'I', 1, '', 'remador|sit-up'],
  ['Rotação russa', 'abdomen', 'anilha', 'I', 1, '', 'russian twist|giro russo'],
  ['Roda abdominal', 'abdomen', 'peso_corporal', 'I', 3, 'ombros,lombar', 'ab wheel|rodinha abdominal|rollout'],
  ['Dead bug', 'abdomen', 'peso_corporal', 'I', 1, 'lombar', 'inseto morto'],
  ['Escalador', 'abdomen', 'peso_corporal', 'C', 1, 'ombros,quadriceps', 'mountain climber|alpinista'],
  ['Pallof press', 'abdomen', 'cabo', 'I', 2, '', 'antirrotação|pallof'],
  ['Lenhador no cabo', 'abdomen', 'cabo', 'C', 2, 'ombros', 'woodchopper|lenhador'],
  ['Canoa', 'abdomen', 'peso_corporal', 'I', 2, '', 'hollow hold|hollow body'],
  ['Tesoura', 'abdomen', 'peso_corporal', 'I', 1, '', 'flutter kicks|abdominal tesoura'],

  // ── Lombar ──
  ['Hiperextensão lombar', 'lombar', 'peso_corporal', 'I', 1, 'gluteos,posteriores', 'banco romano|extensão lombar|back extension', 'No banco romano, desça o tronco com coluna neutra e suba até alinhar com as pernas.'],
  ['Superman', 'lombar', 'peso_corporal', 'I', 1, 'gluteos', 'super-homem'],
  ['Perdigueiro', 'lombar', 'peso_corporal', 'I', 1, 'abdomen,gluteos', 'bird dog|quatro apoios alternado'],

  // ── Quadríceps ──
  ['Agachamento livre com barra', 'quadriceps', 'barra', 'C', 2, 'gluteos,posteriores,lombar', 'agachamento|agachamento livre|back squat|squat', 'Barra apoiada no trapézio, desça flexionando quadril e joelhos com o tronco firme e suba empurrando o chão.'],
  ['Agachamento frontal com barra', 'quadriceps', 'barra', 'C', 3, 'gluteos,abdomen', 'front squat|agachamento frontal'],
  ['Agachamento no Smith', 'quadriceps', 'smith', 'C', 1, 'gluteos', 'agachamento smith'],
  ['Agachamento goblet', 'quadriceps', 'halteres', 'C', 1, 'gluteos,abdomen', 'goblet squat|agachamento taça', 'Segure o halter junto ao peito e agache mantendo o tronco ereto.'],
  ['Agachamento búlgaro', 'quadriceps', 'halteres', 'C', 2, 'gluteos', 'bulgarian split squat|búlgaro|afundo búlgaro', 'Pé de trás apoiado no banco, desça o joelho de trás em direção ao chão e suba pela perna da frente.'],
  ['Agachamento hack na máquina', 'quadriceps', 'maquina', 'C', 1, 'gluteos', 'hack squat|hack'],
  ['Agachamento pendular', 'quadriceps', 'maquina', 'C', 1, 'gluteos', 'pendulum squat|pêndulo'],
  ['Agachamento livre', 'quadriceps', 'peso_corporal', 'C', 1, 'gluteos', 'agachamento sem peso|air squat|agachamento peso corporal'],
  ['Agachamento com salto', 'quadriceps', 'peso_corporal', 'C', 2, 'gluteos,panturrilhas', 'jump squat|agachamento saltado'],
  ['Agachamento com elástico', 'quadriceps', 'elastico', 'C', 1, 'gluteos', 'agachamento elástico'],
  ['Agachamento na parede', 'quadriceps', 'peso_corporal', 'I', 1, 'gluteos', 'wall sit|cadeirinha|isometria na parede'],
  ['Agachamento unilateral', 'quadriceps', 'peso_corporal', 'C', 3, 'gluteos', 'pistol squat|pistola'],
  ['Agachamento Zercher', 'quadriceps', 'barra', 'C', 3, 'gluteos,abdomen', 'zercher squat'],
  ['Sissy squat', 'quadriceps', 'peso_corporal', 'I', 3, '', 'agachamento sissy'],
  ['Leg press 45°', 'quadriceps', 'maquina', 'C', 1, 'gluteos,posteriores', 'leg press|leg 45|leg press inclinado', 'Pés na largura dos ombros, desça a plataforma até cerca de 90° nos joelhos e empurre sem travar.'],
  ['Leg press horizontal', 'quadriceps', 'maquina', 'C', 1, 'gluteos', 'leg horizontal|leg press sentado'],
  ['Leg press unilateral', 'quadriceps', 'maquina', 'C', 2, 'gluteos', 'leg press uma perna'],
  ['Cadeira extensora', 'quadriceps', 'maquina', 'I', 1, '', 'extensora|leg extension|extensão de joelhos', 'Sentado, estenda os joelhos até quase travar e desça controlando.'],
  ['Afundo com halteres', 'quadriceps', 'halteres', 'C', 1, 'gluteos', 'afundo|lunge|avanço estático', 'Com um pé à frente, desça o joelho de trás em direção ao chão e suba.'],
  ['Afundo com barra', 'quadriceps', 'barra', 'C', 2, 'gluteos', 'afundo barra|barbell lunge'],
  ['Afundo no Smith', 'quadriceps', 'smith', 'C', 1, 'gluteos', 'afundo smith'],
  ['Passada', 'quadriceps', 'halteres', 'C', 2, 'gluteos,posteriores', 'avanço caminhando|walking lunge|passada com halteres'],
  ['Afundo reverso', 'quadriceps', 'halteres', 'C', 1, 'gluteos', 'reverse lunge|recuo'],
  ['Subida no banco', 'quadriceps', 'halteres', 'C', 1, 'gluteos', 'step-up|subida no step'],

  // ── Posteriores de coxa ──
  ['Mesa flexora', 'posteriores', 'maquina', 'I', 1, 'panturrilhas', 'flexora deitado|leg curl|mesa flexora deitada', 'Deitado de bruços, flexione os joelhos trazendo os calcanhares em direção aos glúteos.'],
  ['Cadeira flexora', 'posteriores', 'maquina', 'I', 1, '', 'flexora sentado|seated leg curl'],
  ['Flexora em pé unilateral', 'posteriores', 'maquina', 'I', 1, '', 'flexora em pé|standing leg curl'],
  ['Flexora com elástico', 'posteriores', 'elastico', 'I', 1, '', 'flexão de joelho elástico'],
  ['Levantamento terra romeno', 'posteriores', 'barra', 'C', 2, 'gluteos,lombar', 'terra romeno|rdl|romanian deadlift|stiff romeno', 'Joelhos levemente flexionados, leve o quadril para trás descendo a barra rente às pernas e retorne.'],
  ['Stiff com barra', 'posteriores', 'barra', 'C', 2, 'gluteos,lombar', 'stiff|stiff legged deadlift'],
  ['Stiff com halteres', 'posteriores', 'halteres', 'C', 1, 'gluteos,lombar', 'stiff halteres|terra romeno halteres'],
  ['Levantamento terra romeno unilateral', 'posteriores', 'halteres', 'C', 2, 'gluteos', 'stiff unilateral|single leg rdl'],
  ['Bom dia com barra', 'posteriores', 'barra', 'C', 3, 'lombar,gluteos', 'good morning|bom dia'],
  ['Flexão nórdica', 'posteriores', 'peso_corporal', 'I', 3, '', 'nordic curl|nórdico'],
  ['Flexão de joelhos na bola suíça', 'posteriores', 'peso_corporal', 'I', 2, 'gluteos', 'leg curl na bola|swiss ball curl'],
  ['Kettlebell swing', 'posteriores', 'kettlebell', 'C', 2, 'gluteos,lombar,ombros', 'swing|balanço com kettlebell'],

  // ── Glúteos ──
  ['Elevação pélvica com barra', 'gluteos', 'barra', 'C', 2, 'posteriores', 'hip thrust|elevação de quadril', 'Costas apoiadas no banco e barra sobre o quadril, eleve o quadril até alinhar tronco e coxas.'],
  ['Elevação pélvica na máquina', 'gluteos', 'maquina', 'C', 1, 'posteriores', 'hip thrust máquina'],
  ['Elevação pélvica no Smith', 'gluteos', 'smith', 'C', 1, 'posteriores', 'hip thrust smith'],
  ['Ponte de glúteo', 'gluteos', 'peso_corporal', 'I', 1, 'posteriores', 'glute bridge|ponte|elevação pélvica no chão'],
  ['Ponte de glúteo unilateral', 'gluteos', 'peso_corporal', 'I', 2, 'posteriores', 'single leg glute bridge'],
  ['Glúteo na polia', 'gluteos', 'cabo', 'I', 1, 'posteriores', 'coice na polia|kickback no cabo|extensão de quadril no cabo'],
  ['Glúteo na máquina', 'gluteos', 'maquina', 'I', 1, 'posteriores', 'extensão de quadril máquina|glute kickback máquina'],
  ['Coice de glúteo em quatro apoios', 'gluteos', 'peso_corporal', 'I', 1, '', 'glúteo quatro apoios|donkey kick|coice'],
  ['Cadeira abdutora', 'gluteos', 'maquina', 'I', 1, '', 'abdutora|abdução de quadril|hip abduction', 'Sentado, afaste as pernas contra a resistência e retorne devagar.'],
  ['Abdução de quadril no cabo', 'gluteos', 'cabo', 'I', 1, '', 'abdução polia'],
  ['Caminhada lateral com elástico', 'gluteos', 'elastico', 'I', 1, '', 'monster walk|passo lateral elástico'],
  ['Levantamento terra sumô', 'gluteos', 'barra', 'C', 3, 'quadriceps,adutores,posteriores,costas', 'terra sumô|sumo deadlift'],
  ['Agachamento sumô com halter', 'gluteos', 'halteres', 'C', 1, 'quadriceps,adutores', 'agachamento sumô|sumo squat'],

  // ── Adutores ──
  ['Cadeira adutora', 'adutores', 'maquina', 'I', 1, '', 'adutora|adução de quadril|hip adduction'],
  ['Adução de quadril no cabo', 'adutores', 'cabo', 'I', 1, '', 'adução polia'],
  ['Agachamento cossaco', 'adutores', 'peso_corporal', 'C', 3, 'quadriceps,gluteos', 'cossack squat'],

  // ── Panturrilhas ──
  ['Panturrilha em pé na máquina', 'panturrilhas', 'maquina', 'I', 1, '', 'gêmeos em pé|elevação de panturrilha|calf raise', 'Eleve os calcanhares o máximo possível, segure um instante e desça alongando.'],
  ['Panturrilha sentado', 'panturrilhas', 'maquina', 'I', 1, '', 'sóleo|panturrilha sentada|seated calf raise'],
  ['Panturrilha no leg press', 'panturrilhas', 'maquina', 'I', 1, '', 'gêmeos no leg press'],
  ['Panturrilha no Smith', 'panturrilhas', 'smith', 'I', 1, '', 'gêmeos smith'],
  ['Panturrilha unilateral com halter', 'panturrilhas', 'halteres', 'I', 1, '', 'panturrilha no degrau'],
  ['Panturrilha em pé com peso corporal', 'panturrilhas', 'peso_corporal', 'I', 1, '', 'elevação de calcanhar|panturrilha livre'],
  ['Panturrilha burrico', 'panturrilhas', 'maquina', 'I', 2, '', 'donkey calf raise'],
]

const NIVEIS: Dificuldade[] = ['iniciante', 'intermediario', 'avancado']

export function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/°/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const CATALOGO: ExercicioCatalogo[] = RAW.map(([nome, grupo, equipamento, t, n, sec, sin, instrucoes]) => ({
  id: slug(nome),
  nome,
  grupo,
  equipamento,
  tipo: t === 'C' ? 'composto' : 'isolado',
  nivel: NIVEIS[n - 1],
  secundarios: sec ? (sec.split(',') as GrupoMuscular[]) : [],
  sinonimos: sin ? sin.split('|') : [],
  instrucoes,
}))

const POR_ID = new Map(CATALOGO.map(e => [e.id, e]))
export function exercicioPorId(id: string | undefined): ExercicioCatalogo | undefined {
  return id ? POR_ID.get(id) : undefined
}
