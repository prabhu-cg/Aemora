import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Never inline assets as data: URLs. The Content-Security-Policy does not allow data: fonts, and a font that is
    // quietly refused is a font that quietly does not load.
    assetsInlineLimit: 0,
  },
  server: { host: 'localhost', port: 5173, strictPort: true },
})
