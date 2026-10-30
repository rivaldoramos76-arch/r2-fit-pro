import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AcessoProvider } from './context/AcessoContext'
import { RotaPrivada, RotaPremium, RotaAdmin } from './components/Rotas'
import PublicLayout from './components/PublicLayout'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import RecuperarSenhaPage from './pages/RecuperarSenhaPage'
import RedefinirSenhaPage from './pages/RedefinirSenhaPage'
import LandingPage from './pages/LandingPage'
import TermosPage from './pages/TermosPage'
import PrivacidadePage from './pages/PrivacidadePage'
import SobrePage from './pages/SobrePage'
import SuportePage from './pages/SuportePage'
import DashboardPage from './pages/DashboardPage'
import MenuPage from './pages/MenuPage'
import PerfilPage from './pages/PerfilPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import AssinaturaPage from './pages/AssinaturaPage'
import AssinaturaRetornoPage from './pages/AssinaturaRetornoPage'
import PagamentosPage from './pages/PagamentosPage'
import DietPage from './pages/DietPage'
import CaloriasPage from './pages/CaloriasPage'
import MetaPage from './pages/MetaPage'
import PesoPage from './pages/PesoPage'
import { ListaReceitas, EditorReceita } from './pages/ReceitasPage'
import RelatorioPage from './pages/RelatorioPage'
import LembretesPage from './pages/LembretesPage'
import WorkoutPage from './pages/WorkoutPage'
import WorkoutTimerPage from './pages/WorkoutTimerPage'
import PlanoWizardPage from './pages/PlanoWizardPage'
import TreinoPlanoPage from './pages/TreinoPlanoPage'
import TreinoDiaPage from './pages/TreinoDiaPage'
import AdminPage from './pages/admin/AdminPage'
import PersonalPage from './pages/PersonalPage'
import AmigosPage from './pages/AmigosPage'
import { ListaAlunos, PainelAluno } from './pages/AlunosPage'
import { Spinner } from './components/UI'
import WelcomeSplash from './components/WelcomeSplash'

function Inicio() {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Spinner size="lg" /></div>
  return user ? <Navigate to="/dashboard" replace /> : <LandingPage />
}

/** A Central de Ajuda funciona para visitantes (layout público) e usuários logados (layout do app). */
function Suporte() {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Spinner size="lg" /></div>
  return user ? <Layout><SuportePage /></Layout> : <PublicLayout><SuportePage /></PublicLayout>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/" element={<Inicio />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
      <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
      <Route path="/termos" element={<TermosPage />} />
      <Route path="/privacidade" element={<PrivacidadePage />} />
      <Route path="/sobre" element={<SobrePage />} />
      <Route path="/suporte" element={<Suporte />} />
      <Route path="/precos" element={<Navigate to="/#precos" replace />} />

      {/* Conta (login obrigatório, sem exigir assinatura) */}
      <Route path="/dashboard" element={<RotaPrivada><DashboardPage /></RotaPrivada>} />
      <Route path="/menu" element={<RotaPrivada><MenuPage /></RotaPrivada>} />
      <Route path="/perfil" element={<RotaPrivada><PerfilPage /></RotaPrivada>} />
      <Route path="/configuracoes" element={<RotaPrivada><ConfiguracoesPage /></RotaPrivada>} />
      <Route path="/assinatura" element={<RotaPrivada><AssinaturaPage /></RotaPrivada>} />
      <Route path="/assinatura/retorno" element={<RotaPrivada><AssinaturaRetornoPage /></RotaPrivada>} />
      <Route path="/meta" element={<RotaPrivada><MetaPage /></RotaPrivada>} />
      <Route path="/pagamentos" element={<RotaPrivada><PagamentosPage /></RotaPrivada>} />
      <Route path="/personal" element={<RotaPrivada><PersonalPage /></RotaPrivada>} />
      <Route path="/convite/:codigo" element={<RotaPrivada><PersonalPage /></RotaPrivada>} />
      <Route path="/amigos" element={<RotaPrivada><AmigosPage /></RotaPrivada>} />
      <Route path="/amigo/:codigo" element={<RotaPrivada><AmigosPage /></RotaPrivada>} />

      {/* Premium */}
      <Route path="/dieta" element={<RotaPremium recurso="O plano alimentar"><DietPage /></RotaPremium>} />
      <Route path="/dieta/:id" element={<RotaPremium recurso="O plano alimentar"><DietPage /></RotaPremium>} />
      <Route path="/receitas" element={<RotaPremium recurso="As receitas"><ListaReceitas /></RotaPremium>} />
      <Route path="/receitas/nova" element={<RotaPremium recurso="As receitas"><EditorReceita /></RotaPremium>} />
      <Route path="/receitas/:id" element={<RotaPremium recurso="As receitas"><EditorReceita /></RotaPremium>} />
      <Route path="/relatorio" element={<RotaPremium recurso="O relatório semanal"><RelatorioPage /></RotaPremium>} />
      <Route path="/alunos" element={<RotaPremium recurso="O acompanhamento de alunos"><ListaAlunos /></RotaPremium>} />
      <Route path="/alunos/:alunoId" element={<RotaPremium recurso="O acompanhamento de alunos"><PainelAluno /></RotaPremium>} />
      <Route path="/lembretes" element={<RotaPremium recurso="Os lembretes"><LembretesPage /></RotaPremium>} />
      <Route path="/peso" element={<RotaPremium recurso="O controle de peso"><PesoPage /></RotaPremium>} />
      <Route path="/calorias" element={<RotaPremium recurso="O diário alimentar"><CaloriasPage /></RotaPremium>} />
      <Route path="/treino" element={<RotaPremium recurso="Os treinos"><WorkoutPage /></RotaPremium>} />
      <Route path="/treino/novo" element={<RotaPremium recurso="Os treinos"><PlanoWizardPage /></RotaPremium>} />
      <Route path="/treino/:id" element={<RotaPremium recurso="Os treinos"><TreinoPlanoPage /></RotaPremium>} />
      <Route path="/treino/:id/editar" element={<RotaPremium recurso="Os treinos"><PlanoWizardPage /></RotaPremium>} />
      <Route path="/treino/:id/dia/:dia" element={<RotaPremium recurso="Os treinos"><TreinoDiaPage /></RotaPremium>} />

      {/* Timer — fullscreen sem o Layout */}
      <Route path="/assistente/:treinoId/:diaIndex" element={<RotaPremium recurso="O contador de treino" semLayout><WorkoutTimerPage /></RotaPremium>} />
      <Route path="/assistente/:treinoId/:diaIndex/:exId" element={<RotaPremium recurso="O contador de treino" semLayout><WorkoutTimerPage /></RotaPremium>} />

      {/* Administração */}
      <Route path="/admin" element={<RotaAdmin><AdminPage /></RotaAdmin>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AcessoProvider>
          <AppRoutes />
          <WelcomeSplash />
        </AcessoProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
