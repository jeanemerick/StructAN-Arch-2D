/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'docs',
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
