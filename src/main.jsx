import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tailwind + layered Bootstrap/toastify; must load before any page CSS so
// the layer order it declares applies to them
import './styles/app.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
