import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// the sculpted bones are built off the main thread: set that up before anything asks for one
import './engine/meshes'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
