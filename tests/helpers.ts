import { expect } from 'vitest';
import { emptyModel, addNode, addBar, setSupport, updateSection, updateMember, setNodalLoad } from '../src/model/ops';
import type { AnalysisOk, Analysis } from '../src/solver/analyze';
import type { DistLoad, Model, Support } from '../src/model/types';

export const FIX: Support = { rx: true, ry: true, rz: true };
export const PIN: Support = { rx: true, ry: true, rz: false };
export const ROLLER: Support = { rx: false, ry: true, rz: false };

/** Modelo vazio com a seção de referência: 25 GPa, retangular 20×50 cm (EI = 52 083,33 kN·m²). */
export function refModel(): Model {
  return updateSection(emptyModel(), 's1', { E: 25e6, shape: { kind: 'rect', b: 0.2, h: 0.5 } });
}
export const EI_REF = (25e6 * 0.2 * 0.5 ** 3) / 12;

/** Viga horizontal com nós nas abscissas dadas e barras entre nós consecutivos. */
export function beam(xs: number[], base: Model = refModel()): { m: Model; nodes: string[]; bars: string[] } {
  let m = base;
  const nodes: string[] = [];
  for (const x of xs) {
    const r = addNode(m, x, 0);
    m = r.model;
    nodes.push(r.id);
  }
  const bars: string[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const r = addBar(m, nodes[i], nodes[i + 1]);
    m = r.model;
    bars.push(r.id);
  }
  return { m, nodes, bars };
}

export function withLoad(m: Model, bar: string, l: DistLoad): Model {
  const mem = m.members.find((k) => k.id === bar)!;
  return updateMember(m, bar, { loads: [...mem.loads, l] });
}

export const uniformY = (q: number): DistLoad => ({ dir: 'globalY', ref: 'length', qi: q, qj: q });

export { setSupport, setNodalLoad, updateMember, addNode, addBar };

export function ok(res: Analysis): AnalysisOk {
  if (!res.ok) throw new Error(`análise falhou: ${res.issues.map((i) => i.message).join('; ')}`);
  return res;
}

export function reaction(res: AnalysisOk, nodeId: string) {
  const r = res.reactions.find((k) => k.nodeId === nodeId);
  if (!r) throw new Error(`sem reação no nó ${nodeId}`);
  return r;
}

/** Índices dos elementos da malha de um membro. */
export function elemsOf(res: AnalysisOk, memberId: string): number[] {
  return res.mesh.memberElems.get(memberId)!;
}

export function expectClose(actual: number, expected: number, rel = 1e-9): void {
  const tol = rel * Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected), `esperado ${expected}, obtido ${actual}`).toBeLessThanOrEqual(tol);
}

/**
 * Equilíbrio global: cargas nodais + cargas distribuídas (integradas sobre os
 * elementos da malha) + reações = 0 em Fx, Fy e momento em torno da origem.
 */
export function expectEquilibrium(model: Model, res: AnalysisOk): void {
  let fx = 0;
  let fy = 0;
  let mz = 0;
  let scale = 0;
  const add = (x: number, y: number, px: number, py: number, m = 0) => {
    fx += px;
    fy += py;
    mz += x * py - y * px + m;
    scale += Math.abs(px) + Math.abs(py) + Math.abs(m) / 10;
  };
  for (const n of model.nodes) {
    if (n.load) add(n.x, n.y, n.load.fx, n.load.fy, n.load.mz);
  }
  for (const r of res.reactions) {
    const n = model.nodes.find((k) => k.id === r.nodeId)!;
    add(n.x, n.y, r.fx, r.fy, r.mz);
  }
  for (const e of res.mesh.elems) {
    const A = res.mesh.nodes[e.a];
    const B = res.mesh.nodes[e.b];
    // Simpson (exato para integrando quadrático)
    const pts = [0, 0.5, 1];
    const wts = [1 / 6, 4 / 6, 1 / 6];
    pts.forEach((t, i) => {
      const p = e.load.px1 + (e.load.px2 - e.load.px1) * t;
      const w = e.load.wy1 + (e.load.wy2 - e.load.wy1) * t;
      const gx = (p * e.c - w * e.s) * e.L * wts[i];
      const gy = (p * e.s + w * e.c) * e.L * wts[i];
      add(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, gx, gy);
    });
  }
  const tol = 1e-8 * Math.max(1, scale);
  expect(Math.abs(fx), `ΣFx = ${fx}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(fy), `ΣFy = ${fy}`).toBeLessThanOrEqual(tol);
  expect(Math.abs(mz), `ΣM = ${mz}`).toBeLessThanOrEqual(tol * 10);
}
