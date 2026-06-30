import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5176 },
  // Replace process.env.NODE_ENV so React's browser bundle doesn't reference the
  // Node.js `process` global (which doesn't exist in browsers).
  define: {
    'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
  },
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
}))
