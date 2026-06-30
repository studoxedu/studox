import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installFetchInterceptor } from './lib/fetchInterceptor'
import { startSyncManager } from './lib/syncManager'

installFetchInterceptor()
startSyncManager()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
