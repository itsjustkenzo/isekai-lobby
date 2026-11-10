import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:3001' } },
});
