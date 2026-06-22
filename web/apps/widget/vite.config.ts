import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  server: { port: 5176 },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      name: 'RestroApiWidget',
      fileName: () => 'embed.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    outDir: 'dist',
    minify: true,
  },
})
