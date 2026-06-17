import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev we proxy API + SSE to the server so the dashboard is same-origin.
// In prod, set VITE_API_BASE to the server URL at build time.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
