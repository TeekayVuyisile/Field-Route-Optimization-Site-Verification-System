import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tailwind first: it declares the layer order every later stylesheet uses.
// Then Bootstrap/toastify, then the old global styles, all in `legacy`.
import './styles/app.css'
import './styles/legacy.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
