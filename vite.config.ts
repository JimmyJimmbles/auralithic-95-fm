import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.localhost', 'localhost', '127.0.0.1', 'auralithic.fm', '.auralithic.fm'],
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '/media': {
        target: api,
        changeOrigin: true,
        bypass: (request) => {
          const path = request.url?.split('?')[0] ?? ''
          if (path.endsWith('.svg')) return path
        },
      },
    },
  },
})
