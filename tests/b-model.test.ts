import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import { memberStations } from '../src/solver/diagrams';
import { addArc, addBar, addNode, addSection, emptyModel, setNodalLoad, setSupport, splitMember, updateMember, updateSection } from '../src/model/ops';
import { parseModel, serialize } from '../src/model/io';
import { validateModel } from '../src/model/validate';
import { examples } from '../src/model/examples';
import { parabola } from '../src/model/presets';
import type { Model, Section } from '../src/model/types';
import { beam, expectClose, expectEquilibrium, FIX, ok, PIN, reaction, refModel, ROLLER, uniformY, withLoad } from './helpers';

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('B1 — tipo de barra', () => {
  it('barra somente axial dá o mesmo resultado que barra de pórtico com as duas rótulas (arco atirantado)', () => {
    const base = examples.find((e) => e.slug === 'arco-atirantado')!.build();
    const tie = base.members.find((k) => k.kind === 'bar')!;
    expect(tie.hingeI && tie.hingeJ).toBe(true);
    const axial = updateMember(base, tie.id, { behavior: 'axial', hingeI: false, hingeJ: false });
    const r1 = ok(analyze(base));
    const r2 = ok(analyze(axial));
    expectEquilibrium(axial, r2);
    for (const r of r1.reactions) {
      const q = reaction(r2, r.nodeId);
      expectClose(q.fx, r.fx, 1e-8);
      expectClose(q.fy, r.fy, 1e-8);
    }
    const n1 = memberStations(base, r1, tie.id);
    const n2 = memberStations(axial, r2, tie.id);
    expectClose(n2[0].N, n1[0].N, 1e-8);
    for (const p of n2) {
      expect(Math.abs(p.Q)).toBeLessThan(1e-9);
      expect(Math.abs(p.M)).toBeLessThan(1e-9);
    }
    const arc = base.members.find((k) => k.kind === 'arc')!.id;
    const m1 = memberStations(base, r1, arc);
    const m2 = memberStations(axial, r2, arc);
    m1.forEach((p, i) => expectClose(m2[i].M, p.M, 1e-7));
  });

  it('pórtico biengastado inextensível, P lateral no nível da viga: M na base = (P·h/2)(3k+1)/(6k+1)', () => {
    // dedução independente pelo método dos deslocamentos (giros iguais nos nós da viga e deslocabilidade Δ):
    // nó B: 2·ic·(2θ − 3ψ) + 6·ib·θ = 0; cortantes: 2·2·ic·(3θ − 6ψ)/h = −P  ⇒  M_base = −(P·h/2)(1+3k)/(1+6k)
    const P = 10;
    const h = 4;
    const L = 6;
    const Ic = 0.002;
    const Ib = 0.0045;
    const k = Ib / L / (Ic / h); // 1,5
    let m = updateSection(refModel(), 's1', { name: 'Pilar', shape: { kind: 'generic', A: 0.08, I: Ic } });
    const vs = addSection(m, { name: 'Viga', E: 25e6, shape: { kind: 'generic', A: 0.1, I: Ib } });
    m = vs.model;
    const ids: string[] = [];
    for (const [x, y] of [
      [0, 0],
      [0, h],
      [L, h],
      [L, 0],
    ]) {
      const r = addNode(m, x, y);
      m = r.model;
      ids.push(r.id);
    }
    const c1 = addBar(m, ids[0], ids[1]);
    const b = addBar(c1.model, ids[1], ids[2], vs.id);
    const c2 = addBar(b.model, ids[3], ids[2]);
    m = c2.model;
    for (const id of [c1.id, b.id, c2.id]) m = updateMember(m, id, { behavior: 'bending' });
    m = setSupport(setSupport(m, ids[0], FIX), ids[3], FIX);
    m = setNodalLoad(m, ids[1], { fx: P, fy: 0, mz: 0 });
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    const expected = ((P * h) / 2) * ((3 * k + 1) / (6 * k + 1));
    expect(relErr(Math.abs(reaction(r, ids[0]).mz), expected)).toBeLessThan(1e-5);
    expect(relErr(Math.abs(reaction(r, ids[3]).mz), expected)).toBeLessThan(1e-5);
    // inextensível: os topos dos pilares não descem e a viga não muda de comprimento
    const u = (id: string, q: number) => r.u[3 * r.mesh.nodeIndex.get(id)! + q];
    expect(Math.abs(u(ids[1], 1))).toBeLessThan(1e-9);
    expect(Math.abs(u(ids[2], 0) - u(ids[1], 0))).toBeLessThan(1e-9);
    // N nos pilares sai do equilíbrio (finito e coerente): N_esq = −N_dir
    const n1 = memberStations(m, r, c1.id)[0].N;
    const n2 = memberStations(m, r, c2.id)[0].N;
    expect(Number.isFinite(n1)).toBe(true);
    expectClose(n1, -n2, 1e-6);
  });

  it('somente flexão com EA de penalidade fica a 0,1% de uma barra de pórtico com EA enorme', () => {
    const { m: m0, nodes, bars } = beam([0, 3, 6]);
    let m = withLoad(withLoad(m0, bars[0], uniformY(-10)), bars[1], uniformY(-10));
    m = setSupport(setSupport(m, nodes[0], FIX), nodes[2], PIN);
    const big = updateSection(m, 's1', { shape: { kind: 'generic', A: 1e4, I: (0.2 * 0.5 ** 3) / 12 } });
    const pen = bars.reduce((acc, id) => updateMember(acc, id, { behavior: 'bending' }), m);
    const r1 = ok(analyze(big));
    const r2 = ok(analyze(pen));
    expect(relErr(reaction(r2, nodes[0]).mz, reaction(r1, nodes[0]).mz)).toBeLessThan(1e-3);
  });

  it('carga transversal distribuída em barra somente axial é erro com orientação', () => {
    const { m: m0, nodes, bars } = beam([0, 6]);
    let m = withLoad(m0, bars[0], uniformY(-10));
    m = setSupport(setSupport(m, nodes[0], PIN), nodes[1], ROLLER);
    m = updateMember(m, bars[0], { behavior: 'axial' });
    const e = validateModel(m).filter((i) => i.severity === 'error');
    expect(e.some((i) => /somente axial/.test(i.message) && /nós/.test(i.message) && /tipo/.test(i.message))).toBe(true);
  });

  it('carga axial distribuída em barra somente axial é aceita (N varia linearmente)', () => {
    const { m: m0, nodes, bars } = beam([0, 4]);
    let m = withLoad(m0, bars[0], { dir: 'globalX', ref: 'length', qi: 5, qj: 5 });
    m = setSupport(setSupport(m, nodes[0], PIN), nodes[1], ROLLER);
    m = updateMember(m, bars[0], { behavior: 'axial' });
    const r = ok(analyze(m));
    const st = memberStations(m, r, bars[0]);
    expectClose(st[0].N, 20, 1e-9);
    expectClose(st[st.length - 1].N, 0, 1e-9);
  });

  it('arco somente axial é erro; arco somente flexão é aceito', () => {
    const r = addArc(refModel(), { expr: parabola(0, 0, 6, 1.5), xi: 0, xj: 6, nSeg: 40, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    let m = setSupport(setSupport(r.model, r.model.members[0].ni, PIN), r.model.members[0].nj, PIN);
    expect(validateModel(updateMember(m, r.id, { behavior: 'axial' })).some((i) => i.severity === 'error' && /arco/i.test(i.message))).toBe(true);
    m = updateMember(m, r.id, { behavior: 'bending', loads: [{ dir: 'globalY', ref: 'projection', qi: -10, qj: -10 }] });
    const res = ok(analyze(m));
    // inextensível: H = qL²/8f sem o encurtamento elástico (resta só o erro da poligonal de 40 trechos)
    expect(relErr(reaction(res, m.members[0].ni).fx, (10 * 36) / (8 * 1.5))).toBeLessThan(0.005);
  });

  it('pórtico da imagem 2 (duas águas com tirantes e recalque) analisa e fecha o equilíbrio', () => {
    const ex = examples.find((e) => e.slug === 'portico-duas-aguas-tirantes')!;
    const m = ex.build();
    expect(m.members.filter((k) => k.behavior === 'axial')).toHaveLength(2);
    expect(m.members.filter((k) => k.behavior === 'bending')).toHaveLength(2);
    const r = ok(analyze(m));
    expect(r.warnings).toHaveLength(0);
    expectEquilibrium(m, r);
    for (const k of m.members.filter((q) => q.behavior === 'axial')) {
      for (const p of memberStations(m, r, k.id)) expect(Math.abs(p.M)).toBeLessThan(1e-9);
    }
  });
});

describe('B2 — rigidez informada diretamente', () => {
  it('viga biapoiada com EI digitado: flecha 5qL⁴/(384EI)', () => {
    const EI = 30000;
    const q = 12;
    const L = 5;
    let m = updateSection(emptyModel(), 's1', { shape: { kind: 'direct', EA: 1e6, EI } });
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, L, 0);
    const bar = addBar(b.model, a.id, b.id);
    m = withLoad(bar.model, bar.id, uniformY(-q));
    m = setSupport(setSupport(m, a.id, PIN), b.id, ROLLER);
    const r = ok(analyze(m));
    const st = memberStations(m, r, bar.id, 20);
    const mid = st[10];
    expect(mid.s).toBeCloseTo(L / 2, 12);
    expectClose(-mid.dy, (5 * q * L ** 4) / (384 * EI), 1e-9);
  });

  it('somente axial exige só EA; somente flexão, só EI', () => {
    const { m: m0, nodes, bars } = beam([0, 6]);
    let m = setSupport(setSupport(m0, nodes[0], PIN), nodes[1], ROLLER);
    m = setNodalLoad(m, nodes[1], { fx: 5, fy: 0, mz: 0 });
    const onlyEA = updateMember(updateSection(m, 's1', { shape: { kind: 'direct', EA: 1000, EI: 0 } }), bars[0], { behavior: 'axial' });
    expect(validateModel(onlyEA).filter((i) => i.severity === 'error')).toHaveLength(0);
    const frameNoEI = updateSection(m, 's1', { shape: { kind: 'direct', EA: 1000, EI: 0 } });
    expect(validateModel(frameNoEI).some((i) => i.severity === 'error' && /EI/.test(i.message))).toBe(true);
    const onlyEI = updateMember(updateSection(m, 's1', { shape: { kind: 'direct', EA: 0, EI: 500 } }), bars[0], { behavior: 'bending' });
    expect(validateModel(onlyEI).filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('arquivo salvo e reaberto mantém EA, EI, α, h, tipo de barra e temperaturas', () => {
    let m = updateSection(emptyModel(), 's1', { alpha: 1.2e-5, shape: { kind: 'direct', EA: 12345, EI: 678.9, h: 0.35 } });
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 4, 0);
    const bar = addBar(b.model, a.id, b.id);
    m = updateMember(bar.model, bar.id, { behavior: 'bending', thermal: { tExt: -5, tInt: 15 } });
    const back = parseModel(serialize(m));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.model).toEqual(m);
  });
});

describe('B3 — análise térmica', () => {
  const alpha = 1e-5;
  const h = 0.5;
  const sec = (m: Model): Section => m.sections[0];

  it('biapoiada com gradiente: esforços nulos e flecha no meio de módulo κL²/8 (desce com a face interna mais quente)', () => {
    const L = 6;
    for (const split of [false, true]) {
      const { m: m0, nodes, bars } = beam(split ? [0, 3, 6] : [0, 6]);
      let m = setSupport(setSupport(m0, nodes[0], PIN), nodes[nodes.length - 1], ROLLER);
      for (const id of bars) m = updateMember(m, id, { thermal: { tExt: 0, tInt: 20 } });
      expect(sec(m).alpha).toBe(alpha);
      const r = ok(analyze(m));
      const kappa = (alpha * 20) / h;
      for (const rr of r.reactions) {
        expect(Math.abs(rr.fx) + Math.abs(rr.fy) + Math.abs(rr.mz)).toBeLessThan(1e-9);
      }
      const st = bars.flatMap((id) => memberStations(m, r, id, 20));
      for (const p of st) expect(Math.abs(p.M) + Math.abs(p.Q) + Math.abs(p.N)).toBeLessThan(1e-9);
      const mid = st.find((p) => Math.abs(p.x - 3) < 1e-12)!;
      expectClose(mid.dy, (-kappa * L * L) / 8, 1e-9);
      // alongamento da parte uniforme: ΔT = 10 °C
      const end = st[st.length - 1];
      expectClose(end.dx, alpha * 10 * L, 1e-9);
    }
  });

  it('biengastada com aquecimento uniforme: N = −EAαΔT e deslocamento nulo', () => {
    const { m: m0, nodes, bars } = beam([0, 3, 6]);
    let m = setSupport(setSupport(m0, nodes[0], FIX), nodes[2], FIX);
    for (const id of bars) m = updateMember(m, id, { thermal: { tExt: 30, tInt: 30 } });
    const r = ok(analyze(m));
    const EA = 25e6 * 0.2 * 0.5;
    for (const id of bars) {
      for (const p of memberStations(m, r, id, 10)) {
        expectClose(p.N, -EA * alpha * 30, 1e-9);
        expect(Math.hypot(p.dx, p.dy)).toBeLessThan(1e-12);
      }
    }
  });

  it('biengastada com gradiente: M constante de módulo EIκ e flecha nula', () => {
    const { m: m0, nodes, bars } = beam([0, 6]);
    let m = setSupport(setSupport(m0, nodes[0], FIX), nodes[1], FIX);
    m = updateMember(m, bars[0], { thermal: { tExt: -10, tInt: 10 } });
    const r = ok(analyze(m));
    const EI = (25e6 * 0.2 * 0.5 ** 3) / 12;
    const kappa = (alpha * 20) / h;
    for (const p of memberStations(m, r, bars[0], 10)) {
      // face interna (−y, embaixo) mais quente e impedida de alongar: comprimida ⇒ M < 0
      expectClose(p.M, -EI * kappa, 1e-9);
      expect(Math.abs(p.dy)).toBeLessThan(1e-12);
    }
  });

  it('arco biarticulado com aquecimento uniforme: empuxo pela quadratura do método das forças (1%)', () => {
    const L = 6;
    const f = 1.5;
    const dT = 30;
    const r0 = addArc(refModel(), { expr: parabola(0, 0, L, f), xi: 0, xj: L, nSeg: 40, sectionId: 's1' });
    if ('error' in r0) throw new Error(r0.error);
    let m = r0.model;
    const s = splitMember(m, r0.id, 3);
    m = s.model;
    for (const k of m.members) m = updateMember(m, k.id, { thermal: { tExt: dT, tInt: dT } });
    m = setSupport(setSupport(m, m.members[0].ni, PIN), m.members[1].nj, PIN);
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
    const EI = (25e6 * 0.2 * 0.5 ** 3) / 12;
    const EA = 25e6 * 0.2 * 0.5;
    // H = αΔT·L / (∫y²/EI ds + ∫cos²φ/EA ds)
    const y = (x: number) => (4 * f * x * (L - x)) / L ** 2;
    const dy = (x: number) => (4 * f * (L - 2 * x)) / L ** 2;
    let d11 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * L) / n;
      const ds = Math.hypot(1, dy(x)) * (L / n);
      const cos = 1 / Math.hypot(1, dy(x));
      d11 += (y(x) ** 2 / EI + cos ** 2 / EA) * ds;
    }
    const H = (alpha * dT * L) / d11;
    expect(relErr(reaction(r, m.members[0].ni).fx, H)).toBeLessThan(0.01);
    expect(reaction(r, m.members[0].ni).fx).toBeGreaterThan(0);
  });

  it('gradiente em seção genérica sem altura h é erro', () => {
    const { m: m0, nodes, bars } = beam([0, 6], updateSection(emptyModel(), 's1', { shape: { kind: 'generic', A: 0.1, I: 0.002 } }));
    let m = setSupport(setSupport(m0, nodes[0], PIN), nodes[1], ROLLER);
    m = updateMember(m, bars[0], { thermal: { tExt: 0, tInt: 10 } });
    expect(validateModel(m).some((i) => i.severity === 'error' && /altura/.test(i.message))).toBe(true);
    m = updateSection(m, 's1', { shape: { kind: 'generic', A: 0.1, I: 0.002, h: 0.4 } });
    expect(ok(analyze(m)).ok).toBe(true);
  });
});

describe('formato do arquivo — versão 2', () => {
  it('arquivo da versão 1 abre migrado: tipo Pórtico, α = 1,0×10⁻⁵ e versão atual', () => {
    const v1 = {
      version: 1,
      nodes: [
        { id: 'n1', x: 0, y: 0, support: { rx: true, ry: true, rz: false } },
        { id: 'n2', x: 5, y: 0, support: { rx: false, ry: true, rz: false } },
      ],
      members: [{ kind: 'bar', id: 'm1', ni: 'n1', nj: 'n2', sectionId: 's1', hingeI: false, hingeJ: false, loads: [{ dir: 'globalY', ref: 'length', qi: -10, qj: -10 }] }],
      sections: [{ id: 's1', name: 'Seção 1', E: 25e6, shape: { kind: 'rect', b: 0.2, h: 0.4 } }],
    };
    const r = parseModel(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model.version).toBe(3);
    expect(r.model.members[0].behavior).toBe('frame');
    expect(r.model.members[0].thermal).toBeUndefined();
    expect(r.model.sections[0].alpha).toBe(1e-5);
    expect(ok(analyze(r.model)).reactions).toHaveLength(2);
  });

  it('identificadores repetidos de barras ou seções são rejeitados', () => {
    const m = beam([0, 3, 6]).m;
    const dupM = { ...m, members: m.members.map((k) => ({ ...k, id: 'm1' })) };
    expect(parseModel(JSON.stringify(dupM)).ok).toBe(false);
    const dupS = { ...m, sections: [m.sections[0], { ...m.sections[0] }] };
    expect(parseModel(JSON.stringify(dupS)).ok).toBe(false);
  });

  it('tipo de barra desconhecido é rejeitado', () => {
    const m = beam([0, 3]).m;
    const bad = { ...m, members: m.members.map((k) => ({ ...k, behavior: 'cabo' })) };
    expect(parseModel(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('pendências herdadas — validação', () => {
  it('mola negativa não conta como apoio', () => {
    const { m: m0, nodes } = beam([0, 6]);
    const m = setSupport(m0, nodes[0], { rx: false, ry: false, rz: false, ky: -100 });
    expect(validateModel(m).some((i) => i.severity === 'error' && /apoios/.test(i.message))).toBe(true);
  });

  it('recalque em direção livre gera aviso', () => {
    const { m: m0, nodes } = beam([0, 6]);
    let m = setSupport(m0, nodes[0], PIN);
    m = setSupport(m, nodes[1], { rx: false, ry: true, rz: false, dx: 0.01 });
    expect(validateModel(m).some((i) => i.severity === 'warning' && /recalque/i.test(i.message))).toBe(true);
  });
});

