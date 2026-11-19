// Teste de ponta a ponta do build único (docs/index.html) no Chromium.
// Execução: npm run build && node scripts/smoke.mjs [pasta-das-capturas]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(join(globalRoot, 'playwright'));
  }
}
const { chromium } = loadPlaywright();

const root = resolve(new URL('..', import.meta.url).pathname);
const outDir = resolve(process.argv[2] ?? join(tmpdir(), 'arcada-smoke'));
mkdirSync(outDir, { recursive: true });

const EXAMPLES = ['viga-biapoiada', 'portico-plano', 'arco-parabolico-biarticulado', 'arco-triarticulado', 'arco-atirantado'];
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${msg}`);
  if (!ok) failures.push(msg);
};
const parsePt = (t) => Number(String(t).trim().replace(/\./g, '').replace(',', '.'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(pathToFileURL(join(root, 'docs', 'index.html')).href);
await page.waitForSelector('[data-testid=status]');

for (const slug of EXAMPLES) {
  await page.click('[data-testid=examples-menu]');
  await page.click(`[data-testid=example-${slug}]`);
  const status = (await page.textContent('[data-testid=status]')).trim();
  check(status === 'Análise concluída', `exemplo ${slug}: ${status}`);
}

// arco parabólico biarticulado: H ≈ qL²/(8f) = 10·20²/(8·5) = 100 kN
await page.click('[data-testid=examples-menu]');
await page.click('[data-testid=example-arco-parabolico-biarticulado]');
await page.click('[data-testid=side-results]');
const H = parsePt(await page.textContent('[data-testid=reaction-n1-fx]'));
check(Math.abs(H / 100 - 1) < 0.005, `reação horizontal do arco = ${H} kN (esperado 100 ± 0,5%)`);

for (const view of ['M', 'deformed']) {
  await page.click(`[data-testid=tab-${view}]`);
  await page.waitForTimeout(100);
  const file = join(outDir, `arco-${view}.png`);
  await page.screenshot({ path: file });
  console.log(`captura: ${file}`);
}

// exportações
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-menu]').then(() => page.click('[data-testid=export-csv]'))]);
const csvText = readFileSync(await csv.path(), 'utf8');
check(csvText.startsWith('﻿elemento;s (m)') && csvText.split('\n').length > 40, `CSV exportado (${csvText.length} caracteres)`);
const [png] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-menu]').then(() => page.click('[data-testid=export-png]'))]);
const pngBytes = readFileSync(await png.path());
await png.saveAs(join(outDir, 'exportado.png'));
check(pngBytes.length > 5000 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4e, `PNG exportado (${pngBytes.length} bytes)`);

// estrutura instável mostra mensagem e não quebra a tela
await page.click('[data-testid=tab-model]');
await page.click('[data-testid=examples-menu]');
await page.click('[data-testid=example-viga-biapoiada]');
await page.click('[data-testid=side-props]');
const nodeBox = await page.locator('[data-node=n1]').boundingBox();
await page.mouse.click(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
await page.click('[data-testid=support-free]');
const unstable = (await page.textContent('[data-testid=status]')).trim();
check(/instável/i.test(unstable), `viga sem apoio fixo: ${unstable}`);

check(errors.length === 0, `console sem erros (${errors.length})`);
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log('\nTodas as verificações passaram.');
