import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Issue, Model } from '../model/types';
import { addArc, deleteMember, deleteNode, emptyModel } from '../model/ops';
import { parseModel, serialize } from '../model/io';
import { examples } from '../model/examples';
import { analyze, type Analysis } from '../solver/analyze';
import { initialState, reducer, type Tool } from './state';
import { Canvas } from './Canvas';
import { TopBar, ToolPanel } from './Toolbar';
import { StatusBar } from './StatusBar';
import { NodePanel } from './panels/NodePanel';
import { MemberPanel } from './panels/MemberPanel';
import { SectionsPanel } from './panels/SectionsPanel';
import { ResultsTable } from './panels/ResultsTable';
import { ArcFields, defaultDraft, draftError, type ArcDraft } from './panels/ArcForm';
import { curvePolyline, type Pt } from './geometry';
import { pngBlob, stationsCsv } from './export';
import { saveFile, warmUpSaver } from './saver';
import { hotkeyTarget } from './hotkeys';

const STORAGE_KEY = 'arcada:modelo';
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

type SideTab = 'props' | 'sections' | 'results';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(INITIAL.model));
  const [exampleName, setExampleName] = useState<string | null>(INITIAL.example);
  const { model } = state;
  const analysis = useMemo(() => safeAnalyze(model), [model]);
  const [fitKey, setFitKey] = useState(0);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [tab, setTab] = useState<SideTab>('props');
  const [draft, setDraft] = useState<ArcDraft>(() => defaultDraft(model.sections[0]?.id ?? 's1'));
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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

  const setTool = (tool: Tool) => {
    dispatch({ type: 'setTool', tool });
    if (tool === 'arc') {
      setTab('props');
      if (!model.sections.some((s) => s.id === draft.sectionId)) setDraft({ ...draft, sectionId: model.sections[0].id });
    }
  };

  const loadModel = (m: Model, example: string | null = null) => {
    setExampleName(example);
    dispatch({ type: 'load', model: m });
    dispatch({ type: 'setTool', tool: 'select' });
    setFitKey((k) => k + 1);
  };

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
        }
        return;
      }
      if (e.key === 'Escape') {
        if (s.barStart) dispatch({ type: 'set', patch: { barStart: null } });
        else dispatch({ type: 'select', selection: null });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = s.selection;
        if (!sel) return;
        e.preventDefault();
        dispatch({ type: 'apply', fn: (m) => (sel.kind === 'node' ? deleteNode(m, sel.id) : deleteMember(m, sel.id)) });
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

  const draftPreview = useMemo(() => {
    if (state.tool !== 'arc' || draftError(draft)) return null;
    return curvePolyline(draft.expr, draft.xi, draft.xj);
  }, [state.tool, draft]);

  const onIssue = (i: Issue) => {
    if (i.target) {
      dispatch({ type: 'setTool', tool: 'select' });
      dispatch({ type: 'select', selection: i.target });
      setTab('props');
    }
  };

  const selNode = state.selection?.kind === 'node' ? model.nodes.find((n) => n.id === state.selection!.id) : undefined;
  const selMember = state.selection?.kind === 'member' ? model.members.find((k) => k.id === state.selection!.id) : undefined;

  let props;
  if (state.tool === 'arc') {
    props = (
      <div data-testid="arc-form">
        <h3>Novo arco</h3>
        <p className="help">Escolha um modelo pronto (vão e flecha) ou escreva a equação y = f(x). A pré-visualização aparece tracejada no desenho.</p>
        <ArcFields
          draft={draft}
          setDraft={setDraft}
          sections={model.sections}
          submitLabel="Criar arco"
          onSubmit={(d) => {
            const r = addArc(model, { expr: d.expr, xi: d.xi, xj: d.xj, nSeg: d.nSeg, sectionId: d.sectionId });
            if ('error' in r) return r.error;
            dispatch({ type: 'apply', fn: () => r.model });
            dispatch({ type: 'setTool', tool: 'select' });
            dispatch({ type: 'select', selection: { kind: 'member', id: r.id } });
            return null;
          }}
        />
      </div>
    );
  } else if (selNode) {
    props = <NodePanel key={selNode.id} node={selNode} model={model} dispatch={dispatch} />;
  } else if (selMember) {
    props = <MemberPanel key={selMember.id} member={selMember} model={model} dispatch={dispatch} />;
  } else {
    props = (
      <div>
        <h3>Como montar o modelo</h3>
        <p className="help">
          1. <b>Barra</b>: clique no ponto inicial e no final (a grade ajuda a acertar as coordenadas).
          <br />
          2. <b>Arco</b>: defina a equação y = f(x) ou escolha parábola, círculo ou catenária pelo vão e flecha.
          <br />
          3. <b>Selecionar</b>: clique num nó para definir apoio e cargas; numa barra para seção, rótulas e cargas distribuídas.
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
        <p className="help">Atalhos: V selecionar · N nó · B barra · A arco · F enquadrar · Del excluir · Ctrl+Z desfazer.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar
        onNew={() => loadModel(emptyModel())}
        onOpen={() => fileRef.current?.click()}
        onSave={() => void save('arcada-modelo.json', new Blob([serialize(model)], { type: 'application/json' }))}
        onExample={(slug) => {
          const ex = examples.find((e) => e.slug === slug)!;
          loadModel(ex.build(), ex.name);
        }}
        onExportPng={() => {
          const svg = svgRef.current;
          if (!svg) return;
          const name = `arcada-${state.view}.png`;
          void pngBlob(svg).then((blob) => (blob ? save(name, blob) : setFileError('Não foi possível gerar a imagem neste navegador.')));
        }}
        onExportCsv={() => {
          if (!analysis.ok) {
            setFileError('A tabela de resultados só pode ser exportada com a análise concluída. Corrija o modelo e tente de novo.');
            return;
          }
          void save('arcada-resultados.csv', new Blob([stationsCsv(model, analysis)], { type: 'text/csv;charset=utf-8' }));
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
            loadModel(r.model);
          } else setFileError(`Não foi possível abrir "${f.name}": ${r.error}`);
        }}
      />
      <ToolPanel
        tool={state.tool}
        setTool={setTool}
        grid={state.grid}
        setGrid={(grid) => dispatch({ type: 'set', patch: { grid } })}
        snap={state.snap}
        setSnap={(snap) => dispatch({ type: 'set', patch: { snap } })}
        onFit={() => setFitKey((k) => k + 1)}
      />
      <Canvas state={state} dispatch={dispatch} analysis={analysis} fitKey={fitKey} draftArc={draftPreview} svgRef={svgRef} onCursor={setCursor} />
      <aside className="side">
        <div className="side-tabs">
          <button className={tab === 'props' ? 'active' : ''} onClick={() => setTab('props')} data-testid="side-props">
            Propriedades
          </button>
          <button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')} data-testid="side-sections">
            Seções
          </button>
          <button className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')} data-testid="side-results">
            Resultados
          </button>
        </div>
        <div className="side-body">
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
          {tab === 'results' && <ResultsTable model={model} analysis={analysis} dispatch={dispatch} />}
        </div>
      </aside>
      <StatusBar
        view={state.view}
        setView={(view) => dispatch({ type: 'setView', view })}
        scale={state.scale}
        setScale={(scale) => dispatch({ type: 'set', patch: { scale } })}
        showValues={state.showValues}
        setShowValues={(showValues) => dispatch({ type: 'set', patch: { showValues } })}
        cursor={cursor}
        analysis={analysis}
        onIssue={onIssue}
      />
    </div>
  );
}
