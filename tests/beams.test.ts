import { describe, it, expect } from 'vitest';
import { analyze } from '../src/solver/analyze';
import {
  beam,
  ok,
  reaction,
  expectClose,
  expectEquilibrium,
  setSupport,
  setNodalLoad,
  updateMember,
  withLoad,
  uniformY,
  FIX,
  PIN,
  ROLLER,
  EI_REF,
} from './helpers';

describe('vigas — reações e deslocamentos', () => {
  it('biapoiada L=6, q=10: reações 30 e 30', () => {
    const b = beam([0, 6]);
    let m = setSupport(b.m, b.nodes[0], PIN);
    m = setSupport(m, b.nodes[1], ROLLER);
    m = withLoad(m, b.bars[0], uniformY(-10));
    const r = ok(analyze(m));
    expectClose(reaction(r, b.nodes[0]).fy, 30);
    expectClose(reaction(r, b.nodes[1]).fy, 30);
    expectClose(reaction(r, b.nodes[0]).fx, 0);
    expectEquilibrium(m, r);
  });

  it('engastada L=3, P=20 na ponta: reação 20, momento 60, flecha 3,456 mm', () => {
    const b = beam([0, 3]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setNodalLoad(m, b.nodes[1], { fx: 0, fy: -20, mz: 0 });
    const r = ok(analyze(m));
    expectClose(reaction(r, b.nodes[0]).fy, 20);
    expectClose(reaction(r, b.nodes[0]).mz, 60);
    const tip = r.mesh.nodeIndex.get(b.nodes[1])!;
    expectClose(r.u[3 * tip + 1], -(20 * 27) / (3 * EI_REF));
    expectClose(r.u[3 * tip + 1], -0.003456, 1e-6);
    expectEquilibrium(m, r);
  });

  it('biengastada L=6, q=10: momentos de engaste 30 e reações 30', () => {
    const b = beam([0, 6]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[1], FIX);
    m = withLoad(m, b.bars[0], uniformY(-10));
    const r = ok(analyze(m));
    expectClose(reaction(r, b.nodes[0]).fy, 30);
    expectClose(reaction(r, b.nodes[0]).mz, 30);
    expectClose(reaction(r, b.nodes[1]).mz, -30);
    expectEquilibrium(m, r);
  });

  it('biapoiada com carga triangular 0→12: reações 12 e 24', () => {
    const b = beam([0, 6]);
    let m = setSupport(b.m, b.nodes[0], PIN);
    m = setSupport(m, b.nodes[1], ROLLER);
    m = withLoad(m, b.bars[0], { dir: 'globalY', ref: 'length', qi: 0, qj: -12 });
    const r = ok(analyze(m));
    expectClose(reaction(r, b.nodes[0]).fy, 12);
    expectClose(reaction(r, b.nodes[1]).fy, 24);
    expectEquilibrium(m, r);
  });

  it('Gerber: engaste, rótula em x=4, apoio móvel em x=8, q=10', () => {
    const b = beam([0, 4, 8]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[2], ROLLER);
    m = updateMember(m, b.bars[0], { hingeJ: true });
    m = withLoad(m, b.bars[0], uniformY(-10));
    m = withLoad(m, b.bars[1], uniformY(-10));
    const r = ok(analyze(m));
    expectClose(reaction(r, b.nodes[2]).fy, 20);
    expectClose(reaction(r, b.nodes[0]).fy, 60);
    expectClose(reaction(r, b.nodes[0]).mz, 160);
    expectEquilibrium(m, r);
  });

  it('recalque: biengastada L=4, apoio final desce 10 mm → V = 97,656 kN e M = 195,31 kN·m', () => {
    const b = beam([0, 4]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[1], { ...FIX, dy: -0.01 });
    const r = ok(analyze(m));
    const V = (12 * EI_REF * 0.01) / 64;
    const M = (6 * EI_REF * 0.01) / 16;
    expectClose(V, 97.65625, 1e-6);
    expectClose(Math.abs(reaction(r, b.nodes[0]).fy), V);
    expectClose(Math.abs(reaction(r, b.nodes[1]).fy), V);
    expectClose(Math.abs(reaction(r, b.nodes[0]).mz), M);
    expectClose(Math.abs(reaction(r, b.nodes[1]).mz), M);
    const tip = r.mesh.nodeIndex.get(b.nodes[1])!;
    expectClose(r.u[3 * tip + 1], -0.01);
    expectEquilibrium(m, r);
  });

  it('mola: engastada L=3 com mola vertical k=3EI/L³ na ponta e P=20 → flecha 1,728 mm, força na mola 10 kN', () => {
    const b = beam([0, 3]);
    const k = (3 * EI_REF) / 27;
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[1], { rx: false, ry: false, rz: false, ky: k });
    m = setNodalLoad(m, b.nodes[1], { fx: 0, fy: -20, mz: 0 });
    const r = ok(analyze(m));
    const tip = r.mesh.nodeIndex.get(b.nodes[1])!;
    expectClose(r.u[3 * tip + 1], -0.001728, 1e-6);
    expectClose(reaction(r, b.nodes[1]).fy, 10);
    expectClose(reaction(r, b.nodes[0]).fy, 10);
    expectEquilibrium(m, r);
  });
});

describe('estruturas instáveis', () => {
  it('viga só com um apoio móvel não é analisada e a mensagem diz "instável"', () => {
    const b = beam([0, 6]);
    const m = setSupport(b.m, b.nodes[0], ROLLER);
    const r = analyze(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => /instável/i.test(i.message))).toBe(true);
  });

  it('biengastada com três rótulas alinhadas é um mecanismo', () => {
    const b = beam([0, 2, 4, 6, 8]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[4], FIX);
    m = updateMember(m, b.bars[0], { hingeJ: true });
    m = updateMember(m, b.bars[1], { hingeJ: true });
    m = updateMember(m, b.bars[2], { hingeJ: true });
    m = withLoad(m, b.bars[1], uniformY(-10));
    const r = analyze(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => /instável/i.test(i.message))).toBe(true);
  });

  it('biengastada com duas rótulas continua estável', () => {
    const b = beam([0, 3, 6, 9]);
    let m = setSupport(b.m, b.nodes[0], FIX);
    m = setSupport(m, b.nodes[3], FIX);
    m = updateMember(m, b.bars[0], { hingeJ: true });
    m = updateMember(m, b.bars[1], { hingeJ: true });
    m = withLoad(m, b.bars[1], uniformY(-10));
    const r = ok(analyze(m));
    expectEquilibrium(m, r);
  });

  it('modelo com erro de validação devolve os erros', () => {
    const b = beam([0, 6]);
    const r = analyze(b.m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => /apoio/i.test(i.message))).toBe(true);
  });
});
