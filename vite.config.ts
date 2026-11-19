/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * A entrada de desenvolvimento é app.html; o index.html da raiz é só um redirecionamento
 * para docs/index.html (assim o GitHub Pages funciona tanto pela raiz quanto pela pasta /docs).
 * Este plugin grava o build como docs/index.html e, no servidor de desenvolvimento, abre app.html em "/".
 */
function appEntry(): Plugin {
  return {
    name: 'app-entry',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/app.html';
        next();
      });
    },
    generateBundle(_options, bundle) {
      const html = bundle['app.html'];
      if (html) html.fileName = 'index.html';
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), appEntry()],
  build: {
    outDir: 'docs',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: 'app.html' },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
