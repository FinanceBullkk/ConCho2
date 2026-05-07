import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { initSentry } from './lib/sentry'
import './index.css'
import App from './App.jsx'

// Initialize Sentry as early as possible so even errors thrown during
// React hydration are captured. No-op when VITE_SENTRY_DSN is unset.
initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
