import './i18n/index.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { initSentry } from './lib/sentry'
import api from './api/api'
import './index.css'
import App from './App.jsx'

// Initialize Sentry as early as possible so even errors thrown during
// React hydration are captured. No-op when VITE_SENTRY_DSN is unset.
initSentry()

// Prime the CSRF cookie before any user interactions so the double-submit
// check passes on the very first POST/PUT/PATCH/DELETE the user makes.
api.get('/auth/csrf').catch(() => { /* non-fatal — cookie will be set on first request */ })

// Register the PWA service worker (offline attendance shell + roster cache +
// Background Sync). Production only — in dev it would fight Vite's HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA is progressive — app still works */ })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
