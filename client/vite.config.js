import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'node:path'

// ──────────────────────────────────────────────────────────
// Vite config
// ──────────────────────────────────────────────────────────
// Source-map upload to Sentry runs only when ALL three of
// SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT are set in the build
// environment. Locally those vars are absent, so the plugin no-ops.
// ──────────────────────────────────────────────────────────

const sentryAuth = process.env.SENTRY_AUTH_TOKEN
const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT
const sentryRelease = process.env.VITE_SENTRY_RELEASE

const enableSentryUpload = !!(sentryAuth && sentryOrg && sentryProject)

export default defineConfig({
  cacheDir: path.resolve(__dirname, '.vite-cache'),
  plugins: [
    react(),
    tailwindcss(),
    // Must be the LAST plugin in the array per @sentry/vite-plugin docs.
    enableSentryUpload &&
      sentryVitePlugin({
        authToken: sentryAuth,
        org: sentryOrg,
        project: sentryProject,
        release: { name: sentryRelease },
        // Only upload sourcemaps from the production bundle directory.
        sourcemaps: { assets: './dist/**' },
        // Don't fail the build if Sentry is unreachable — deploys must
        // still go out. Errors are logged to stderr.
        errorHandler: (err) => {
          console.warn('[sentry-vite-plugin] upload failed:', err.message)
        },
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Source maps must exist for the Sentry plugin to upload them. Hidden
    // (no //# sourceMappingURL footer) so end users can't trivially fetch
    // the .map.js files from the live site.
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Manual vendor chunking — keeps the initial JS payload small by
        // splitting heavy 3rd-party libs into their own cacheable chunks
        // that the browser can fetch in parallel. Rolldown (Vite 8)
        // requires `manualChunks` as a function rather than an object map.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/@sentry/'))                       return 'sentry-vendor'
          if (id.includes('/lucide-react/'))                  return 'icons-vendor'
          if (id.includes('/react-router'))                   return 'react-vendor'
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          )                                                   return 'react-vendor'
          if (id.includes('/@radix-ui/') || id.includes('/radix-ui/'))
                                                              return 'radix-vendor'
          if (id.includes('/@tanstack/') || id.includes('/axios/'))
                                                              return 'query-vendor'
          if (id.includes('/sonner/'))                       return 'toast-vendor'
          return undefined
        },
      },
    },
    // Bump the warning ceiling slightly — the chunked vendor bundles are
    // still well under it, but the default 500 KB is noisy.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Exclude Playwright e2e/ — those use @playwright/test, not vitest.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**', '**/*.e2e.*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['src/test/**', 'src/main.jsx', '**/*.config.*', 'e2e/**'],
      thresholds: { lines: 60, functions: 60, branches: 60 },
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
