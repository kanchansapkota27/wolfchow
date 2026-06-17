import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each app builds and deploys independently to its own Cloudflare Pages project
// (`pnpm --filter @wolfchow/app-tracking deploy`), so the apps stay decoupled.
export default defineConfig({
  plugins: [react()],
  server: { port: 5177 },
  build: { outDir: 'dist' },
})
