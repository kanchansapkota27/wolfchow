import path from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 5174 },
  build: { outDir: 'dist' },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
