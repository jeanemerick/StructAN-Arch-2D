import type { Model } from './types';
import { addArc, addBar, addNode, addSection, emptyModel, setNodalLoad, setSupport, splitMember, updateMember, updateSection } from './ops';
import { parabola } from './presets';

const FIX = { rx: true, ry: true, rz: true };
const PIN = { rx: true, ry: true, rz: false };
const ROLLER = { rx: false, ry: true, rz: false };
const projQ = (q: number) => ({ dir: 'globalY' as const, ref: 'projection' as const, qi: q, qj: q });
const lenQ = (q: number) => ({ dir: 'globalY' as const, ref: 'length' as const, qi: q, qj: q });

function arcOrThrow(r: ReturnType<typeof addArc>) {
  if ('error' in r) throw new Error(r.error);
  return r;
}

function vigaBiapoiada(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Viga 20×50', shape: { kind: 'rect', b: 0.2, h: 0.5 } });
  const a = addNode(m, 0, 0);
  const b = addNode(a.model, 6, 0);
  const bar = addBar(b.model, a.id, b.id);
  m = updateMember(bar.model, bar.id, { loads: [lenQ(-10)] });
  m = setSupport(m, a.id, PIN);
  return setSupport(m, b.id, ROLLER);
}

function porticoPlano(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Pilar 20×40' });
  const viga = addSection(m, { name: 'Viga 20×50', shape: { kind: 'rect', b: 0.2, h: 0.5 } });
  m = viga.model;
  const ids: string[] = [];
  for (const [x, y] of [
    [0, 0],
    [0, 4],
    [6, 4],
    [6, 0],
  ]) {
    const r = addNode(m, x, y);
    m = r.model;
    ids.push(r.id);
  }
  m = addBar(m, ids[0], ids[1]).model;
  const beam = addBar(m, ids[1], ids[2], viga.id);
  m = updateMember(beam.model, beam.id, { loads: [lenQ(-15)] });
  m = addBar(m, ids[3], ids[2]).model;
  m = setSupport(m, ids[0], FIX);
  m = setSupport(m, ids[3], FIX);
  return setNodalLoad(m, ids[1], { fx: 10, fy: 0, mz: 0 });
}

function arcoParabolicoBiarticulado(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Arco 30×60', shape: { kind: 'rect', b: 0.3, h: 0.6 } });
  const r = arcOrThrow(addArc(m, { expr: parabola(0, 0, 20, 5), xi: 0, xj: 20, nSeg: 40, sectionId: 's1' }));
  m = updateMember(r.model, r.id, { loads: [projQ(-10)] });
  const arc = m.members[0];
  m = setSupport(m, arc.ni, PIN);
  return setSupport(m, arc.nj, PIN);
}

function arcoTriarticulado(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Arco 30×60', shape: { kind: 'rect', b: 0.3, h: 0.6 } });
  const r = arcOrThrow(addArc(m, { expr: parabola(0, 0, 20, 5), xi: 0, xj: 20, nSeg: 40, sectionId: 's1' }));
  const arc = r.model.members[0];
  const s = splitMember(r.model, r.id, 10);
  m = s.model;
  const [left] = m.members;
  m = updateMember(m, left.id, { hingeJ: true, loads: [projQ(-10)] });
  m = setSupport(m, arc.ni, PIN);
  return setSupport(m, arc.nj, PIN);
}

function arcoAtirantado(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Arco 20×40' });
  const tie = addSection(m, { name: 'Tirante aço Ø10 cm', E: 200e6, shape: { kind: 'circ', d: 0.1 } });
  m = tie.model;
  const r = arcOrThrow(addArc(m, { expr: parabola(0, 0, 20, 4), xi: 0, xj: 20, nSeg: 40, sectionId: 's1' }));
  m = updateMember(r.model, r.id, { loads: [projQ(-10)] });
  const arc = m.members[0];
  const t = addBar(m, arc.ni, arc.nj, tie.id);
  m = updateMember(t.model, t.id, { hingeI: true, hingeJ: true });
  m = setSupport(m, arc.ni, PIN);
  return setSupport(m, arc.nj, ROLLER);
}

export const examples: { slug: string; name: string; build(): Model }[] = [
  { slug: 'viga-biapoiada', name: 'Viga biapoiada', build: vigaBiapoiada },
  { slug: 'portico-plano', name: 'Pórtico plano', build: porticoPlano },
  { slug: 'arco-parabolico-biarticulado', name: 'Arco parabólico biarticulado', build: arcoParabolicoBiarticulado },
  { slug: 'arco-triarticulado', name: 'Arco triarticulado (carga em meio vão)', build: arcoTriarticulado },
  { slug: 'arco-atirantado', name: 'Arco atirantado', build: arcoAtirantado },
];
