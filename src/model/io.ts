import type { Behavior, DistLoad, Member, Model, NodalLoad, Node, Section, Shape, Support, Thermal } from './types';
import { ALPHA_DEFAULT } from './ops';

export function serialize(m: Model): string {
  return JSON.stringify(m, null, 2);
}

class FormatError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new FormatError(`${what} deve ser um número`);
  return v;
}
function optNum(v: unknown, what: string): number | undefined {
  return v === undefined ? undefined : num(v, what);
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new FormatError(`${what} deve ser um texto`);
  return v;
}
function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new FormatError(`${what} deve ser verdadeiro ou falso`);
  return v;
}

function parseSupport(v: unknown, where: string): Support | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new FormatError(`Apoio inválido em ${where}`);
  const s: Support = { rx: bool(v.rx, `${where}.rx`), ry: bool(v.ry, `${where}.ry`), rz: bool(v.rz, `${where}.rz`) };
  for (const k of ['kx', 'ky', 'kz', 'dx', 'dy', 'dz'] as const) {
    const val = optNum(v[k], `${where}.${k}`);
    if (val !== undefined) s[k] = val;
  }
  return s;
}

function parseLoad(v: unknown, where: string): NodalLoad | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new FormatError(`Carga inválida em ${where}`);
  return { fx: num(v.fx, `${where}.fx`), fy: num(v.fy, `${where}.fy`), mz: num(v.mz, `${where}.mz`) };
}

function parseShape(v: unknown, where: string): Shape {
  if (!isObj(v)) throw new FormatError(`Forma inválida em ${where}`);
  switch (v.kind) {
    case 'rect':
      return { kind: 'rect', b: num(v.b, `${where}.b`), h: num(v.h, `${where}.h`) };
    case 'circ':
      return { kind: 'circ', d: num(v.d, `${where}.d`) };
    case 'generic': {
      const out: Shape = { kind: 'generic', A: num(v.A, `${where}.A`), I: num(v.I, `${where}.I`) };
      const h = optNum(v.h, `${where}.h`);
      if (h !== undefined) out.h = h;
      return out;
    }
    case 'direct': {
      const out: Shape = { kind: 'direct', EA: num(v.EA, `${where}.EA`), EI: num(v.EI, `${where}.EI`) };
      const h = optNum(v.h, `${where}.h`);
      if (h !== undefined) out.h = h;
      return out;
    }
    default:
      throw new FormatError(`Tipo de seção desconhecido em ${where}`);
  }
}

const BEHAVIORS: Behavior[] = ['frame', 'axial', 'bending'];

function parseThermal(v: unknown, where: string): Thermal | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) throw new FormatError(`Temperatura inválida em ${where}`);
  return { tExt: num(v.tExt, `${where}.tExt`), tInt: num(v.tInt, `${where}.tInt`) };
}

function unique(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new FormatError(`Há ${what} com identificador repetido (${id})`);
    seen.add(id);
  }
}

const DIRS = ['globalX', 'globalY', 'localX', 'localY'];
const REFS = ['length', 'projection'];

function parseDist(v: unknown, where: string): DistLoad {
  if (!isObj(v) || !DIRS.includes(v.dir as string) || !REFS.includes(v.ref as string)) {
    throw new FormatError(`Carga distribuída inválida em ${where}`);
  }
  return {
    dir: v.dir as DistLoad['dir'],
    ref: v.ref as DistLoad['ref'],
    qi: num(v.qi, `${where}.qi`),
    qj: num(v.qj, `${where}.qj`),
  };
}

export function parseModel(text: string): { ok: true; model: Model } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não está no formato JSON' };
  }
  try {
    if (!isObj(raw)) throw new FormatError('Conteúdo do arquivo inválido');
    // versão 1 (primeira etapa): sem tipo de barra, temperatura nem α; é migrada ao abrir
    if (raw.version !== 1 && raw.version !== 2) throw new FormatError('Versão do arquivo não suportada');
    const v1 = raw.version === 1;
    if (!Array.isArray(raw.nodes) || !Array.isArray(raw.members) || !Array.isArray(raw.sections)) {
      throw new FormatError('O arquivo precisa das listas nodes, members e sections');
    }
    const sections: Section[] = raw.sections.map((s, i) => {
      const w = `sections[${i}]`;
      if (!isObj(s)) throw new FormatError(`Seção inválida em ${w}`);
      const alpha = v1 ? ALPHA_DEFAULT : num(s.alpha, `${w}.alpha`);
      return { id: str(s.id, `${w}.id`), name: str(s.name, `${w}.name`), E: num(s.E, `${w}.E`), shape: parseShape(s.shape, `${w}.shape`), alpha };
    });
    if (sections.length === 0) throw new FormatError('O modelo precisa de pelo menos uma seção');
    unique(
      sections.map((s) => s.id),
      'seções',
    );
    const nodes: Node[] = raw.nodes.map((n, i) => {
      const w = `nodes[${i}]`;
      if (!isObj(n)) throw new FormatError(`Nó inválido em ${w}`);
      const out: Node = { id: str(n.id, `${w}.id`), x: num(n.x, `${w}.x`), y: num(n.y, `${w}.y`) };
      const sup = parseSupport(n.support, `${w}.support`);
      if (sup) out.support = sup;
      const load = parseLoad(n.load, `${w}.load`);
      if (load) out.load = load;
      return out;
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    const sectionIds = new Set(sections.map((s) => s.id));
    if (nodeIds.size !== nodes.length) throw new FormatError('Há nós com identificador repetido');
    const members: Member[] = raw.members.map((k, i) => {
      const w = `members[${i}]`;
      if (!isObj(k)) throw new FormatError(`Barra inválida em ${w}`);
      if (!Array.isArray(k.loads)) throw new FormatError(`${w}.loads deve ser uma lista`);
      const base = {
        id: str(k.id, `${w}.id`),
        ni: str(k.ni, `${w}.ni`),
        nj: str(k.nj, `${w}.nj`),
        sectionId: str(k.sectionId, `${w}.sectionId`),
        hingeI: bool(k.hingeI, `${w}.hingeI`),
        hingeJ: bool(k.hingeJ, `${w}.hingeJ`),
        loads: k.loads.map((l, j) => parseDist(l, `${w}.loads[${j}]`)),
        behavior: 'frame' as Behavior,
      };
      if (!v1) {
        if (!BEHAVIORS.includes(k.behavior as Behavior)) throw new FormatError(`Tipo de barra desconhecido em ${w}.behavior`);
        base.behavior = k.behavior as Behavior;
      }
      const thermal = parseThermal(k.thermal, `${w}.thermal`);
      if (!nodeIds.has(base.ni) || !nodeIds.has(base.nj)) throw new FormatError(`A barra ${base.id} liga um nó inexistente`);
      if (!sectionIds.has(base.sectionId)) throw new FormatError(`A barra ${base.id} aponta para uma seção inexistente`);
      let out: Member;
      if (k.kind === 'bar') out = { kind: 'bar', ...base };
      else if (k.kind === 'arc') out = { kind: 'arc', ...base, expr: str(k.expr, `${w}.expr`), nSeg: num(k.nSeg, `${w}.nSeg`) };
      else throw new FormatError(`Tipo de barra desconhecido em ${w}`);
      if (thermal) out.thermal = thermal;
      return out;
    });
    unique(
      members.map((k) => k.id),
      'barras',
    );
    return { ok: true, model: { version: 2, nodes, members, sections } };
  } catch (e) {
    if (e instanceof FormatError) return { ok: false, error: e.message };
    throw e;
  }
}
