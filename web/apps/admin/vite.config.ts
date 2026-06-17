import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each app builds and deploys independently to its own Cloudflare Pages project
// (`pnpm --filter @wolfchow/app-admin deploy`), so the apps stay decoupled.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: { outDir: 'dist' },
})
