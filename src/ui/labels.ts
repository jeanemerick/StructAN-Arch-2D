import type { Pt } from './geometry';

/** Retângulo na tela. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LabelRequest {
  key: string;
  text: string;
  /** Posições candidatas do centro do texto, em ordem de preferência. */
  candidates: Pt[];
  /** Maior prioridade é colocada primeiro; prioridade ≥ `keep` nunca é descartada. */
  priority: number;
  fontSize?: number;
}

export interface PlacedLabel {
  key: string;
  text: string;
  x: number;
  y: number;
  box: Box;
}

/** Largura estimada do texto (fonte da interface, algarismos tabulares). */
export function textBox(text: string, c: Pt, fontSize = 12): Box {
  const w = text.length * fontSize * 0.56 + 4;
  const h = fontSize + 4;
  return { minX: c.x - w / 2, maxX: c.x + w / 2, minY: c.y - h / 2, maxY: c.y + h / 2 };
}

export const boxesOverlap = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Coloca os rótulos sem colisão: em ordem de prioridade, cada um vai para a primeira posição
 * candidata livre. Sem posição livre, os de prioridade ≥ `keep` ficam onde sobrepõem menos e os
 * demais são descartados.
 */
export function placeLabels(reqs: LabelRequest[], blocked: Box[] = [], keep = 50): PlacedLabel[] {
  const taken: Box[] = [...blocked];
  const out: PlacedLabel[] = [];
  const order = [...reqs].sort((a, b) => b.priority - a.priority);
  for (const r of order) {
    let best: { c: Pt; box: Box; cost: number } | null = null;
    for (const c of r.candidates) {
      const box = textBox(r.text, c, r.fontSize);
      const cost = taken.reduce((acc, t) => acc + overlapArea(box, t), 0);
      if (!best || cost < best.cost) best = { c, box, cost };
      if (cost === 0) break;
    }
    if (!best) continue;
    if (best.cost > 0 && r.priority < keep) continue;
    taken.push(best.box);
    out.push({ key: r.key, text: r.text, x: best.c.x, y: best.c.y, box: best.box });
  }
  return out;
}
