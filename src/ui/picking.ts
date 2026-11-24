import type { Id, Member, Model } from '../model/types';
import { placeNode, splitMember } from '../model/ops';
import { hitTest, snapAlongMember, type Pt } from './geometry';

export interface PickOptions {
  /** Tolerância de clique em metros (pixels de tolerância ÷ escala da vista). */
  tol: number;
  snap: boolean;
  grid: number;
  polylines?: Map<Id, Pt[]>;
}

/** Arredonda ao milímetro (evita coordenadas como 7,560027533). */
export function roundMm(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

/** Múltiplo do passo da grade, sem o ruído do ponto flutuante (0,37 e não 0,37000000000000005). */
export function snapToGrid(v: number, grid: number): number {
  const r = Number((Math.round(v / grid) * grid).toPrecision(12));
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Ponto do clique: o nó mais próximo dentro da tolerância; senão o ponto da grade (snap ligado)
 * ou o ponto arredondado ao milímetro (snap desligado).
 */
export function snapPoint(m: Model, raw: Pt, o: Pick<PickOptions, 'tol' | 'snap' | 'grid'>): Pt {
  for (const n of m.nodes) if (Math.hypot(n.x - raw.x, n.y - raw.y) <= o.tol) return { x: n.x, y: n.y };
  if (!o.snap || !(o.grid > 0)) return { x: roundMm(raw.x), y: roundMm(raw.y) };
  return { x: snapToGrid(raw.x, o.grid), y: snapToGrid(raw.y, o.grid) };
}

export function insideMember(m: Model, k: Member, at: number): boolean {
  if (k.kind === 'bar') return at > 1e-3 && at < 1 - 1e-3;
  const ni = m.nodes.find((n) => n.id === k.ni)!;
  const nj = m.nodes.find((n) => n.id === k.nj)!;
  const eps = 1e-3 * (nj.x - ni.x);
  return at > ni.x + eps && at < nj.x - eps;
}

/**
 * Nó para um clique das ferramentas Nó e Barra: o nó existente sob o cursor; um nó inserido
 * na barra ou no arco clicado (na grade, ao longo do elemento); ou um nó novo no ponto,
 * já ligado ao que estiver ali. Devolve null quando o clique não pode criar nó.
 */
export function resolveClickNode(m: Model, raw: Pt, o: PickOptions): { model: Model; id: Id } | null {
  const hit = hitTest(m, raw.x, raw.y, o.tol, o.polylines);
  if (hit?.kind === 'node') return { model: m, id: hit.id };
  if (hit?.kind === 'member') {
    const mem = m.members.find((k) => k.id === hit.id)!;
    // na grade ao longo do elemento; com o snap desligado, no milímetro
    const at = snapAlongMember(m, mem, hit.at, o.snap && o.grid > 0 ? o.grid : 0.001);
    if (!insideMember(m, mem, at)) return null;
    try {
      const s = splitMember(m, hit.id, at);
      return { model: s.model, id: s.nodeId };
    } catch {
      // arco com equação inválida: não há onde inserir o nó
      return null;
    }
  }
  const p = snapPoint(m, raw, o);
  return placeNode(m, p.x, p.y);
}
