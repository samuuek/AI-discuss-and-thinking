import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { modelGatewayPlugin } from './src/server/modelGateway.ts'
export default defineConfig(({ mode }) => { const env = loadEnv(mode, '.', ''); return { plugins: [react(), modelGatewayPlugin(env)], test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' } } })
