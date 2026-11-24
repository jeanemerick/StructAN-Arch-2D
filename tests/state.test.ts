import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../src/ui/state';
import { addNode, deleteNode, emptyModel } from '../src/model/ops';
import type { Model } from '../src/model/types';

const addAt = (x: number, y: number) => (m: Model) => addNode(m, x, y).model;

describe('reducer', () => {
  it('apply empilha o modelo anterior em past e limpa future', () => {
    let s = initialState(emptyModel());
    s = reducer(s, { type: 'apply', fn: addAt(0, 0) });
    s = reducer(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = reducer(s, { type: 'apply', fn: addAt(1, 0) });
    expect(s.past).toHaveLength(1);
    expect(s.future).toHaveLength(0);
    expect(s.model.nodes).toHaveLength(1);
    expect(s.model.nodes[0].x).toBe(1);
  });

  it('undo e redo restauram os modelos', () => {
    let s = initialState(emptyModel());
    s = reducer(s, { type: 'apply', fn: addAt(0, 0) });
    s = reducer(s, { type: 'apply', fn: addAt(2, 0) });
    s = reducer(s, { type: 'undo' });
    expect(s.model.nodes).toHaveLength(1);
    s = reducer(s, { type: 'undo' });
    expect(s.model.nodes).toHaveLength(0);
    s = reducer(s, { type: 'undo' });
    expect(s.model.nodes).toHaveLength(0);
    s = reducer(s, { type: 'redo' });
    s = reducer(s, { type: 'redo' });
    expect(s.model.nodes).toHaveLength(2);
  });

  it('apply que não muda o modelo não cria histórico', () => {
    let s = initialState(emptyModel());
    s = reducer(s, { type: 'apply', fn: (m) => m });
    expect(s.past).toHaveLength(0);
  });

  it('load limpa histórico, seleção e barra em construção', () => {
    let s = initialState(emptyModel());
    s = reducer(s, { type: 'apply', fn: addAt(0, 0) });
    s = reducer(s, { type: 'select', selection: { kind: 'node', id: 'n1' } });
    s = reducer(s, { type: 'set', patch: { barStart: 'n1' } });
    s = reducer(s, { type: 'load', model: emptyModel() });
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
    expect(s.selection).toEqual({ nodes: [], members: [] });
    expect(s.barStart).toBeNull();
  });

  it('apply que remove o item selecionado limpa a seleção', () => {
    let s = initialState(emptyModel());
    s = reducer(s, { type: 'apply', fn: addAt(0, 0) });
    s = reducer(s, { type: 'select', selection: { kind: 'node', id: 'n1' } });
    s = reducer(s, { type: 'apply', fn: (m) => deleteNode(m, 'n1') });
    expect(s.selection).toEqual({ nodes: [], members: [] });
  });

  it('trocar de ferramenta cancela a barra em construção', () => {
    let s = initialState(emptyModel());
    s = reducer(s, { type: 'set', patch: { barStart: 'n1' } });
    s = reducer(s, { type: 'setTool', tool: 'select' });
    expect(s.barStart).toBeNull();
    expect(s.tool).toBe('select');
  });

  it('o histórico guarda no máximo 200 passos', () => {
    let s = initialState(emptyModel());
    for (let i = 0; i < 230; i++) s = reducer(s, { type: 'apply', fn: addAt(i, 0) });
    expect(s.past.length).toBe(200);
  });
});
