import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import localizationPlugin from './scripts/i18n-plugin.js';
export default defineConfig(({ mode }) => ({
  base: `${(process.env.APP_BASE_PATH || loadEnv(mode, process.cwd(), 'APP_').APP_BASE_PATH || '').replace(/\/$/, '')}/`,
  plugins: [react({ babel: { plugins: [localizationPlugin] } })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4000' } },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/locales/')) return 'translations';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
}));
