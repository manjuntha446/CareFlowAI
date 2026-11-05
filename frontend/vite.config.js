
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    https: {
      key: fs.readFileSync('../certs/localhost-key.pem'),
      cert: fs.readFileSync('../certs/localhost.pem')
    },
    proxy: {
      '/api': {
        target: 'https://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
