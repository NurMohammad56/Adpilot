import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import localizationPlugin from './scripts/i18n-plugin.js';
export default defineConfig({
  plugins: [react({ babel: { plugins: [localizationPlugin] } })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4000' } },
  build: { outDir: 'dist' },
});
