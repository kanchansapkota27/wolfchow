import path from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5174,
    proxy: {
      // Forward /r2/* to the local Worker so uploaded images are served in dev
      '/r2': { target: 'http://localhost:8789', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
