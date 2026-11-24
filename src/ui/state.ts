import type { Id, Model } from '../model/types';

export type Tool = 'select' | 'node' | 'bar' | 'arc';
/** Ferramenta Nó: clicar no desenho ou informar coordenadas. */
export type NodeMode = 'click' | 'coords';
export type View = 'model' | 'reactions' | 'N' | 'Q' | 'M' | 'deformed';

export type SelItem = { kind: 'node' | 'member'; id: Id };
/** Seleção de vários nós e barras/arcos. */
export interface Selection {
  nodes: Id[];
  members: Id[];
}
export const NO_SELECTION: Selection = { nodes: [], members: [] };

export function toSelection(x: Selection | SelItem | null | undefined): Selection {
  if (!x) return NO_SELECTION;
  if ('kind' in x) return x.kind === 'node' ? { nodes: [x.id], members: [] } : { nodes: [], members: [x.id] };
  return x;
}

export const selCount = (s: Selection) => s.nodes.length + s.members.length;

/** O item selecionado quando há exatamente um. */
export function singleSelected(s: Selection): SelItem | null {
  if (selCount(s) !== 1) return null;
  return s.nodes.length ? { kind: 'node', id: s.nodes[0] } : { kind: 'member', id: s.members[0] };
}

export const isSelected = (s: Selection, kind: 'node' | 'member', id: Id) => (kind === 'node' ? s.nodes : s.members).includes(id);

/** União (add) ou troca (toggle) de itens na seleção. */
export function combine(a: Selection, b: Selection, how: 'replace' | 'add' | 'toggle'): Selection {
  if (how === 'replace') return b;
  const merge = (x: Id[], y: Id[]) => {
    if (how === 'add') return [...x, ...y.filter((id) => !x.includes(id))];
    const out = x.filter((id) => !y.includes(id));
    return [...out, ...y.filter((id) => !x.includes(id))];
  };
  return { nodes: merge(a.nodes, b.nodes), members: merge(a.members, b.members) };
}

export interface UiState {
  model: Model;
  past: Model[];
  future: Model[];
  tool: Tool;
  nodeMode: NodeMode;
  selection: Selection;
  view: View;
  grid: number;
  snap: boolean;
  barStart: Id | null;
  scale: number;
  showValues: boolean;
  showReactions: boolean;
  /** Cargas distribuídas desenhadas sobre o eixo (desenho antigo) em vez de faixas retas. */
  loadsOnAxis: boolean;
}

export type Action =
  | { type: 'apply'; fn: (m: Model) => Model; select?: Selection | SelItem | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; model: Model }
  | { type: 'setTool'; tool: Tool; nodeMode?: NodeMode }
  | { type: 'select'; selection: Selection | SelItem | null; how?: 'replace' | 'add' | 'toggle' }
  | { type: 'selectAll' }
  | { type: 'setView'; view: View }
  | { type: 'set'; patch: Partial<Pick<UiState, 'grid' | 'snap' | 'barStart' | 'scale' | 'showValues' | 'showReactions' | 'loadsOnAxis'>> };

const HISTORY = 200;

export function initialState(model: Model): UiState {
  return {
    model,
    past: [],
    future: [],
    tool: 'select',
    nodeMode: 'click',
    selection: NO_SELECTION,
    view: 'model',
    grid: 0.5,
    snap: true,
    barStart: null,
    scale: 1,
    showValues: true,
    showReactions: true,
    loadsOnAxis: false,
  };
}

/** Só os itens que existem no modelo. */
function prune(m: Model, sel: Selection): Selection {
  const nodes = sel.nodes.filter((id) => m.nodes.some((n) => n.id === id));
  const members = sel.members.filter((id) => m.members.some((k) => k.id === id));
  return nodes.length === sel.nodes.length && members.length === sel.members.length ? sel : { nodes, members };
}

function withModel(s: UiState, model: Model): UiState {
  return {
    ...s,
    model,
    selection: prune(model, s.selection),
    barStart: s.barStart && model.nodes.some((n) => n.id === s.barStart) ? s.barStart : null,
  };
}

export function reducer(s: UiState, a: Action): UiState {
  switch (a.type) {
    case 'apply': {
      const next = a.fn(s.model);
      if (next === s.model) return a.select !== undefined ? { ...s, selection: prune(s.model, toSelection(a.select)) } : s;
      const out = withModel({ ...s, past: [...s.past, s.model].slice(-HISTORY), future: [] }, next);
      return a.select !== undefined ? { ...out, selection: prune(next, toSelection(a.select)) } : out;
    }
    case 'undo': {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return withModel({ ...s, past: s.past.slice(0, -1), future: [s.model, ...s.future] }, prev);
    }
    case 'redo': {
      if (s.future.length === 0) return s;
      const [next, ...rest] = s.future;
      return withModel({ ...s, past: [...s.past, s.model], future: rest }, next);
    }
    case 'load':
      return { ...s, model: a.model, past: [], future: [], selection: NO_SELECTION, barStart: null };
    case 'setTool': {
      // escolher uma ferramenta de modelagem numa vista de resultado volta ao modelo
      const view = a.tool !== 'select' ? 'model' : s.view;
      return { ...s, tool: a.tool, nodeMode: a.nodeMode ?? s.nodeMode, barStart: null, view };
    }
    case 'select':
      return { ...s, selection: prune(s.model, combine(s.selection, toSelection(a.selection), a.how ?? 'replace')) };
    case 'selectAll':
      return { ...s, selection: { nodes: s.model.nodes.map((n) => n.id), members: s.model.members.map((k) => k.id) } };
    case 'setView':
      return { ...s, view: a.view };
    case 'set':
      return { ...s, ...a.patch };
  }
}
