import type { Id, Model } from '../model/types';

export type Tool = 'select' | 'node' | 'bar' | 'arc';
export type View = 'model' | 'reactions' | 'N' | 'Q' | 'M' | 'deformed';
export type Selection = { kind: 'node' | 'member'; id: Id } | null;

export interface UiState {
  model: Model;
  past: Model[];
  future: Model[];
  tool: Tool;
  selection: Selection;
  view: View;
  grid: number;
  snap: boolean;
  barStart: Id | null;
  scale: number;
  showValues: boolean;
}

export type Action =
  | { type: 'apply'; fn: (m: Model) => Model; select?: Selection }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; model: Model }
  | { type: 'setTool'; tool: Tool }
  | { type: 'select'; selection: Selection }
  | { type: 'setView'; view: View }
  | { type: 'set'; patch: Partial<Pick<UiState, 'grid' | 'snap' | 'barStart' | 'scale' | 'showValues'>> };

const HISTORY = 200;

export function initialState(model: Model): UiState {
  return {
    model,
    past: [],
    future: [],
    tool: 'select',
    selection: null,
    view: 'model',
    grid: 0.5,
    snap: true,
    barStart: null,
    scale: 1,
    showValues: true,
  };
}

function exists(m: Model, sel: Selection): boolean {
  if (!sel) return true;
  return sel.kind === 'node' ? m.nodes.some((n) => n.id === sel.id) : m.members.some((k) => k.id === sel.id);
}

function withModel(s: UiState, model: Model): UiState {
  return {
    ...s,
    model,
    selection: exists(model, s.selection) ? s.selection : null,
    barStart: s.barStart && model.nodes.some((n) => n.id === s.barStart) ? s.barStart : null,
  };
}

export function reducer(s: UiState, a: Action): UiState {
  switch (a.type) {
    case 'apply': {
      const next = a.fn(s.model);
      if (next === s.model) return s;
      const out = withModel({ ...s, past: [...s.past, s.model].slice(-HISTORY), future: [] }, next);
      return a.select !== undefined ? { ...out, selection: exists(next, a.select) ? a.select : null } : out;
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
      return { ...s, model: a.model, past: [], future: [], selection: null, barStart: null };
    case 'setTool':
      return { ...s, tool: a.tool, barStart: null };
    case 'select':
      return { ...s, selection: a.selection };
    case 'setView':
      return { ...s, view: a.view };
    case 'set':
      return { ...s, ...a.patch };
  }
}
