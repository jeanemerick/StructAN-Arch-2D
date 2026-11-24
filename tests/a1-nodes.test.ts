import { describe, it, expect } from 'vitest';
import { analyze, type AnalysisOk } from '../src/solver/analyze';
import { memberStations, type Station } from '../src/solver/diagrams';
import { addArc, addBar, addNode, moveNode, placeNode, setNodalLoad, setSupport, splitMember, updateMember, updateSection } from '../src/model/ops';
import { parabola } from '../src/model/presets';
import type { Model } from '../src/model/types';
import { resolveClickNode } from '../src/ui/picking';
import { memberPolyline, type Pt } from '../src/ui/geometry';
import { expectEquilibrium, ok, PIN, reaction, refModel, ROLLER } from './helpers';

/** Parábola y = x(6 − x)/6: L = 6 m, f = 1,5 m, tan α = 1 − x/3. */
const L = 6;
const F = 1.5;
const y = (x: number) => (x * (6 - x)) / 6;
const tanA = (x: number) => 1 - x / 3;
const sinA = (x: number) => tanA(x) / Math.hypot(1, tanA(x));
const cosA = (x: number) => 1 / Math.hypot(1, tanA(x));

/** Arco de 6 m (40 segmentos por metade), seção de EA muito alto. */
function baseArc(): { m: Model; arc: string; a: string; b: string } {
  const m0 = updateSection(refModel(), 's1', { shape: { kind: 'generic', A: 100, I: 0.01 } });
  const r = addArc(m0, { expr: parabola(0, 0, L, F), xi: 0, xj: L, nSeg: 40, sectionId: 's1' });
  if ('error' in r) throw new Error(r.error);
  const arc = r.model.members[0];
  return { m: r.model, arc: r.id, a: arc.ni, b: arc.nj };
}

/** Os três caminhos de criação do nó do fecho. */
type Path = 'coordenadas' | 'clique' | 'inserir';
function crownNode(m: Model, arc: string, path: Path): { m: Model; crown: string } {
  if (path === 'inserir') {
    const s = splitMember(m, arc, 3);
    return { m: s.model, crown: s.nodeId };
  }
  if (path === 'clique') {
    const polylines = new Map<string, Pt[]>(m.members.map((k) => [k.id, memberPolyline(m, k)]));
    // clique 2 mm ao lado do fecho, com snap na grade de 0,5 m
    const r = resolveClickNode(m, { x: 3.001, y: 1.499 }, { tol: 0.05, snap: true, grid: 0.5, polylines });
    if (!r) throw new Error('clique não criou nó');
    return { m: r.model, crown: r.id };
  }
  // nó criado num ponto qualquer e levado ao fecho pelas coordenadas
  const n = addNode(m, 2, 3);
  const mv = moveNode(n.model, n.id, { x: 3, y: 1.5 });
  if ('error' in mv) throw new Error(mv.error);
  return { m: mv.model, crown: mv.id };
}

/** Interpola as estações (ordenadas em x) na abscissa x; lado 'esq' ou 'dir' no fecho. */
function at(st: Station[], x: number): Station {
  for (let i = 0; i + 1 < st.length; i++) {
    const p = st[i];
    const q = st[i + 1];
    if (x >= p.x - 1e-12 && x <= q.x + 1e-12) {
      const t = (x - p.x) / (q.x - p.x || 1);
      const lerp = (a: number, b: number) => a + (b - a) * t;
      return { ...p, x, N: lerp(p.N, q.N), Q: lerp(p.Q, q.Q), M: lerp(p.M, q.M) };
    }
  }
  throw new Error(`x = ${x} fora das estações`);
}

function halves(m: Model, res: AnalysisOk): { left: Station[]; right: Station[] } {
  const [k1, k2] = m.members;
  return { left: memberStations(m, res, k1.id), right: memberStations(m, res, k2.id) };
}

const near = (actual: number, expected: number, rel: number, abs: number) => {
  const tol = Math.max(rel * Math.abs(expected), abs);
  expect(Math.abs(actual - expected), `esperado ${expected}, obtido ${actual}`).toBeLessThanOrEqual(tol);
};
const R_TOL = 0.001;
const E_TOL = 0.01;
const ZERO_M = 0.5;

describe('A1 — nó do fecho pelos três caminhos', () => {
  for (const path of ['coordenadas', 'clique', 'inserir'] as Path[]) {
    it(`${path}: o nó fica ligado ao arco e o caso 6.1 (biapoiado, P = 100) confere`, () => {
      const base = baseArc();
      const c = crownNode(base.m, base.arc, path);
      let m = c.m;
      expect(m.members.filter((k) => k.kind === 'arc')).toHaveLength(2);
      const crown = m.nodes.find((n) => n.id === c.crown)!;
      expect(crown.x).toBeCloseTo(3, 9);
      expect(crown.y).toBeCloseTo(1.5, 9);
      m = setSupport(m, base.a, PIN);
      m = setSupport(m, base.b, ROLLER);
      m = setNodalLoad(m, c.crown, { fx: 0, fy: -100, mz: 0 });
      const r = ok(analyze(m));
      expect(r.warnings).toHaveLength(0);
      expectEquilibrium(m, r);
      near(reaction(r, base.a).fy, 50, R_TOL, 1e-6);
      near(reaction(r, base.b).fy, 50, R_TOL, 1e-6);
      near(reaction(r, base.a).fx, 0, 0, 1e-6);
      const { left, right } = halves(m, r);
      for (const x of [0, 1.5, 3]) {
        const p = x === 3 ? left[left.length - 1] : at(left, x);
        near(p.N, -50 * sinA(x), E_TOL, 0.05);
        near(p.Q, 50 * cosA(x), E_TOL, 0.05);
        near(p.M, 50 * x, E_TOL, ZERO_M);
      }
      // fecho, lado direito: Q = −50; metade direita simétrica em N e M, antissimétrica em Q
      near(right[0].Q, -50, E_TOL, 0);
      near(right[0].N, 0, 0, 0.05);
      near(right[0].M, 150, E_TOL, 0);
      const p = at(right, 4.5);
      near(p.N, -50 * sinA(1.5), E_TOL, 0.05);
      near(p.Q, -50 * cosA(1.5), E_TOL, 0.05);
      near(p.M, 75, E_TOL, 0);
    });
  }
});

describe('A1 — casos de referência 6.2 a 6.4', () => {
  function split(): { m: Model; a: string; b: string; crown: string } {
    const base = baseArc();
    const s = splitMember(base.m, base.arc, 3);
    let m = setSupport(s.model, base.a, PIN);
    m = setSupport(m, base.b, PIN);
    return { m, a: base.a, b: base.b, crown: s.nodeId };
  }

  it('6.2 triarticulado, P = 100 no fecho: H = 100, R = 50, tabela de N, Q e M', () => {
    const c = split();
    let m = updateMember(c.m, c.m.members[0].id, { hingeJ: true });
    m = setNodalLoad(m, c.crown, { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    near(reaction(r, c.a).fx, 100, R_TOL, 0);
    near(reaction(r, c.a).fy, 50, R_TOL, 0);
    near(reaction(r, c.b).fx, -100, R_TOL, 0);
    const { left } = halves(m, r);
    const ref = (x: number) => ({
      N: -(100 * cosA(x) + 50 * sinA(x)),
      Q: 50 * cosA(x) - 100 * sinA(x),
      M: 50 * x - 100 * y(x),
    });
    for (const x of [0, 1.5, 3]) {
      const p = x === 3 ? left[left.length - 1] : at(left, x);
      const e = ref(x);
      near(p.N, e.N, E_TOL, 0.05);
      near(p.Q, e.Q, E_TOL, 0.05);
      near(p.M, e.M, E_TOL, ZERO_M);
    }
    near(ref(0).N, -106.07, 1e-4, 0);
    near(ref(1.5).N, -111.8, 1e-4, 0);
    near(ref(1.5).M, -37.5, 1e-9, 0);
    // o mínimo de M da metade esquerda é −37,5 em x = 1,5
    const minM = Math.min(...left.map((p) => p.M));
    near(minM, -37.5, E_TOL, 0);
  });

  it('6.3 biarticulado, P = 100 no fecho: empuxo igual ao do método das forças por quadratura (1%)', () => {
    const c = split();
    const m = setNodalLoad(c.m, c.crown, { fx: 0, fy: -100, mz: 0 });
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    // H = ∫M₀·y ds / ∫y² ds, ds = √(1 + y′²) dx, M₀ = momento da viga biapoiada
    const M0 = (x: number) => (x <= 3 ? 50 * x : 50 * (6 - x));
    let num = 0;
    let den = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * L) / n;
      const ds = Math.hypot(1, tanA(x)) * (L / n);
      num += M0(x) * y(x) * ds;
      den += y(x) ** 2 * ds;
    }
    const H = num / den;
    expect(H).toBeGreaterThan(70);
    near(reaction(r, c.a).fx, H, E_TOL, 0);
    near(reaction(r, c.a).fy, 50, R_TOL, 0);
  });

  it('6.4 arco da imagem 1: triarticulado, q = 10 kN/m por projeção: H = 30, M ≈ 0, N = −30 e −42,43', () => {
    const c = split();
    let m = c.m;
    const q = { dir: 'globalY' as const, ref: 'projection' as const, qi: -10, qj: -10 };
    m = updateMember(m, m.members[0].id, { hingeJ: true, loads: [q] });
    m = updateMember(m, m.members[1].id, { loads: [q] });
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    near(reaction(r, c.a).fx, 30, R_TOL, 0);
    near(reaction(r, c.a).fy, 30, R_TOL, 0);
    near(reaction(r, c.b).fy, 30, R_TOL, 0);
    const { left, right } = halves(m, r);
    for (const p of [...left, ...right]) near(p.M, 0, 0, ZERO_M);
    near(left[left.length - 1].N, -30, E_TOL, 0);
    near(left[0].N, -42.43, E_TOL, 0);
    near(right[right.length - 1].N, -42.43, E_TOL, 0);
  });
});

describe('A1 — ligação automática e erros claros', () => {
  it('nó levado sobre uma barra divide a barra; a carga deixa de ser ignorada', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 6, 0);
    m = addBar(b.model, a.id, b.id).model;
    const n = addNode(m, 3, 2);
    const mv = moveNode(n.model, n.id, { y: 0 });
    if ('error' in mv) throw new Error(mv.error);
    m = mv.model;
    expect(m.members).toHaveLength(2);
    expect(m.members.every((k) => k.ni === mv.id || k.nj === mv.id)).toBe(true);
    m = setSupport(setSupport(m, a.id, PIN), b.id, ROLLER);
    m = setNodalLoad(m, mv.id, { fx: 0, fy: -10, mz: 0 });
    const r = ok(analyze(m));
    near(reaction(r, a.id).fy, 5, 1e-9, 0);
  });

  it('nó levado sobre outro nó se funde com ele (barras, apoio e cargas somadas)', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 4, 0);
    const c = addNode(b.model, 4, 3);
    m = addBar(c.model, a.id, b.id).model;
    m = addBar(m, b.id, c.id).model;
    m = setNodalLoad(m, b.id, { fx: 1, fy: 0, mz: 0 });
    const d = addNode(m, 8, 0);
    m = setNodalLoad(d.model, d.id, { fx: 2, fy: -3, mz: 0 });
    m = setSupport(m, d.id, ROLLER);
    const mv = moveNode(m, d.id, { x: 4, y: 0 });
    if ('error' in mv) throw new Error(mv.error);
    expect(mv.id).toBe(b.id);
    const merged = mv.model.nodes.find((n) => n.id === b.id)!;
    expect(mv.model.nodes.some((n) => n.id === d.id)).toBe(false);
    expect(merged.load).toEqual({ fx: 3, fy: -3, mz: 0 });
    expect(merged.support).toEqual(ROLLER);
  });

  it('mover a extremidade de uma barra sobre outro nó funde e remove barra degenerada', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 4, 0);
    m = addBar(b.model, a.id, b.id).model;
    const mv = moveNode(m, b.id, { x: 0 });
    if ('error' in mv) throw new Error(mv.error);
    expect(mv.model.nodes).toHaveLength(1);
    expect(mv.model.members).toHaveLength(0);
  });

  it('barra movida passa sobre um nó existente e é dividida nele', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 4, 1);
    const c = addNode(b.model, 2, 0);
    m = addBar(c.model, a.id, b.id).model;
    const mv = moveNode(m, b.id, { y: 0 });
    if ('error' in mv) throw new Error(mv.error);
    expect(mv.model.members).toHaveLength(2);
    expect(mv.model.members.some((k) => k.ni === c.id || k.nj === c.id)).toBe(true);
  });

  it('placeNode: sobre nó existente devolve o nó; sobre arco divide; fora cria nó solto', () => {
    const base = baseArc();
    const p1 = placeNode(base.m, 0, 0);
    expect(p1.id).toBe(base.a);
    expect(p1.model).toBe(base.m);
    const p2 = placeNode(base.m, 1.5, y(1.5));
    expect(p2.model.members).toHaveLength(2);
    const p3 = placeNode(base.m, 1.5, 4);
    expect(p3.model.members).toHaveLength(1);
    expect(p3.model.nodes).toHaveLength(3);
  });

  it('coordenada digitada com arredondamento ao milímetro ainda liga o nó ao arco', () => {
    const m0 = refModel();
    const r = addArc(m0, { expr: 'sqrt(25-x^2)', xi: -5, xj: 5, nSeg: 40, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const p = placeNode(r.model, 1, 4.899);
    expect(p.model.members).toHaveLength(2);
    const n = p.model.nodes.find((k) => k.id === p.id)!;
    expect(Math.abs(n.y - Math.sqrt(24))).toBeLessThan(1e-12);
  });

  it('carga em nó sem barra é erro que impede a análise', () => {
    const base = baseArc();
    let m = setSupport(setSupport(base.m, base.a, PIN), base.b, ROLLER);
    const n = addNode(m, 3, 5);
    m = setNodalLoad(n.model, n.id, { fx: 0, fy: -100, mz: 0 });
    const res = analyze(m);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0].message).toMatch(/n3.*não está ligado/);
  });

  it('apoio em nó sem barra é erro', () => {
    const base = baseArc();
    let m = setSupport(setSupport(base.m, base.a, PIN), base.b, ROLLER);
    const n = addNode(m, 3, 5);
    m = setSupport(n.model, n.id, PIN);
    expect(analyze(m).ok).toBe(false);
  });

  it('nó com carga sobre o arco sem estar ligado (arquivo antigo) é erro, não resultado nulo', () => {
    const base = baseArc();
    let m = setSupport(setSupport(base.m, base.a, PIN), base.b, ROLLER);
    m = { ...m, nodes: [...m.nodes, { id: 'n9', x: 3, y: 1.5, load: { fx: 0, fy: -100, mz: 0 } }] };
    const res = analyze(m);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => /n9/.test(i.message) && /arco m1/.test(i.message))).toBe(true);
  });

  it('nó solto sem carga nem apoio continua só como aviso', () => {
    const base = baseArc();
    let m = setSupport(setSupport(base.m, base.a, PIN), base.b, ROLLER);
    m = addNode(m, 3, 5).model;
    const r = ok(analyze(m));
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
