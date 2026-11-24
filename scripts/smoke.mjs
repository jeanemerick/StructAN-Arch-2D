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
const outDir = resolve(process.argv[2] ?? join(tmpdir(), 'structan-arch-2d-smoke'));
mkdirSync(outDir, { recursive: true });
const url = pathToFileURL(join(root, 'docs', 'index.html')).href;

const EXAMPLES = [
  'viga-biapoiada',
  'portico-plano',
  'arco-parabolico-biarticulado',
  'arco-triarticulado',
  'arco-atirantado',
  'arco-triarticulado-faixa',
  'portico-duas-aguas-tirantes',
];
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${msg}`);
  if (!ok) failures.push(msg);
};
const parsePt = (t) => Number(String(t).trim().replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForSelector('[data-testid=status]');

async function openExample(slug) {
  await page.click('[data-testid=examples-menu]');
  await page.click(`[data-testid=example-${slug}]`);
  // modelo alterado: a página pede confirmação antes de descartar
  if (await page.locator('[data-testid=confirm]').count()) await page.click('[data-testid=confirm-yes]');
}
const status = async () => (await page.textContent('[data-testid=status]')).trim();
const count = (sel) => page.locator(sel).count();

for (const slug of EXAMPLES) {
  await openExample(slug);
  const s = await status();
  check(s === 'Análise concluída', `exemplo ${slug}: ${s}`);
}

// arco parabólico biarticulado: H ≈ qL²/(8f) = 10·20²/(8·5) = 100 kN (lido no rótulo da reação)
await openExample('arco-parabolico-biarticulado');
await page.click('[data-testid=tab-reactions]');
const H = parsePt(await page.textContent('[data-testid=reaction-n1-fx]'));
check(Math.abs(H / 100 - 1) < 0.005, `reação horizontal do arco = ${H} kN (esperado 100 ± 0,5%)`);

// D2: reações também na vista M, com a caixa Reações
await page.click('[data-testid=tab-M]');
check((await count('[data-testid=reaction-n1-fx]')) === 1, 'reações aparecem junto do diagrama de M');
await page.uncheck('[data-testid=show-reactions]');
check((await count('[data-testid=reaction-n1-fx]')) === 0, 'caixa Reações desliga as reações na vista M');
await page.check('[data-testid=show-reactions]');
// D4: extremos destacados
check((await count('[data-testid=extreme-max]')) + (await count('[data-testid=extreme-min]')) >= 1, 'extremos de M marcados com máx/mín');

for (const view of ['M', 'deformed']) {
  await page.click(`[data-testid=tab-${view}]`);
  await page.waitForTimeout(100);
  const file = join(outDir, `arco-${view}.png`);
  await page.screenshot({ path: file });
  console.log(`captura: ${file}`);
}

// D3: Esc numa vista de resultado volta ao modelo, mesmo com o foco no formulário do arco
const arcLine = await page.locator('[data-member=m1]').boundingBox();
await page.mouse.click(arcLine.x + arcLine.width / 2, arcLine.y + 2);
await page.click('[data-testid=arcedit-submit]');
await page.keyboard.press('Escape');
check((await page.getAttribute('[data-testid=tab-model]', 'class')).includes('active'), 'Esc volta da vista de resultado para o modelo');

// exportações
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-menu]').then(() => page.click('[data-testid=export-csv]'))]);
const csvText = readFileSync(await csv.path(), 'utf8');
check(csvText.charCodeAt(0) === 0xfeff && csvText.slice(1).startsWith('elemento;s (m)') && csvText.split('\n').length > 40, `CSV exportado (${csvText.length} caracteres)`);
const [png] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-menu]').then(() => page.click('[data-testid=export-png]'))]);
const pngBytes = readFileSync(await png.path());
await png.saveAs(join(outDir, 'exportado.png'));
check(pngBytes.length > 5000 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4e, `PNG exportado (${pngBytes.length} bytes)`);

// D1: arco da imagem 1 com a carga em faixa reta; opção de vista volta ao desenho antigo
await openExample('arco-triarticulado-faixa');
check((await count('[data-testid=load-band]')) === 1, 'carga do arco desenhada numa faixa reta só');
await page.screenshot({ path: join(outDir, 'arco-faixa.png') });
await page.check('[data-testid=loads-on-axis]');
check((await count('[data-testid=load-band]')) === 0, 'opção "Cargas sobre o eixo" volta ao desenho antigo');
await page.uncheck('[data-testid=loads-on-axis]');
await page.click('[data-testid=tab-reactions]');
const H2 = parsePt(await page.textContent('[data-testid=reaction-n1-fx]'));
check(Math.abs(H2 / 30 - 1) < 0.001, `arco da imagem 1: H = ${H2} kN (esperado 30)`);
await page.click('[data-testid=tab-model]');

// C2 + C3 + C4: nó por coordenadas e arco entre dois nós, tudo com Enter
await page.click('[data-testid=file-new]');
if (await count('[data-testid=confirm]')) await page.click('[data-testid=confirm-yes]');
await page.click('[data-testid=tool-node]');
await page.click('[data-testid=node-mode-coords]');
for (const [x, y] of [
  ['0', '0'],
  ['6', '0'],
]) {
  await page.fill('[data-testid=coord-x]', x);
  await page.keyboard.press('Tab');
  await page.fill('[data-testid=coord-y]', y);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
}
check((await count('[data-node]')) === 2, 'dois nós criados por coordenadas com Enter');
check((await page.evaluate(() => document.activeElement?.id)) === 'coord-x', 'foco volta ao X depois de criar o nó');
// Enter com um campo inválido não cria nada
await page.fill('[data-testid=coord-x]', '6');
await page.keyboard.press('Tab');
await page.fill('[data-testid=coord-y]', '1,5m');
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
check((await count('[data-node]')) === 2, 'Enter com valor inválido (1,5m) não cria o nó');
await page.fill('[data-testid=coord-y]', '0');
await page.keyboard.press('Tab');
await page.click('[data-testid=tool-arc]');
for (const [id, v] of [
  ['arc-xi', '0'],
  ['arc-yi', '0'],
  ['arc-xj', '6'],
  ['arc-yj', '0'],
  ['arc-rise', '1,5'],
]) {
  await page.fill(`[data-testid=${id}]`, v);
  await page.keyboard.press('Tab');
}
await page.focus('[data-testid=arc-rise]');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
check((await count('[data-member]')) === 1 && (await count('[data-node]')) === 2, 'arco criado entre os dois nós existentes (Enter)');
for (const id of ['n1', 'n2']) {
  const b = await page.locator(`[data-node=${id}]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.click('[data-testid=support-pin]');
}
check((await status()) === 'Análise concluída', 'arco novo analisado');

// C6: selecionar tudo, duplicar com Enter e desfazer num passo
await page.keyboard.press('Control+a');
await page.keyboard.press('Control+d');
await page.waitForSelector('[data-testid=duplicate-form]');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check((await count('[data-member]')) === 2 && (await count('[data-node]')) === 4, 'Duplicar copia o arco e os nós');
check((await status()) === 'Análise concluída', 'modelo com as duas estruturas analisado');
await page.keyboard.press('Control+z');
check((await count('[data-member]')) === 1, 'Ctrl+Z remove a cópia num passo');
await page.keyboard.press('Control+y');

// D6: avisos listados a partir da barra de status (nó solto gera aviso)
await page.click('[data-testid=tool-node]');
await page.click('[data-testid=node-mode-coords]');
await page.fill('[data-testid=coord-x]', '3');
await page.keyboard.press('Tab');
await page.fill('[data-testid=coord-y]', '6');
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await page.click('[data-testid=issues-toggle]');
check((await count('[data-testid=issues-list] .issue')) >= 1, 'avisos listados a partir da barra de status');
await page.keyboard.press('Escape');

// E1: Ajuda com índice e busca, Esc fecha
await page.click('[data-testid=help-open]');
await page.waitForSelector('[data-testid=help]');
await page.fill('[data-testid=help-search]', 'projecao');
const found = await page.locator('[data-testid^=help-section-]:visible').count();
check(found >= 1 && found < 12, `busca na Ajuda filtra as seções (${found} com "projecao")`);
await page.keyboard.press('Escape');
check((await count('[data-testid=help]')) === 0, 'Esc fecha a Ajuda');

// estrutura instável mostra mensagem e não quebra a tela
await openExample('viga-biapoiada');
const nodeBox = await page.locator('[data-node=n1]').boundingBox();
await page.mouse.click(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
await page.click('[data-testid=support-free]');
const unstable = await status();
check(/instável/i.test(unstable), `viga sem apoio fixo: ${unstable}`);

// tema escuro segue a preferência do sistema
const darkPage = await browser.newPage({ viewport: { width: 1400, height: 860 }, colorScheme: 'dark' });
await darkPage.goto(url);
await darkPage.waitForSelector('[data-testid=status]');
const darkBg = await darkPage.evaluate(() => getComputedStyle(document.body).backgroundColor);
check(darkBg === 'rgb(14, 19, 26)', `tema escuro aplicado (${darkBg})`);
await darkPage.close();

// celular: a página abre e analisa sem rolagem horizontal
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(url);
await phone.waitForSelector('[data-testid=status]');
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 0, `celular sem rolagem horizontal (${overflow}px)`);
await phone.screenshot({ path: join(outDir, 'celular.png') });
await phone.close();

check(errors.length === 0, `console sem erros (${errors.length})${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();

if (failures.length) {
  console.error(`\n${failures.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log('\nTodas as verificações passaram.');
