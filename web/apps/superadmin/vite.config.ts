import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Each app builds and deploys independently to its own Cloudflare Pages project
// (`pnpm --filter @wolfchow/app-superadmin deploy`), so the apps stay decoupled.
// tailwindcss() must be first per https://tailwindcss.com/docs/installation/vite
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 5173 },
  build: { outDir: 'dist' },
})
