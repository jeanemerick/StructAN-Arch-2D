import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Issue, Model } from '../model/types';
import { addArc, addArcBetween, deleteMember, deleteNode, duplicate, emptyModel, placeNode, suggestOffset } from '../model/ops';
import { parseModel, serialize } from '../model/io';
import { examples } from '../model/examples';
import { analyze, type Analysis } from '../solver/analyze';
import { initialState, reducer, selCount, singleSelected, type NodeMode, type Selection, type Tool } from './state';
import { Canvas } from './Canvas';
import { TopBar, ToolPanel } from './Toolbar';
import { StatusBar } from './StatusBar';
import { NodePanel } from './panels/NodePanel';
import { MemberPanel } from './panels/MemberPanel';
import { SectionsPanel } from './panels/SectionsPanel';
import { NewArcForm, defaultDraft, draftPreview, pickPoint, type ArcDraft } from './panels/ArcForm';
import { type Pt } from './geometry';
import { pngBlob, stationsCsv } from './export';
import { saveFile, warmUpSaver } from './saver';
import { hotkeyTarget } from './hotkeys';
import { Field, FormScope, NumField } from './widgets';

const STORAGE_KEY = 'structan-arch-2d:modelo';
const START_EXAMPLE = 'arco-parabolico-biarticulado';

function loadInitial(): { model: Model; example: string | null } {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t) {
      const r = parseModel(t);
      if (r.ok) return { model: r.model, example: null };
    }
  } catch {
    /* armazenamento indisponível */
  }
  const ex = examples.find((e) => e.slug === START_EXAMPLE)!;
  return { model: ex.build(), example: ex.name };
}

const INITIAL = loadInitial();

function safeAnalyze(m: Model): Analysis {
  try {
    return analyze(m);
  } catch (e) {
    return { ok: false, issues: [{ severity: 'error', message: `Erro interno na análise: ${(e as Error).message}` }] };
  }
}

type SideTab = 'props' | 'sections';

/** Pedido de confirmação mostrado na própria página (sem confirm do navegador). */
interface Confirm {
  message: string;
  action: () => void;
}

function NodeCoordsForm({ pt, setPt, onCreate, onCancel }: { pt: Pt; setPt(p: Pt): void; onCreate(): void; onCancel(): void }) {
  const xRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    xRef.current?.focus();
    xRef.current?.select();
  }, []);
  const create = () => {
    onCreate();
    // foco volta ao X para o próximo nó
    setTimeout(() => {
      xRef.current?.focus();
      xRef.current?.select();
    }, 0);
  };
  return (
    <FormScope onSubmit={create} onCancel={onCancel} testid="node-coords-form">
      <h3>Nó por coordenadas</h3>
      <p className="help">Digite X e Y e tecle Enter. Um clique no desenho também preenche os campos. Sobre uma barra ou arco, o nó já nasce ligado a ele; sobre um nó existente, ele é selecionado.</p>
      <div className="grid2">
        <Field label="X">
          <NumField value={pt.x} unit="m" testid="coord-x" inputRef={xRef} onCommit={(x) => setPt({ ...pt, x })} />
        </Field>
        <Field label="Y">
          <NumField value={pt.y} unit="m" testid="coord-y" onCommit={(y) => setPt({ ...pt, y })} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" data-testid="coord-create" onClick={create}>
          Criar nó
        </button>
        <button className="btn outline" onClick={onCancel}>
          Fechar
        </button>
      </div>
    </FormScope>
  );
}

function DuplicateForm({ offset, setOffset, count, onApply, onCancel }: { offset: Pt; setOffset(p: Pt): void; count: string; onApply(): void; onCancel(): void }) {
  const xRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    xRef.current?.focus();
    xRef.current?.select();
  }, []);
  return (
    <FormScope onSubmit={onApply} onCancel={onCancel} testid="duplicate-form">
      <h3>Duplicar seleção</h3>
      <p className="help">
        Copia {count} com apoios, cargas, rótulas, tipos, seções e temperatura. O deslocamento sugerido deixa folga para os diagramas das duas não se sobreporem.
      </p>
      <div className="grid2">
        <Field label="Deslocamento ΔX">
          <NumField value={offset.x} unit="m" testid="dup-dx" inputRef={xRef} onCommit={(x) => setOffset({ ...offset, x })} />
        </Field>
        <Field label="ΔY">
          <NumField value={offset.y} unit="m" testid="dup-dy" onCommit={(y) => setOffset({ ...offset, y })} />
        </Field>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" data-testid="dup-apply" onClick={onApply}>
          Duplicar
        </button>
        <button className="btn outline" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <p className="help">Enter confirma; Esc cancela. Ctrl+Z desfaz a cópia inteira de uma vez.</p>
    </FormScope>
  );
}

function describeSelection(m: Model, s: Selection): string {
  const bars = s.members.filter((id) => m.members.find((k) => k.id === id)?.kind === 'bar').length;
  const arcs = s.members.length - bars;
  const parts: string[] = [];
  if (s.nodes.length) parts.push(`${s.nodes.length} ${s.nodes.length === 1 ? 'nó' : 'nós'}`);
  if (bars) parts.push(`${bars} ${bars === 1 ? 'barra' : 'barras'}`);
  if (arcs) parts.push(`${arcs} ${arcs === 1 ? 'arco' : 'arcos'}`);
  return parts.join(', ') || 'nada';
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(INITIAL.model));
  const [exampleName, setExampleName] = useState<string | null>(INITIAL.example);
  const { model } = state;
  const analysis = useMemo(() => safeAnalyze(model), [model]);
  const [fitKey, setFitKey] = useState(0);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [tab, setTab] = useState<SideTab>('props');
  const [draft, setDraft] = useState<ArcDraft>(() => defaultDraft(model.sections[0]?.id ?? 's1'));
  const [coordPt, setCoordPt] = useState<Pt>({ x: 0, y: 0 });
  const [dupOffset, setDupOffset] = useState<Pt | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // modelo como foi aberto (exemplo, arquivo ou Novo): se o atual for outro, há alterações a perder
  const cleanModel = useRef<Model | null>(INITIAL.example ? INITIAL.model : null);

  useEffect(() => warmUpSaver(), []);
  const save = async (name: string, blob: Blob) => setFileError(await saveFile(name, blob));

  // gravação automática no navegador
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serialize(model));
      } catch {
        /* armazenamento indisponível */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [model]);

  const setTool = (tool: Tool, nodeMode?: NodeMode) => {
    dispatch({ type: 'setTool', tool, nodeMode });
    setDupOffset(null);
    if (tool === 'arc' || tool === 'node') setTab('props');
    if (tool === 'arc' && !model.sections.some((s) => s.id === draft.sectionId)) setDraft({ ...draft, sectionId: model.sections[0].id });
  };

  const loadModel = (m: Model, example: string | null = null) => {
    setExampleName(example);
    cleanModel.current = m;
    dispatch({ type: 'load', model: m });
    dispatch({ type: 'setTool', tool: 'select' });
    setDupOffset(null);
    setFitKey((k) => k + 1);
  };

  /** Executa `action` direto, ou depois de confirmar quando há alterações que seriam perdidas. */
  const guard = (message: string, action: () => void) => {
    const dirty = model.nodes.length > 0 && model !== cleanModel.current;
    if (dirty) setConfirm({ message, action });
    else action();
  };

  const openDuplicate = () => {
    if (selCount(state.selection) === 0) return;
    const o = suggestOffset(model, state.selection, state.grid);
    setDupOffset({ x: o.dx, y: o.dy });
    setTab('props');
  };

  const applyDuplicate = () => {
    if (!dupOffset) return;
    const d = duplicate(model, state.selection, dupOffset.x, dupOffset.y);
    dispatch({ type: 'apply', fn: () => d.model, select: d.selection });
    setDupOffset(null);
    setFitKey((k) => k + 1);
  };

  const nodeCoords = state.tool === 'node' && state.nodeMode === 'coords';
  const arcPicking = state.tool === 'arc' && draft.mode === 'nodes';

  // atalhos de teclado
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const scope = hotkeyTarget(e.target as HTMLInputElement | null);
      if (scope === 'text') return;
      const s = stateRef.current;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          dispatch({ type: 'undo' });
        } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          dispatch({ type: 'redo' });
        } else if (k === 'a') {
          e.preventDefault();
          dispatch({ type: 'selectAll' });
        } else if (k === 'd') {
          e.preventDefault();
          openDuplicate();
        }
        return;
      }
      if (e.key === 'Escape') {
        // ordem: barra em construção; formulário aberto; vista de resultado; seleção
        if (confirm) setConfirm(null);
        else if (s.barStart) dispatch({ type: 'set', patch: { barStart: null } });
        else if (dupOffset) setDupOffset(null);
        else if (s.tool === 'arc' || (s.tool === 'node' && s.nodeMode === 'coords')) dispatch({ type: 'setTool', tool: 'select' });
        else if (s.view !== 'model') dispatch({ type: 'setView', view: 'model' });
        else dispatch({ type: 'select', selection: null });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selCount(s.selection) === 0) return;
        e.preventDefault();
        const sel = s.selection;
        dispatch({
          type: 'apply',
          fn: (m) => {
            let out = m;
            for (const id of sel.members) out = deleteMember(out, id);
            for (const id of sel.nodes) out = deleteNode(out, id);
            return out;
          },
        });
      } else if (!e.altKey && scope !== 'select') {
        const map: Record<string, Tool> = { v: 'select', n: 'node', b: 'bar', a: 'arc' };
        const tool = map[e.key.toLowerCase()];
        if (tool) setTool(tool);
        if (e.key.toLowerCase() === 'f') setFitKey((k) => k + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const draftLine = useMemo(() => (state.tool === 'arc' ? draftPreview(draft) : null), [state.tool, draft]);

  const onIssue = (i: Issue) => {
    if (i.target) {
      dispatch({ type: 'setTool', tool: 'select' });
      dispatch({ type: 'select', selection: i.target });
      setTab('props');
    }
  };

  const single = singleSelected(state.selection);
  const selNode = single?.kind === 'node' ? model.nodes.find((n) => n.id === single.id) : undefined;
  const selMember = single?.kind === 'member' ? model.members.find((k) => k.id === single.id) : undefined;
  const nSel = selCount(state.selection);

  let props: ReactNode;
  if (state.tool === 'arc') {
    props = (
      <NewArcForm
        draft={draft}
        setDraft={setDraft}
        sections={model.sections}
        onCancel={() => setTool('select')}
        onSubmit={(d) => {
          const r =
            d.mode === 'nodes'
              ? addArcBetween(model, { pi: d.pi!, pj: d.pj!, shape: d.shape, rise: d.rise, nSeg: d.nSeg, sectionId: d.sectionId })
              : addArc(model, { expr: d.expr, xi: d.xi, xj: d.xj, nSeg: d.nSeg, sectionId: d.sectionId });
          if ('error' in r) return r.error;
          dispatch({ type: 'apply', fn: () => r.model, select: { kind: 'member', id: r.id } });
          dispatch({ type: 'setTool', tool: 'select' });
          setDraft({ ...d, pi: null, pj: null });
          return null;
        }}
      />
    );
  } else if (nodeCoords) {
    props = (
      <NodeCoordsForm
        pt={coordPt}
        setPt={setCoordPt}
        onCancel={() => setTool('select')}
        onCreate={() => {
          const r = placeNode(model, coordPt.x, coordPt.y);
          dispatch({ type: 'apply', fn: () => r.model, select: { kind: 'node', id: r.id } });
        }}
      />
    );
  } else if (dupOffset) {
    props = <DuplicateForm offset={dupOffset} setOffset={setDupOffset} count={describeSelection(model, state.selection)} onApply={applyDuplicate} onCancel={() => setDupOffset(null)} />;
  } else if (selNode) {
    props = <NodePanel key={selNode.id} node={selNode} model={model} dispatch={dispatch} />;
  } else if (selMember) {
    props = <MemberPanel key={selMember.id} member={selMember} model={model} dispatch={dispatch} />;
  } else if (nSel > 1) {
    props = (
      <div data-testid="multi-panel">
        <h3>Seleção</h3>
        <p className="help">{describeSelection(model, state.selection)} selecionados. Shift+clique soma ou retira itens; Esc limpa a seleção.</p>
        <div className="row">
          <button className="btn primary" data-testid="multi-duplicate" onClick={openDuplicate}>
            Duplicar… (Ctrl+D)
          </button>
          <button
            className="btn outline danger"
            onClick={() => {
              const sel = state.selection;
              dispatch({
                type: 'apply',
                fn: (m) => {
                  let out = m;
                  for (const id of sel.members) out = deleteMember(out, id);
                  for (const id of sel.nodes) out = deleteNode(out, id);
                  return out;
                },
              });
            }}
          >
            Excluir seleção
          </button>
        </div>
      </div>
    );
  } else {
    props = (
      <div>
        <h3>Como montar o modelo</h3>
        <p className="help">
          1. <b>Barra</b>: clique no ponto inicial e no final (a grade ajuda a acertar as coordenadas).
          <br />
          2. <b>Arco</b>: escolha os dois nós das nascenças, a altura do arco e a forma (parábola, circular ou catenária); a equação y = f(x) livre fica como opção avançada.
          <br />
          3. <b>Selecionar</b>: clique num nó para definir apoio e cargas; numa barra para tipo, seção, rótulas, cargas e temperatura. Arraste para selecionar vários itens.
          <br />
          4. Veja reações, N, Q, M e deformada nas abas sob o desenho.
        </p>
        {exampleName && (
          <p className="help" data-testid="example-note">
            <b>Modelo de exemplo:</b> {exampleName}. Altere à vontade ou clique em Novo para começar do zero.
          </p>
        )}
        <p className="help">
          Modelo atual: {model.nodes.length} nós, {model.members.filter((k) => k.kind === 'bar').length} barras, {model.members.filter((k) => k.kind === 'arc').length} arcos.
        </p>
        <p className="help">Atalhos: V selecionar · N nó · B barra · A arco · F enquadrar · Del excluir · Ctrl+A tudo · Ctrl+D duplicar · Ctrl+Z desfazer · Esc volta.</p>
      </div>
    );
  }

  const pick = arcPicking ? (p: Pt) => setDraft((d) => pickPoint(d, p)) : nodeCoords ? (p: Pt) => setCoordPt(p) : undefined;
  const marks = arcPicking ? [draft.pi, draft.pj].filter((p): p is Pt => !!p) : nodeCoords ? [coordPt] : undefined;
  const hintText = arcPicking
    ? draft.pi && Number.isFinite(draft.pi.x) && !draft.pj
      ? 'Clique no nó final do arco · Esc fecha'
      : 'Clique no nó inicial do arco · Esc fecha'
    : nodeCoords
      ? 'Digite as coordenadas no painel (ou clique para preencher) · Enter cria o nó'
      : undefined;

  return (
    <div className="app">
      <TopBar
        onNew={() => guard('Começar um modelo novo? As alterações do modelo atual serão perdidas (salve antes, se quiser guardá-las).', () => loadModel(emptyModel()))}
        onOpen={() => fileRef.current?.click()}
        onSave={() => {
          cleanModel.current = model;
          void save('structan-arch-2d-modelo.json', new Blob([serialize(model)], { type: 'application/json' }));
        }}
        onExample={(slug) => {
          const ex = examples.find((e) => e.slug === slug)!;
          guard(`Abrir o exemplo "${ex.name}"? As alterações do modelo atual serão perdidas (salve antes, se quiser guardá-las).`, () => loadModel(ex.build(), ex.name));
        }}
        onExportPng={() => {
          const svg = svgRef.current;
          if (!svg) return;
          const name = `structan-arch-2d-${state.view}.png`;
          void pngBlob(svg).then((blob) => (blob ? save(name, blob) : setFileError('Não foi possível gerar a imagem neste navegador.')));
        }}
        onExportCsv={() => {
          if (!analysis.ok) {
            setFileError('A tabela de resultados só pode ser exportada com a análise concluída. Corrija o modelo e tente de novo.');
            return;
          }
          void save('structan-arch-2d-resultados.csv', new Blob([stationsCsv(model, analysis)], { type: 'text/csv;charset=utf-8' }));
        }}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
      />
      <input
        ref={fileRef}
        type="file"
        id="file-input"
        accept=".json,application/json"
        style={{ display: 'none' }}
        data-testid="file-input"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = parseModel(await f.text());
          if (r.ok) {
            setFileError(null);
            guard(`Abrir "${f.name}"? As alterações do modelo atual serão perdidas (salve antes, se quiser guardá-las).`, () => loadModel(r.model));
          } else setFileError(`Não foi possível abrir "${f.name}": ${r.error}`);
        }}
      />
      <ToolPanel
        tool={state.tool}
        setTool={setTool}
        nodeMode={state.nodeMode}
        grid={state.grid}
        setGrid={(grid) => dispatch({ type: 'set', patch: { grid } })}
        snap={state.snap}
        setSnap={(snap) => dispatch({ type: 'set', patch: { snap } })}
        onFit={() => setFitKey((k) => k + 1)}
        canDuplicate={nSel > 0}
        onDuplicate={openDuplicate}
      />
      <Canvas
        state={state}
        dispatch={dispatch}
        analysis={analysis}
        fitKey={fitKey}
        draftArc={draftLine}
        svgRef={svgRef}
        onCursor={setCursor}
        pick={pick}
        marks={marks}
        hintText={hintText}
      />
      <aside className="side">
        <div className="side-tabs">
          <button className={tab === 'props' ? 'active' : ''} onClick={() => setTab('props')} data-testid="side-props">
            Propriedades
          </button>
          <button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')} data-testid="side-sections">
            Seções
          </button>
        </div>
        <div className="side-body">
          {confirm && (
            <div className="notice confirm" role="alertdialog" data-testid="confirm">
              <span>{confirm.message}</span>
              <div className="row">
                <button
                  className="btn primary"
                  data-testid="confirm-yes"
                  onClick={() => {
                    const a = confirm.action;
                    setConfirm(null);
                    a();
                  }}
                >
                  Continuar
                </button>
                <button className="btn outline" data-testid="confirm-no" onClick={() => setConfirm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {fileError && (
            <div className="notice" role="status" data-testid="notice">
              <span>{fileError}</span>
              <button className="btn outline" onClick={() => setFileError(null)}>
                Fechar
              </button>
            </div>
          )}
          {tab === 'props' && props}
          {tab === 'sections' && <SectionsPanel model={model} dispatch={dispatch} />}
        </div>
      </aside>
      <StatusBar
        view={state.view}
        setView={(view) => dispatch({ type: 'setView', view })}
        scale={state.scale}
        setScale={(scale) => dispatch({ type: 'set', patch: { scale } })}
        showValues={state.showValues}
        setShowValues={(showValues) => dispatch({ type: 'set', patch: { showValues } })}
        showReactions={state.showReactions}
        setShowReactions={(showReactions) => dispatch({ type: 'set', patch: { showReactions } })}
        loadsOnAxis={state.loadsOnAxis}
        setLoadsOnAxis={(loadsOnAxis) => dispatch({ type: 'set', patch: { loadsOnAxis } })}
        cursor={cursor}
        analysis={analysis}
        onIssue={onIssue}
      />
    </div>
  );
}

