import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AccessGate } from './features/access/AccessGate'
import './styles/global.css'
createRoot(document.getElementById('root')!).render(<StrictMode><AccessGate><App /></AccessGate></StrictMode>)
