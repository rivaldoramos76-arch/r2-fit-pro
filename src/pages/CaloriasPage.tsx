import { useNavigate } from 'react-router-dom'
import CalorieCounter from './CalorieCounter'

export default function CaloriasPage() {
  const navigate = useNavigate()
  return <CalorieCounter onBack={() => navigate('/dashboard')} />
}
