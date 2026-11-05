
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [react()],

  server: {
    host: 'localhost',
    port: 5173,

    ...( !isProduction && {
      https: {
        key: fs.readFileSync('../certs/localhost-key.pem'),
        cert: fs.readFileSync('../certs/localhost.pem')
      }
    }),

    proxy: {
      '/api': {
        target: 'https://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
