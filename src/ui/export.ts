import type { Model } from '../model/types';
import type { AnalysisOk } from '../solver/analyze';
import { memberStations } from '../solver/diagrams';
import { formatNumber } from './format';

/** CSV com separador ";" e vírgula decimal (abre direto no Excel em português). */
export function stationsCsv(model: Model, res: AnalysisOk): string {
  const lines = ['elemento;s (m);x (m);y (m);N (kN);Q (kN);M (kN·m);dx (mm);dy (mm)'];
  for (const k of model.members) {
    for (const p of memberStations(model, res, k.id, 40)) {
      lines.push(
        [k.id, p.s, p.x, p.y, p.N, p.Q, p.M, p.dx * 1000, p.dy * 1000]
          .map((v, i) => (i === 0 ? String(v) : formatNumber(v as number, 4)))
          .join(';'),
      );
    }
  }
  lines.push('');
  lines.push('nó;Rx (kN);Ry (kN);Mz (kN·m)');
  for (const r of res.reactions) lines.push([r.nodeId, formatNumber(r.fx, 4), formatNumber(r.fy, 4), formatNumber(r.mz, 4)].join(';'));
  return String.fromCharCode(0xfeff) + lines.join('\r\n') + '\r\n';
}

/** Executa fn com o tema claro ativo, para a imagem exportada sair sempre em fundo claro. */
function withLightTheme<T>(fn: () => T): T {
  const root = document.documentElement;
  const prev = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  try {
    return fn();
  } finally {
    if (prev === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prev);
  }
}

/** Copia o SVG resolvendo as variáveis CSS, para virar imagem independente da página. */
export function standaloneSvg(svg: SVGSVGElement): string {
  return withLightTheme(() => buildStandaloneSvg(svg));
}

function buildStandaloneSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const css = getComputedStyle(document.documentElement);
  const resolve = (v: string) => v.replace(/var\((--[a-z0-9-]+)\)/gi, (_, name: string) => css.getPropertyValue(name).trim() || '#000');
  const walk = (el: Element) => {
    for (const attr of ['fill', 'stroke']) {
      const v = el.getAttribute(attr);
      if (v && v.includes('var(')) el.setAttribute(attr, resolve(v));
    }
    for (const c of Array.from(el.children)) walk(c);
  };
  walk(clone);
  const w = svg.clientWidth;
  const h = svg.clientHeight;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `text{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}.svg-label{font-size:11px;paint-order:stroke;stroke:${resolve('var(--canvas)')};stroke-width:3px;stroke-linejoin:round}`;
  clone.insertBefore(style, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

/** Imagem PNG (2×) da área de desenho, ou null se o navegador não conseguir gerá-la. */
export async function pngBlob(svg: SVGSVGElement): Promise<Blob | null> {
  const xml = standaloneSvg(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Falha ao gerar a imagem'));
      img.src = url;
    });
    const k = 2;
    const canvas = document.createElement('canvas');
    canvas.width = svg.clientWidth * k;
    canvas.height = svg.clientHeight * k;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(k, k);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
