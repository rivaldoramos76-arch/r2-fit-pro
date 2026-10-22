import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import DietPage from './pages/DietPage'
import WorkoutPage from './pages/WorkoutPage'
import WorkoutTimerPage from './pages/WorkoutTimerPage'
import PlanoWizardPage from './pages/PlanoWizardPage'
import TreinoPlanoPage from './pages/TreinoPlanoPage'
import TreinoDiaPage from './pages/TreinoDiaPage'
import { Spinner } from './components/UI'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/auth" replace />

  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />

      <Route path="/dashboard" element={
        <ProtectedRoute><DashboardPage /></ProtectedRoute>
      } />

      <Route path="/dieta" element={
        <ProtectedRoute><DietPage /></ProtectedRoute>
      } />
      <Route path="/dieta/:id" element={
        <ProtectedRoute><DietPage /></ProtectedRoute>
      } />

      <Route path="/treino" element={
        <ProtectedRoute><WorkoutPage /></ProtectedRoute>
      } />
      <Route path="/treino/novo" element={
        <ProtectedRoute><PlanoWizardPage /></ProtectedRoute>
      } />
      <Route path="/treino/:id" element={
        <ProtectedRoute><TreinoPlanoPage /></ProtectedRoute>
      } />
      <Route path="/treino/:id/editar" element={
        <ProtectedRoute><PlanoWizardPage /></ProtectedRoute>
      } />
      <Route path="/treino/:id/dia/:dia" element={
        <ProtectedRoute><TreinoDiaPage /></ProtectedRoute>
      } />

      {/* Timer — fullscreen sem o Layout */}
      <Route path="/assistente/:treinoId/:diaIndex" element={
        user ? <WorkoutTimerPage /> : <Navigate to="/auth" replace />
      } />
      <Route path="/assistente/:treinoId/:diaIndex/:exId" element={
        user ? <WorkoutTimerPage /> : <Navigate to="/auth" replace />
      } />

      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
