import { describe, it, expect } from 'vitest';
import { compileExpr } from '../src/expr/parser';
import { compileArcCurve } from '../src/model/curve';
import { circular } from '../src/model/presets';
import { Skyline } from '../src/solver/skyline';
import { analyze } from '../src/solver/analyze';
import { addArc, addBar, addNode, addSection, emptyModel, setSupport, splitMember, updateMember, updateSection } from '../src/model/ops';
import { validateModel } from '../src/model/validate';
import { snapAlongMember } from '../src/ui/geometry';
import { hotkeyTarget } from '../src/ui/hotkeys';
import { ok, expectEquilibrium, refModel, PIN, ROLLER, FIX } from './helpers';

describe('revisão 1 — semicírculos com raio não inteiro', () => {
  it('sqrt de valor levemente negativo por arredondamento vale 0; negativo de verdade continua inválido', () => {
    const c = compileExpr('sqrt(x)');
    if (!c.ok) throw new Error(c.error);
    expect(c.fn(-1e-16)).toBe(0);
    expect(Number.isNaN(c.fn(-1))).toBe(true);
  });
  it('sqrt(R²-x²) de −R a R é aceito para todos os raios de 0,1 a 30 m (passo 0,1)', () => {
    const failed: number[] = [];
    for (let k = 1; k <= 300; k++) {
      const R = k / 10;
      const typed = String(Number((R * R).toFixed(4))).replace('.', ','); // como uma pessoa digita: 1,21
      const r = compileArcCurve(`sqrt(${typed}-x^2)`, -R, R);
      if (!r.ok) failed.push(R);
    }
    expect(failed).toEqual([]);
  });
  it('arco circular pronto com flecha = meio vão é aceito para vãos de 0,1 a 40 m e origens quebradas', () => {
    const failed: string[] = [];
    for (let k = 1; k <= 400; k++) {
      const L = k / 10;
      for (const x0 of [0, 0.3, -1.7, 12.35]) {
        const r = compileArcCurve(circular(x0, 0, L, L / 2), x0, x0 + L);
        if (!r.ok) failed.push(`L=${L} x0=${x0}`);
      }
    }
    expect(failed).toEqual([]);
  });
});

describe('revisão 2 — pivô relativo à própria diagonal', () => {
  it('matriz diagonal com rigidezes muito diferentes é fatorada', () => {
    const K = new Skyline(2, Int32Array.from([0, 1]));
    K.add(0, 0, 1e12);
    K.add(1, 1, 1);
    expect(K.factor()).toEqual({ ok: true });
  });
  it('arco atirantado com tirante fino dividido ao meio e 200 segmentos não é dado como instável', () => {
    let m = updateSection(emptyModel(), 's1', { shape: { kind: 'rect', b: 0.3, h: 0.6 } });
    const tie = addSection(m, { name: 'Tirante', E: 200e6, shape: { kind: 'circ', d: 0.03 } });
    m = tie.model;
    const r = addArc(m, { expr: '4*4*x*(20-x)/400', xi: 0, xj: 20, nSeg: 200, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    m = updateMember(r.model, r.id, { loads: [{ dir: 'globalY', ref: 'projection', qi: -10, qj: -10 }] });
    const arc = m.members[0];
    const t = addBar(m, arc.ni, arc.nj, tie.id);
    const s = splitMember(t.model, t.id, 0.5);
    m = setSupport(s.model, arc.ni, PIN);
    m = setSupport(m, arc.nj, ROLLER);
    const res = ok(analyze(m));
    expectEquilibrium(m, res);
  });
  it('semicírculo com A = 1e4 m² e 200 segmentos é analisado', () => {
    let m = updateSection(refModel(), 's1', { shape: { kind: 'generic', A: 1e4, I: 0.01 } });
    const r = addArc(m, { expr: 'sqrt(25-x^2)', xi: -5, xj: 5, nSeg: 200, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    m = updateMember(r.model, r.id, { loads: [{ dir: 'globalY', ref: 'projection', qi: -10, qj: -10 }] });
    m = setSupport(m, m.members[0].ni, PIN);
    m = setSupport(m, m.members[0].nj, PIN);
    expectEquilibrium(m, ok(analyze(m)));
  });
});

describe('revisão 3 — nó sobre barra sem ligação', () => {
  it('addBar que passa sobre nós existentes é dividida neles', () => {
    let m = emptyModel();
    const a = addNode(m, 0, 0);
    const mid = addNode(a.model, 3, 0);
    const b = addNode(mid.model, 6, 0);
    m = addBar(b.model, a.id, b.id).model;
    expect(m.members).toHaveLength(2);
    expect(m.members.map((k) => [k.ni, k.nj])).toEqual([
      [a.id, mid.id],
      [mid.id, b.id],
    ]);
  });
  it('nó sobre o interior de uma barra sem estar ligado: erro se ligado a outra barra; aviso se solto e sem carga', () => {
    let m = refModel();
    const a = addNode(m, 0, 0);
    const b = addNode(a.model, 6, 0);
    m = addBar(b.model, a.id, b.id).model;
    const c = addNode(m, 3, -3);
    const d = addNode(c.model, 3, 0);
    m = addBar(d.model, c.id, d.id).model;
    m = setSupport(setSupport(setSupport(m, a.id, PIN), b.id, ROLLER), c.id, FIX);
    // etapa 2: a barra c–d termina sobre a–b sem ligação; o resultado sairia errado, então é erro
    const e = validateModel(m).filter((i) => i.severity === 'error');
    expect(e.some((i) => i.target?.kind === 'node' && i.target.id === d.id && /não está ligado/.test(i.message))).toBe(true);

    const arc = addArc(emptyModel(), { expr: 'x*(20-x)/20', xi: 0, xj: 20, nSeg: 20, sectionId: 's1' });
    if ('error' in arc) throw new Error(arc.error);
    const on = addNode(arc.model, 10, 5);
    expect(validateModel(on.model).some((i) => i.severity === 'warning' && i.target?.id === on.id && /não está ligado/.test(i.message))).toBe(true);
  });
});

describe('revisão 4 — snap ao inserir nó sobre barra ou arco', () => {
  it('arco: x vai para a grade', () => {
    const r = addArc(emptyModel(), { expr: 'x*(20-x)/20', xi: 0, xj: 20, nSeg: 20, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    expect(snapAlongMember(r.model, r.model.members[0], 7.560027533, 0.5)).toBe(7.5);
  });
  it('barra inclinada: coordenada dominante vai para a grade', () => {
    const a = addNode(emptyModel(), 0, 0);
    const b = addNode(a.model, 4, 3);
    const bar = addBar(b.model, a.id, b.id);
    expect(snapAlongMember(bar.model, bar.model.members[0], 0.37, 0.5)).toBeCloseTo(0.375, 12);
    const c = addNode(emptyModel(), 0, 0);
    const d = addNode(c.model, 0, 4);
    const col = addBar(d.model, c.id, d.id);
    expect(snapAlongMember(col.model, col.model.members[0], 0.61, 0.5)).toBeCloseTo(0.625, 12);
  });
  it('se a grade cair numa extremidade, mantém a posição clicada', () => {
    const a = addNode(emptyModel(), 0, 0);
    const b = addNode(a.model, 1, 0);
    const bar = addBar(b.model, a.id, b.id);
    expect(snapAlongMember(bar.model, bar.model.members[0], 0.1, 1)).toBe(0.1);
  });
});

describe('revisão 5 — atalhos de teclado', () => {
  it('só campos de texto bloqueiam os atalhos; caixas de seleção e controles não', () => {
    expect(hotkeyTarget({ tagName: 'INPUT', type: 'text' })).toBe('text');
    expect(hotkeyTarget({ tagName: 'TEXTAREA' })).toBe('text');
    expect(hotkeyTarget({ tagName: 'DIV', isContentEditable: true })).toBe('text');
    expect(hotkeyTarget({ tagName: 'SELECT' })).toBe('select');
    expect(hotkeyTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe('other');
    expect(hotkeyTarget({ tagName: 'INPUT', type: 'range' })).toBe('other');
    expect(hotkeyTarget({ tagName: 'BUTTON' })).toBe('other');
    expect(hotkeyTarget(null)).toBe('other');
  });
});

describe('etapa 2 — salto em degrau na equação do arco', () => {
  it('x/abs(x) (deslocado para não cair numa amostra) é recusado como descontínuo', async () => {
    const { compileArcCurve } = await import('../src/model/curve');
    const r = compileArcCurve('1+(x-2.00013)/abs(x-2.00013)', 0, 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/salto/);
  });
  it('curva contínua muito inclinada (atan(1000·x)) continua aceita', async () => {
    const { compileArcCurve } = await import('../src/model/curve');
    expect(compileArcCurve('atan(1000*(x-2.00013))', 0, 4).ok).toBe(true);
    expect(compileArcCurve('sqrt(25-x^2)', -5, 5).ok).toBe(true);
  });
});
