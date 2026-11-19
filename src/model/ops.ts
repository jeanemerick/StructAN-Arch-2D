import type { Arc, DistLoad, Id, Member, MemberBase, Model, NodalLoad, Node, Section, Support } from './types';
import { compileArcCurve, NSEG_MAX, NSEG_MIN } from './curve';

/** Distância máxima para considerar dois nós o mesmo ponto (m). */
export const MERGE_TOL = 1e-6;

export function emptyModel(): Model {
  return {
    version: 1,
    nodes: [],
    members: [],
    sections: [{ id: 's1', name: 'Seção 1', E: 25e6, shape: { kind: 'rect', b: 0.2, h: 0.4 } }],
  };
}

export function sectionArea(s: Section): { A: number; I: number } {
  const sh = s.shape;
  switch (sh.kind) {
    case 'rect':
      return { A: sh.b * sh.h, I: (sh.b * sh.h ** 3) / 12 };
    case 'circ':
      return { A: (Math.PI * sh.d ** 2) / 4, I: (Math.PI * sh.d ** 4) / 64 };
    case 'generic':
      return { A: sh.A, I: sh.I };
  }
}

export function sectionProps(s: Section): { EA: number; EI: number } {
  const { A, I } = sectionArea(s);
  return { EA: s.E * A, EI: s.E * I };
}

function nextId(prefix: string, ids: Id[]): Id {
  let max = 0;
  for (const id of ids) {
    if (id.startsWith(prefix)) {
      const n = Number(id.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

// ---------------------------------------------------------------- seções

export function addSection(m: Model, base?: Partial<Omit<Section, 'id'>>): { model: Model; id: Id } {
  const id = nextId('s', m.sections.map((s) => s.id));
  const s: Section = {
    id,
    name: base?.name ?? `Seção ${m.sections.length + 1}`,
    E: base?.E ?? 25e6,
    shape: base?.shape ?? { kind: 'rect', b: 0.2, h: 0.4 },
  };
  return { model: { ...m, sections: [...m.sections, s] }, id };
}

export function updateSection(m: Model, id: Id, patch: Partial<Omit<Section, 'id'>>): Model {
  return { ...m, sections: m.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function deleteSection(m: Model, id: Id): Model | { error: string } {
  if (m.members.some((k) => k.sectionId === id)) return { error: 'A seção está atribuída a barras e não pode ser apagada' };
  if (m.sections.length <= 1) return { error: 'O modelo precisa de pelo menos uma seção' };
  return { ...m, sections: m.sections.filter((s) => s.id !== id) };
}

// ---------------------------------------------------------------- nós

export function findNodeAt(m: Model, x: number, y: number, tol = MERGE_TOL): Node | undefined {
  return m.nodes.find((n) => Math.hypot(n.x - x, n.y - y) <= tol);
}

export function addNode(m: Model, x: number, y: number): { model: Model; id: Id } {
  const existing = findNodeAt(m, x, y);
  if (existing) return { model: m, id: existing.id };
  const id = nextId('n', m.nodes.map((n) => n.id));
  return { model: { ...m, nodes: [...m.nodes, { id, x, y }] }, id };
}

export function updateNode(m: Model, id: Id, patch: Partial<Pick<Node, 'x' | 'y'>>): Model {
  return { ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function setSupport(m: Model, id: Id, support: Support | undefined): Model {
  return {
    ...m,
    nodes: m.nodes.map((n) => {
      if (n.id !== id) return n;
      const { support: _old, ...rest } = n;
      return support ? { ...rest, support } : rest;
    }),
  };
}

export function setNodalLoad(m: Model, id: Id, load: NodalLoad | undefined): Model {
  return {
    ...m,
    nodes: m.nodes.map((n) => {
      if (n.id !== id) return n;
      const { load: _old, ...rest } = n;
      return load ? { ...rest, load } : rest;
    }),
  };
}

export function deleteNode(m: Model, id: Id): Model {
  return {
    ...m,
    nodes: m.nodes.filter((n) => n.id !== id),
    members: m.members.filter((k) => k.ni !== id && k.nj !== id),
  };
}

// ---------------------------------------------------------------- barras e arcos

function newMemberId(m: Model): Id {
  return nextId('m', m.members.map((k) => k.id));
}

/**
 * Nós (exceto as extremidades) sobre o interior do segmento a–b, ordenados de a para b,
 * com o parâmetro t ∈ (0, 1) de cada um.
 */
export function nodesOnSegment(m: Model, a: Node, b: Node): { id: Id; t: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return [];
  const tol = 1e-6 * Math.max(1, Math.sqrt(L2));
  const out: { id: Id; t: number }[] = [];
  for (const n of m.nodes) {
    if (n.id === a.id || n.id === b.id) continue;
    const t = ((n.x - a.x) * dx + (n.y - a.y) * dy) / L2;
    if (t <= 1e-9 || t >= 1 - 1e-9) continue;
    if (Math.hypot(a.x + dx * t - n.x, a.y + dy * t - n.y) <= tol) out.push({ id: n.id, t });
  }
  return out.sort((p, q) => p.t - q.t);
}

/** Cria a barra ni–nj; se ela passar sobre nós existentes, é dividida neles. Devolve o id do primeiro trecho. */
export function addBar(m: Model, ni: Id, nj: Id, sectionId?: Id): { model: Model; id: Id } {
  const a = m.nodes.find((n) => n.id === ni);
  const b = m.nodes.find((n) => n.id === nj);
  const chain = a && b ? [ni, ...nodesOnSegment(m, a, b).map((p) => p.id), nj] : [ni, nj];
  let out = m;
  let firstId = '';
  for (let i = 0; i + 1 < chain.length; i++) {
    const id = newMemberId(out);
    if (!firstId) firstId = id;
    const bar: Member = {
      kind: 'bar',
      id,
      ni: chain[i],
      nj: chain[i + 1],
      sectionId: sectionId ?? m.sections[0].id,
      hingeI: false,
      hingeJ: false,
      loads: [],
    };
    out = { ...out, members: [...out.members, bar] };
  }
  return { model: out, id: firstId };
}

export type MemberPatch = Partial<Pick<MemberBase, 'sectionId' | 'hingeI' | 'hingeJ' | 'loads'>>;

export function updateMember(m: Model, id: Id, patch: MemberPatch): Model {
  return { ...m, members: m.members.map((k) => (k.id === id ? ({ ...k, ...patch } as Member) : k)) };
}

export function deleteMember(m: Model, id: Id): Model {
  return { ...m, members: m.members.filter((k) => k.id !== id) };
}

function checkNSeg(nSeg: number): string | null {
  if (!Number.isInteger(nSeg) || nSeg < NSEG_MIN || nSeg > NSEG_MAX) {
    return `O número de segmentos deve ser inteiro entre ${NSEG_MIN} e ${NSEG_MAX}`;
  }
  return null;
}

export function addArc(
  m: Model,
  a: { expr: string; xi: number; xj: number; nSeg: number; sectionId: Id },
): { model: Model; id: Id } | { error: string } {
  const segErr = checkNSeg(a.nSeg);
  if (segErr) return { error: segErr };
  const c = compileArcCurve(a.expr, a.xi, a.xj);
  if (!c.ok) return { error: c.error };
  const n1 = addNode(m, a.xi, c.fn(a.xi));
  const n2 = addNode(n1.model, a.xj, c.fn(a.xj));
  if (n1.id === n2.id) return { error: 'As extremidades do arco coincidem' };
  const id = newMemberId(n2.model);
  const arc: Arc = {
    kind: 'arc',
    id,
    ni: n1.id,
    nj: n2.id,
    sectionId: a.sectionId,
    hingeI: false,
    hingeJ: false,
    loads: [],
    expr: a.expr,
    nSeg: a.nSeg,
  };
  return { model: { ...n2.model, members: [...n2.model.members, arc] }, id };
}

export function updateArc(
  m: Model,
  id: Id,
  patch: Partial<Pick<Arc, 'expr' | 'nSeg'>> & { xi?: number; xj?: number },
): Model | { error: string } {
  const arc = m.members.find((k) => k.id === id);
  if (!arc || arc.kind !== 'arc') return { error: 'Arco não encontrado' };
  const ni = m.nodes.find((n) => n.id === arc.ni);
  const nj = m.nodes.find((n) => n.id === arc.nj);
  if (!ni || !nj) return { error: 'Nós do arco não encontrados' };
  const expr = patch.expr ?? arc.expr;
  const nSeg = patch.nSeg ?? arc.nSeg;
  const xi = patch.xi ?? ni.x;
  const xj = patch.xj ?? nj.x;
  const segErr = checkNSeg(nSeg);
  if (segErr) return { error: segErr };
  const c = compileArcCurve(expr, xi, xj);
  if (!c.ok) return { error: c.error };
  let out = updateNode(m, ni.id, { x: xi, y: c.fn(xi) });
  out = updateNode(out, nj.id, { x: xj, y: c.fn(xj) });
  return { ...out, members: out.members.map((k) => (k.id === id ? { ...arc, expr, nSeg } : k)) };
}

function splitLoads(loads: DistLoad[], t: number): [DistLoad[], DistLoad[]] {
  const a: DistLoad[] = [];
  const b: DistLoad[] = [];
  for (const q of loads) {
    const mid = q.qi + (q.qj - q.qi) * t;
    a.push({ ...q, qj: mid });
    b.push({ ...q, qi: mid });
  }
  return [a, b];
}

/**
 * Divide uma barra (at = fração 0–1 do comprimento) ou um arco (at = coordenada x)
 * inserindo um nó. As rótulas permanecem só nas extremidades originais e as cargas
 * distribuídas são repartidas com a intensidade interpolada no ponto de corte.
 */
export function splitMember(m: Model, id: Id, at: number): { model: Model; nodeId: Id } {
  const mem = m.members.find((k) => k.id === id);
  if (!mem) throw new Error('Barra não encontrada');
  const ni = m.nodes.find((n) => n.id === mem.ni)!;
  const nj = m.nodes.find((n) => n.id === mem.nj)!;
  let x: number;
  let y: number;
  let t: number;
  if (mem.kind === 'bar') {
    if (!(at > 0 && at < 1)) throw new Error('A posição deve estar entre 0 e 1');
    t = at;
    x = ni.x + (nj.x - ni.x) * t;
    y = ni.y + (nj.y - ni.y) * t;
  } else {
    if (!(at > ni.x && at < nj.x)) throw new Error('O x deve estar dentro do intervalo do arco');
    const c = compileArcCurve(mem.expr, ni.x, nj.x);
    if (!c.ok) throw new Error(c.error);
    t = (at - ni.x) / (nj.x - ni.x);
    x = at;
    y = c.fn(at);
  }
  const added = addNode(m, x, y);
  const [la, lb] = splitLoads(mem.loads, t);
  const first: Member = { ...mem, nj: added.id, hingeJ: false, loads: la };
  const secondId = newMemberId(added.model);
  const second: Member = { ...mem, id: secondId, ni: added.id, hingeI: false, loads: lb };
  const members: Member[] = [];
  for (const k of added.model.members) {
    if (k.id === id) members.push(first, second);
    else members.push(k);
  }
  return { model: { ...added.model, members }, nodeId: added.id };
}
