import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Each app builds and deploys independently to its own Cloudflare Pages project
// (`pnpm --filter @wolfchow/app-superadmin deploy`), so the apps stay decoupled.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: { outDir: 'dist' },
})
