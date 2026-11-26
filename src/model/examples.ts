import type { Model } from './types';
import { addArc, addArcBetween, addBar, setNodeHinge, addNode, addSection, emptyModel, setNodalLoad, setSupport, splitMember, updateMember, updateSection } from './ops';
import { parabola } from './presets';

const FIX = { rx: true, ry: true, rz: true };
const PIN = { rx: true, ry: true, rz: false };
const ROLLER = { rx: false, ry: true, rz: false };
const projQ = (q: number) => ({ dir: 'globalY' as const, ref: 'projection' as const, qi: q, qj: q });
const lenQ = (q: number) => ({ dir: 'globalY' as const, ref: 'length' as const, qi: q, qj: q });

function arcOrThrow<T>(r: T | { error: string }): T {
  if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
  return r as T;
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
  // rótula do fecho atribuída pelo nó
  m = setNodeHinge(s.model, s.nodeId, true);
  const [left] = m.members;
  m = updateMember(m, left.id, { loads: [projQ(-10)] });
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

/** Arco da imagem 1: parábola de vão 6 m e altura 1,5 m, triarticulado, q = 10 kN/m por projeção. */
function arcoTriarticuladoFaixa(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Arco 20×40' });
  const r = arcOrThrow(addArcBetween(m, { pi: { x: 0, y: 0 }, pj: { x: 6, y: 0 }, shape: 'parabola', rise: 1.5, nSeg: 40, sectionId: 's1' }));
  const arc = r.model.members[0];
  const s = splitMember(r.model, r.id, 3);
  // rótula do fecho (C) atribuída pelo nó
  m = setNodeHinge(s.model, s.nodeId, true);
  const [left, right] = m.members;
  m = updateMember(m, left.id, { loads: [projQ(-10)] });
  m = updateMember(m, right.id, { loads: [projQ(-10)] });
  m = setSupport(m, arc.ni, PIN);
  return setSupport(m, arc.nj, PIN);
}

/**
 * Pórtico de duas águas da imagem 2: três pilares engastados de 4 m, espaçados de 4 m; o central
 * sobe até a cumeeira (3 m acima). Águas somente flexão (EI), tirantes somente axiais (EA).
 * Cargas da figura são simbólicas: 10 kN/m vertical por projeção na água esquerda e 5 kN/m
 * horizontal no pilar direito, apontando para a estrutura; recalque de 1 cm (−Y) no apoio esquerdo.
 */
function porticoDuasAguasTirantes(): Model {
  let m = updateSection(emptyModel(), 's1', { name: 'Pilar 20×40' });
  const agua = addSection(m, { name: 'Água (EI = 20 000 kN·m²)', shape: { kind: 'direct', EA: 0, EI: 20000 } });
  const tir = addSection(agua.model, { name: 'Tirante (EA = 40 000 kN)', shape: { kind: 'direct', EA: 40000, EI: 0 } });
  m = tir.model;
  const at: Record<string, string> = {};
  for (const [k, x, y] of [
    ['A', 0, 0],
    ['B', 4, 0],
    ['C', 8, 0],
    ['D', 0, 4],
    ['E', 4, 4],
    ['F', 8, 4],
    ['G', 4, 7],
  ] as const) {
    const r = addNode(m, x, y);
    m = r.model;
    at[k] = r.id;
  }
  const bar = (a: string, b: string, sec?: string) => {
    const r = addBar(m, at[a], at[b], sec);
    m = r.model;
    return r.id;
  };
  bar('A', 'D');
  bar('B', 'E');
  bar('E', 'G');
  const right = bar('C', 'F');
  const slopeL = bar('D', 'G', agua.id);
  const slopeR = bar('G', 'F', agua.id);
  const tie1 = bar('D', 'E', tir.id);
  const tie2 = bar('E', 'F', tir.id);
  m = updateMember(m, slopeL, { behavior: 'bending', loads: [projQ(-10)] });
  m = updateMember(m, slopeR, { behavior: 'bending' });
  m = updateMember(m, tie1, { behavior: 'axial' });
  m = updateMember(m, tie2, { behavior: 'axial' });
  m = updateMember(m, right, { loads: [{ dir: 'globalX', ref: 'length', qi: -5, qj: -5 }] });
  m = setSupport(m, at.A, { ...FIX, dy: -0.01 });
  m = setSupport(m, at.B, FIX);
  return setSupport(m, at.C, FIX);
}

export const examples: { slug: string; name: string; build(): Model }[] = [
  { slug: 'viga-biapoiada', name: 'Viga biapoiada', build: vigaBiapoiada },
  { slug: 'portico-plano', name: 'Pórtico plano', build: porticoPlano },
  { slug: 'arco-parabolico-biarticulado', name: 'Arco parabólico biarticulado', build: arcoParabolicoBiarticulado },
  { slug: 'arco-triarticulado', name: 'Arco triarticulado (carga em meio vão)', build: arcoTriarticulado },
  { slug: 'arco-atirantado', name: 'Arco atirantado', build: arcoAtirantado },
  { slug: 'arco-triarticulado-faixa', name: 'Arco triarticulado com carga em faixa (q = 10 kN/m, vão 6 m)', build: arcoTriarticuladoFaixa },
  {
    slug: 'portico-duas-aguas-tirantes',
    name: 'Pórtico de duas águas com tirantes (10 kN/m na água esquerda, 5 kN/m no pilar direito)',
    build: porticoDuasAguasTirantes,
  },
];
