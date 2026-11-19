// Gera a versão da aplicação para publicar como página hospedada no claude.ai (Artifact).
// Diferenças em relação a docs/index.html:
//   - é um fragmento (sem <html>, <head>, <body>): a plataforma acrescenta o esqueleto do documento;
//   - o React vem do cdnjs em vez de ir embutido;
//   - as fontes Inter e Space Grotesk vêm do Google Fonts (com pilha de reserva do sistema).
// Execução: node scripts/build-artifact.mjs [arquivo-de-saída]   (padrão: dist/structan-arch-2d.html)
import { build } from 'vite';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(process.argv[2] ?? join(root, 'dist', 'structan-arch-2d.html'));
const tmp = mkdtempSync(join(tmpdir(), 'structan-arch-2d-artifact-'));

const REACT = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';
const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap';

try {
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    // JSX clássico (React.createElement) para funcionar com o React global do cdnjs
    esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', jsxInject: "import * as React from 'react'" },
    build: {
      outDir: tmp,
      emptyOutDir: true,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        external: ['react', 'react-dom/client'],
        output: {
          format: 'iife',
          globals: { react: 'React', 'react-dom/client': 'ReactDOM' },
          entryFileNames: 'app.js',
          assetFileNames: 'app.[ext]',
        },
      },
    },
  });

  const js = readFileSync(join(tmp, 'app.js'), 'utf8');
  const css = readFileSync(join(tmp, 'app.css'), 'utf8');
  if (/^\s*import\s/m.test(js)) throw new Error('o pacote ainda contém import: o React não foi externalizado');

  const html = [
    '<title>StructAN-Arch-2D</title>',
    '<meta name="claude:viewport-fit-sides" content="cover">',
    `<link rel="stylesheet" href="${FONTS}">`,
    `<style>${css.trim()}</style>`,
    '<div id="root"></div>',
    `<script src="${REACT}"></script>`,
    `<script src="${REACT_DOM}"></script>`,
    `<script>${js.trim().replace(/<\/script/gi, '<\\/script')}</script>`,
    '',
  ].join('\n');

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`${out}  ${(html.length / 1024).toFixed(1)} kB`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
