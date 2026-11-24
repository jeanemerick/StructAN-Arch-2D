import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { NodeMode, Tool } from './state';
import { NumField } from './widgets';
import { examples } from '../model/examples';

/** Fecha um menu aberto com clique fora dele ou com Esc (o Esc não passa adiante). */
function useCloseOnOutside(open: boolean, ref: React.RefObject<HTMLElement>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Menu({ label, children, testid }: { label: string; children: (close: () => void) => ReactNode; testid?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnOutside(open, ref, () => setOpen(false));
  return (
    <div className="menu" ref={ref}>
      <button className="btn" data-testid={testid} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && <div className="menu-list">{children(() => setOpen(false))}</div>}
    </div>
  );
}

interface TopProps {
  onNew(): void;
  onOpen(): void;
  onSave(): void;
  onExample(slug: string): void;
  onExportPng(): void;
  onExportCsv(): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onHelp(): void;
}

export function TopBar(p: TopProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 19 Q12 1 21 19" fill="none" stroke="var(--accent)" strokeWidth="2.4" />
          <line x1="2" y1="19.5" x2="22" y2="19.5" stroke="var(--ink)" strokeWidth="1.6" />
        </svg>
        StructAN-Arch-2D <small>análise estrutural</small>
      </div>
      <button className="btn" onClick={p.onNew} data-testid="file-new">
        Novo
      </button>
      <button className="btn" onClick={p.onOpen} data-testid="file-open">
        Abrir
      </button>
      <button className="btn" onClick={p.onSave} data-testid="file-save">
        Salvar
      </button>
      <Menu label="Exemplos" testid="examples-menu">
        {(close) =>
          examples.map((e) => (
            <button
              key={e.slug}
              data-testid={`example-${e.slug}`}
              onClick={() => {
                close();
                p.onExample(e.slug);
              }}
            >
              {e.name}
            </button>
          ))
        }
      </Menu>
      <Menu label="Exportar" testid="export-menu">
        {(close) => (
          <>
            <button
              data-testid="export-png"
              onClick={() => {
                close();
                p.onExportPng();
              }}
            >
              Imagem da vista atual (PNG)
            </button>
            <button
              data-testid="export-csv"
              onClick={() => {
                close();
                p.onExportCsv();
              }}
            >
              Esforços e deslocamentos (CSV)
            </button>
          </>
        )}
      </Menu>
      <button className="btn" onClick={p.onHelp} data-testid="help-open" title="Manual do programa (F1)">
        Ajuda
      </button>
      <div className="spacer" />
      <button className="btn" disabled={!p.canUndo} onClick={p.onUndo} title="Desfazer (Ctrl+Z)" data-testid="undo">
        ↶<span className="lbl-wide"> Desfazer</span>
      </button>
      <button className="btn" disabled={!p.canRedo} onClick={p.onRedo} title="Refazer (Ctrl+Y)" data-testid="redo">
        ↷<span className="lbl-wide"> Refazer</span>
      </button>
    </header>
  );
}

const ICONS: Record<Tool, ReactNode> = {
  select: (
    <svg viewBox="0 0 24 24">
      <path d="M5 3 L5 19 L9.5 14.5 L13 21 L15.5 20 L12 13.5 L18 13.5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  node: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  bar: (
    <svg viewBox="0 0 24 24">
      <line x1="5" y1="18" x2="19" y2="6" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="5" cy="18" r="2.6" fill="var(--panel)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="19" cy="6" r="2.6" fill="var(--panel)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  arc: (
    <svg viewBox="0 0 24 24">
      <path d="M3 19 Q12 1 21 19" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <text x="12" y="20" fontSize="7" textAnchor="middle" fill="currentColor">
        f(x)
      </text>
    </svg>
  ),
};

const LABEL: Record<Tool, string> = { select: 'Selecionar', node: 'Nó', bar: 'Barra', arc: 'Arco' };
const KEY: Record<Tool, string> = { select: 'V', node: 'N', bar: 'B', arc: 'A' };

const NODE_MODE_LABEL: Record<NodeMode, string> = { click: 'Clicar no desenho', coords: 'Informar coordenadas' };

export function ToolPanel({
  tool,
  setTool,
  nodeMode,
  grid,
  setGrid,
  snap,
  setSnap,
  onFit,
  canDuplicate,
  onDuplicate,
}: {
  tool: Tool;
  setTool(t: Tool, nodeMode?: NodeMode): void;
  nodeMode: NodeMode;
  grid: number;
  setGrid(g: number): void;
  snap: boolean;
  setSnap(s: boolean): void;
  onFit(): void;
  canDuplicate: boolean;
  onDuplicate(): void;
}) {
  const [nodeMenu, setNodeMenu] = useState<{ left: number; top: number } | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  useCloseOnOutside(!!nodeMenu, nodeRef, () => setNodeMenu(null));
  return (
    <nav className="tools">
      {(Object.keys(LABEL) as Tool[]).map((t) =>
        t === 'node' ? (
          <div key={t} className="tool-wrap" ref={nodeRef}>
            <button
              className={`tool${tool === t ? ' active' : ''}`}
              data-testid="tool-node"
              title={`${LABEL[t]} (${KEY[t]}): ${NODE_MODE_LABEL[nodeMode].toLowerCase()}`}
              aria-haspopup="menu"
              aria-expanded={!!nodeMenu}
              onClick={(e) => {
                // a lista fica fixa na tela, ao lado do botão (a coluna de ferramentas rola e cortaria a lista)
                const r = e.currentTarget.getBoundingClientRect();
                setNodeMenu((o) => (o ? null : { left: r.right + 6, top: r.top }));
              }}
            >
              {ICONS[t]}
              {LABEL[t]} ▾
            </button>
            {nodeMenu && (
              <div className="menu-list tool-menu" role="menu" style={{ position: 'fixed', left: nodeMenu.left, top: nodeMenu.top }}>
                {(Object.keys(NODE_MODE_LABEL) as NodeMode[]).map((mode) => (
                  <button
                    key={mode}
                    role="menuitem"
                    className={tool === 'node' && nodeMode === mode ? 'active' : ''}
                    data-testid={`node-mode-${mode}`}
                    onClick={() => {
                      setNodeMenu(null);
                      setTool('node', mode);
                    }}
                  >
                    {NODE_MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button key={t} className={`tool${tool === t ? ' active' : ''}`} data-testid={`tool-${t}`} title={`${LABEL[t]} (${KEY[t]})`} onClick={() => setTool(t)}>
            {ICONS[t]}
            {LABEL[t]}
          </button>
        ),
      )}
      <hr />
      <label htmlFor="grid-step">Grade (m)</label>
      <NumField value={grid} testid="grid-step" valid={(v) => v > 0} title="Passo da grade: qualquer valor positivo (0,01; 0,1; 2,5…)" onCommit={setGrid} />
      <label className="check" style={{ justifyContent: 'center' }}>
        <input type="checkbox" id="snap-toggle" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        Snap
      </label>
      <hr />
      <button className="tool" onClick={onDuplicate} disabled={!canDuplicate} title="Duplicar a seleção (Ctrl+D)" data-testid="duplicate">
        <svg viewBox="0 0 24 24">
          <rect x="4" y="8" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4H18.5A1.5 1.5 0 0 1 20 5.5V13.5A1.5 1.5 0 0 1 18.5 15H15" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        Duplicar
      </button>
      <button className="tool" onClick={onFit} title="Enquadrar o modelo (F)" data-testid="fit">
        <svg viewBox="0 0 24 24">
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Enquadrar
      </button>
    </nav>
  );
}
