import type { Arc, DistLoad, Id, Member, MemberBase, Model, NodalLoad, Node, Section, Support } from './types';
import { compileArcCurve, NSEG_MAX, NSEG_MIN } from './curve';

/** Distância máxima para considerar dois nós o mesmo ponto (m). */
export const MERGE_TOL = 1e-6;

/** Coeficiente de dilatação térmica padrão (1/°C). */
export const ALPHA_DEFAULT = 1e-5;

export function emptyModel(): Model {
  return {
    version: 2,
    nodes: [],
    members: [],
    sections: [{ id: 's1', name: 'Seção 1', E: 25e6, shape: { kind: 'rect', b: 0.2, h: 0.4 }, alpha: ALPHA_DEFAULT }],
  };
}

/** Área e inércia geométricas; null na seção de rigidez direta. */
export function sectionArea(s: Section): { A: number; I: number } | null {
  const sh = s.shape;
  switch (sh.kind) {
    case 'rect':
      return { A: sh.b * sh.h, I: (sh.b * sh.h ** 3) / 12 };
    case 'circ':
      return { A: (Math.PI * sh.d ** 2) / 4, I: (Math.PI * sh.d ** 4) / 64 };
    case 'generic':
      return { A: sh.A, I: sh.I };
    case 'direct':
      return null;
  }
}

export function sectionProps(s: Section): { EA: number; EI: number } {
  if (s.shape.kind === 'direct') return { EA: s.shape.EA, EI: s.shape.EI };
  const { A, I } = sectionArea(s)!;
  return { EA: s.E * A, EI: s.E * I };
}

/** Altura da seção (m) para o gradiente térmico; undefined quando não informada. */
export function sectionHeight(s: Section): number | undefined {
  const sh = s.shape;
  if (sh.kind === 'rect') return sh.h;
  if (sh.kind === 'circ') return sh.d;
  return sh.h;
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
    alpha: base?.alpha ?? ALPHA_DEFAULT,
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

/** Muda as coordenadas sem ligar o nó a nada (operação elementar; prefira moveNode). */
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
  const L = Math.sqrt(L2);
  const out: { id: Id; t: number }[] = [];
  for (const n of m.nodes) {
    if (n.id === a.id || n.id === b.id) continue;
    const t = ((n.x - a.x) * dx + (n.y - a.y) * dy) / L2;
    // o nó precisa estar no interior, longe das extremidades (perto delas ele se funde ao nó da ponta)
    if (t * L < LINK_TOL || (1 - t) * L < LINK_TOL) continue;
    if (isNear(Math.hypot(a.x + dx * t - n.x, a.y + dy * t - n.y))) out.push({ id: n.id, t });
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
      behavior: 'frame',
    };
    out = { ...out, members: [...out.members, bar] };
  }
  return { model: out, id: firstId };
}

export type MemberPatch = Partial<Pick<MemberBase, 'sectionId' | 'hingeI' | 'hingeJ' | 'loads' | 'behavior' | 'thermal'>>;

/** Altera a barra; `thermal: undefined` no patch remove a temperatura. */
export function updateMember(m: Model, id: Id, patch: MemberPatch): Model {
  return {
    ...m,
    members: m.members.map((k) => {
      if (k.id !== id) return k;
      const next = { ...k, ...patch } as Member;
      if ('thermal' in patch && !patch.thermal) delete next.thermal;
      return next;
    }),
  };
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
    behavior: 'frame',
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
  return { model: splitAt(added.model, id, added.id, t), nodeId: added.id };
}

/** Troca o membro `id` por dois trechos que se encontram no nó `nodeId` (t = fração da posição). */
function splitAt(m: Model, id: Id, nodeId: Id, t: number): Model {
  const mem = m.members.find((k) => k.id === id)!;
  const [la, lb] = splitLoads(mem.loads, t);
  const first: Member = { ...mem, nj: nodeId, hingeJ: false, loads: la };
  const second: Member = { ...mem, id: newMemberId(m), ni: nodeId, hingeI: false, loads: lb };
  const members: Member[] = [];
  for (const k of m.members) {
    if (k.id === id) members.push(first, second);
    else members.push(k);
  }
  return { ...m, members };
}

// ---------------------------------------------------------------- ligação automática de nós

/**
 * Distância (m) a partir da qual um nó deixa de ser considerado sobre outro nó ou sobre
 * uma barra ou arco: menos de 1 mm liga; 1 mm ou mais fica separado.
 */
export const LINK_TOL = 1e-3;

function isNear(d: number): boolean {
  return d < LINK_TOL * (1 - 1e-9);
}

/** Nó (outro que não `except`) a menos de LINK_TOL do ponto, o mais próximo. */
export function nodeNear(m: Model, x: number, y: number, except?: Id): Node | undefined {
  let best: Node | undefined;
  let bestD = Infinity;
  for (const n of m.nodes) {
    if (n.id === except) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (isNear(d) && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

export interface MemberHit {
  id: Id;
  /** Fração ao longo da barra ou do intervalo em x do arco. */
  t: number;
  /** Ponto correspondente sobre o eixo do elemento. */
  x: number;
  y: number;
}

/** Barras e arcos em cujo interior o ponto (x, y) cai (a menos de LINK_TOL do eixo). */
export function membersThrough(m: Model, x: number, y: number, skip: (k: Member) => boolean = () => false): MemberHit[] {
  const out: MemberHit[] = [];
  for (const k of m.members) {
    if (skip(k)) continue;
    const a = m.nodes.find((n) => n.id === k.ni);
    const b = m.nodes.find((n) => n.id === k.nj);
    if (!a || !b) continue;
    if (k.kind === 'bar') {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy;
      if (L2 === 0) continue;
      const L = Math.sqrt(L2);
      const t = ((x - a.x) * dx + (y - a.y) * dy) / L2;
      if (t * L < LINK_TOL || (1 - t) * L < LINK_TOL) continue;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      if (isNear(Math.hypot(px - x, py - y))) out.push({ id: k.id, t, x: px, y: py });
      continue;
    }
    if (!(x > a.x && x < b.x)) continue;
    const c = compileArcCurve(k.expr, a.x, b.x);
    if (!c.ok) continue;
    const fy = c.fn(x);
    if (!isNear(Math.abs(fy - y))) continue;
    if (isNear(Math.hypot(x - a.x, fy - a.y)) || isNear(Math.hypot(x - b.x, fy - b.y))) continue;
    out.push({ id: k.id, t: (x - a.x) / (b.x - a.x), x, y: fy });
  }
  return out;
}

/** Nós soltos sobre o interior do membro, em ordem do nó inicial ao final. */
function nodesOnMember(m: Model, k: Member): { id: Id; t: number }[] {
  const out: { id: Id; t: number }[] = [];
  for (const n of m.nodes) {
    if (n.id === k.ni || n.id === k.nj) continue;
    const hit = membersThrough({ ...m, members: [k] }, n.x, n.y);
    if (hit.length > 0) out.push({ id: n.id, t: hit[0].t });
  }
  return out.sort((p, q) => p.t - q.t);
}

const isArcEnd = (m: Model, id: Id) => m.members.some((k) => k.kind === 'arc' && (k.ni === id || k.nj === id));

/** Divide o membro em todos os nós que estão sobre o seu interior. */
export function linkMember(m: Model, memberId: Id): Model {
  let out = m;
  let current: Id | undefined = memberId;
  while (current) {
    const k = out.members.find((q) => q.id === current);
    if (!k) break;
    const [first] = nodesOnMember(out, k);
    if (!first) break;
    // no arco, o nó vai exatamente para a curva (a validação exige)
    if (k.kind === 'arc' && !isArcEnd(out, first.id)) {
      const a = out.nodes.find((n) => n.id === k.ni)!;
      const b = out.nodes.find((n) => n.id === k.nj)!;
      const c = compileArcCurve(k.expr, a.x, b.x);
      const node = out.nodes.find((n) => n.id === first.id)!;
      if (c.ok) out = updateNode(out, first.id, { y: c.fn(node.x) });
    }
    const before = new Set(out.members.map((q) => q.id));
    out = splitAt(out, k.id, first.id, first.t);
    current = out.members.find((q) => !before.has(q.id))?.id;
  }
  return out;
}

/**
 * Funde o nó `drop` no nó `keep`: as barras passam a chegar em `keep`, as cargas nodais
 * são somadas e o apoio de `keep` prevalece (o de `drop` só vale se `keep` não tiver).
 * Barras que ficariam com as duas pontas no mesmo nó são removidas.
 */
export function mergeNodes(m: Model, keep: Id, drop: Id): Model {
  const k = m.nodes.find((n) => n.id === keep);
  const d = m.nodes.find((n) => n.id === drop);
  if (!k || !d || keep === drop) return m;
  const merged: Node = { id: k.id, x: k.x, y: k.y };
  const support = k.support ?? d.support;
  if (support) merged.support = support;
  if (k.load || d.load) {
    const a = k.load ?? { fx: 0, fy: 0, mz: 0 };
    const b = d.load ?? { fx: 0, fy: 0, mz: 0 };
    const sum = { fx: a.fx + b.fx, fy: a.fy + b.fy, mz: a.mz + b.mz };
    if (sum.fx !== 0 || sum.fy !== 0 || sum.mz !== 0) merged.load = sum;
  }
  const members = m.members
    .map((q) => ({ ...q, ni: q.ni === drop ? keep : q.ni, nj: q.nj === drop ? keep : q.nj }) as Member)
    .filter((q) => q.ni !== q.nj);
  return { ...m, nodes: m.nodes.filter((n) => n.id !== drop).map((n) => (n.id === keep ? merged : n)), members };
}

/**
 * Liga o nó ao restante do modelo: se cair sobre outro nó, funde-se com ele; se cair sobre
 * o interior de barras ou arcos, divide-os nesse ponto; e as barras que chegam a ele passam
 * a ser divididas nos nós que estiverem sobre elas. Devolve o id final do nó.
 */
export function connectNode(m: Model, id: Id): { model: Model; id: Id } {
  const node = m.nodes.find((n) => n.id === id);
  if (!node) return { model: m, id };
  let out = m;
  let nodeId = id;
  const other = nodeNear(m, node.x, node.y, id);
  if (other) {
    out = mergeNodes(m, other.id, id);
    nodeId = other.id;
  } else {
    const skip = (k: Member) => k.ni === id || k.nj === id;
    let hits = membersThrough(out, node.x, node.y, skip);
    if (hits.length > 0 && !isArcEnd(out, id)) {
      out = updateNode(out, id, { x: hits[0].x, y: hits[0].y });
    }
    // um corte por vez: os ids dos membros mudam a cada divisão
    let guard = 0;
    while (hits.length > 0 && guard++ < 50) {
      out = splitAt(out, hits[0].id, id, hits[0].t);
      const n = out.nodes.find((q) => q.id === id)!;
      hits = membersThrough(out, n.x, n.y, skip);
    }
  }
  for (const k of out.members.filter((q) => q.ni === nodeId || q.nj === nodeId)) {
    out = linkMember(out, k.id);
  }
  return { model: out, id: nodeId };
}

/**
 * Muda as coordenadas do nó e o liga ao que estiver no novo ponto (ver connectNode).
 * Extremidades de arco por equação livre não se movem: a posição segue a curva.
 */
export function moveNode(m: Model, id: Id, patch: Partial<Pick<Node, 'x' | 'y'>>): { model: Model; id: Id } | { error: string } {
  const node = m.nodes.find((n) => n.id === id);
  if (!node) return { error: 'Nó não encontrado' };
  const x = patch.x ?? node.x;
  const y = patch.y ?? node.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: 'Coordenadas inválidas' };
  if (isArcEnd(m, id)) return { error: `O nó ${id} é extremidade de arco: a posição segue a equação do arco` };
  return connectNode(updateNode(m, id, { x, y }), id);
}

/** Nó no ponto: o existente (a menos de 1 mm) ou um novo, já ligado ao que estiver ali. */
export function placeNode(m: Model, x: number, y: number): { model: Model; id: Id } {
  const ex = nodeNear(m, x, y);
  if (ex) return { model: m, id: ex.id };
  const a = addNode(m, x, y);
  return connectNode(a.model, a.id);
}
