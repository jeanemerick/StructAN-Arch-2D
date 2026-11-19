import { describe, it, expect } from 'vitest';
import { emptyModel, addNode, addBar, addArc, setSupport, updateNode, updateSection } from '../src/model/ops';
import { validateModel } from '../src/model/validate';
import type { Model } from '../src/model/types';

const PIN = { rx: true, ry: true, rz: false };

function beam(L = 6): { m: Model; a: string; b: string; bar: string } {
  const a = addNode(emptyModel(), 0, 0);
  const b = addNode(a.model, L, 0);
  const r = addBar(b.model, a.id, b.id);
  let m = setSupport(r.model, a.id, PIN);
  m = setSupport(m, b.id, { rx: false, ry: true, rz: false });
  return { m, a: a.id, b: b.id, bar: r.id };
}

/** Monta um arco sem passar pela validação de addArc (simula arquivo editado à mão). */
function rawArc(expr: string, xi: number, yi: number, xj: number, yj: number): { m: Model; arc: string } {
  const a = addNode(emptyModel(), xi, yi);
  const b = addNode(a.model, xj, yj);
  let m = setSupport(b.model, a.id, PIN);
  m = setSupport(m, b.id, PIN);
  m = {
    ...m,
    members: [
      { kind: 'arc', id: 'm1', ni: a.id, nj: b.id, sectionId: m.sections[0].id, hingeI: false, hingeJ: false, loads: [], expr, nSeg: 40 },
    ],
  };
  return { m, arc: 'm1' };
}

const errors = (m: Model) => validateModel(m).filter((i) => i.severity === 'error');

describe('validateModel', () => {
  it('viga biapoiada válida não tem erros', () => {
    expect(errors(beam().m)).toEqual([]);
  });
  it('modelo vazio gera erro', () => {
    expect(errors(emptyModel()).length).toBeGreaterThan(0);
  });
  it('barra de comprimento nulo gera erro apontando a barra', () => {
    const { m, b, bar } = beam();
    const z = updateNode(m, b, { x: 0 });
    const e = errors(z);
    expect(e.some((i) => i.target?.kind === 'member' && i.target.id === bar)).toBe(true);
  });
  it('arco sqrt(25-x^2) de -6 a 6 sai do domínio e gera erro no arco', () => {
    const { m, arc } = rawArc('sqrt(25-x^2)', -6, 0, 6, 0);
    expect(errors(m).some((i) => i.target?.kind === 'member' && i.target.id === arc)).toBe(true);
  });
  it('arco 1/x de -1 a 1 cruza a descontinuidade e gera erro no arco', () => {
    const { m, arc } = rawArc('1/x', -1, -1, 1, 1);
    expect(errors(m).some((i) => i.target?.kind === 'member' && i.target.id === arc)).toBe(true);
  });
  it('nó de extremidade deslocado 0,1 m da curva gera erro no arco', () => {
    const { m, arc } = rawArc('x*(20-x)/20', 0, 0.1, 20, 0);
    const e = errors(m);
    expect(e.some((i) => i.target?.kind === 'member' && i.target.id === arc)).toBe(true);
  });
  it('arco com x inicial maior que x final gera erro', () => {
    const { m, arc } = rawArc('x*(20-x)/20', 20, 0, 0, 0);
    expect(errors(m).some((i) => i.target?.id === arc)).toBe(true);
  });
  it('arco válido criado por addArc não tem erros', () => {
    const r = addArc(emptyModel(), { expr: 'x*(20-x)/20', xi: 0, xj: 20, nSeg: 40, sectionId: 's1' });
    if ('error' in r) throw new Error(r.error);
    const arc = r.model.members[0];
    let m = setSupport(r.model, arc.ni, PIN);
    m = setSupport(m, arc.nj, PIN);
    expect(errors(m)).toEqual([]);
  });
  it('modelo sem apoio gera erro', () => {
    const { m, a, b } = beam();
    const s = setSupport(setSupport(m, a, undefined), b, undefined);
    expect(errors(s).some((i) => /apoio/i.test(i.message))).toBe(true);
  });
  it('seção com E=0 gera erro apontando a barra que a emprega', () => {
    const { m, bar } = beam();
    const z = updateSection(m, m.sections[0].id, { E: 0 });
    expect(errors(z).some((i) => i.target?.kind === 'member' && i.target.id === bar)).toBe(true);
  });
  it('nó isolado gera aviso, não erro', () => {
    const { m } = beam();
    const n = addNode(m, 10, 10);
    const issues = validateModel(n.model);
    expect(issues.some((i) => i.severity === 'warning' && i.target?.kind === 'node' && i.target.id === n.id)).toBe(true);
    expect(errors(n.model)).toEqual([]);
  });
});
