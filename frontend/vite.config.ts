import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000,
    // Lewat tunnel: HP buka https://xxx.trycloudflare.com → frontend call /api
    // → Vite proxy ke backend Go lokal. Same-origin, gak ada CORS.
    proxy: {
      '/api': 'http://localhost:8080',
    },
    // Cloudflare tunnel host header beda; pre-allow biar Vite gak nolak.
    allowedHosts: true,
  },
})
