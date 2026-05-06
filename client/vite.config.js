import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Honor PORT env so the preview-server harness can choose a free port
    // when 3000 is already in use. Falls back to 3000 in dev.
    port: Number(process.env.PORT) || 3000,
    strictPort: !!process.env.PORT,
    host: true,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
