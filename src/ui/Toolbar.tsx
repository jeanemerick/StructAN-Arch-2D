import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tool } from './state';
import { examples } from '../model/examples';

function Menu({ label, children, testid }: { label: string; children: (close: () => void) => ReactNode; testid?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
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
      <div className="spacer" />
      <button className="btn" disabled={!p.canUndo} onClick={p.onUndo} title="Desfazer (Ctrl+Z)" data-testid="undo">
        ↶ Desfazer
      </button>
      <button className="btn" disabled={!p.canRedo} onClick={p.onRedo} title="Refazer (Ctrl+Y)" data-testid="redo">
        ↷ Refazer
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

export function ToolPanel({
  tool,
  setTool,
  grid,
  setGrid,
  snap,
  setSnap,
  onFit,
}: {
  tool: Tool;
  setTool(t: Tool): void;
  grid: number;
  setGrid(g: number): void;
  snap: boolean;
  setSnap(s: boolean): void;
  onFit(): void;
}) {
  return (
    <nav className="tools">
      {(Object.keys(LABEL) as Tool[]).map((t) => (
        <button key={t} className={`tool${tool === t ? ' active' : ''}`} data-testid={`tool-${t}`} title={`${LABEL[t]} (${KEY[t]})`} onClick={() => setTool(t)}>
          {ICONS[t]}
          {LABEL[t]}
        </button>
      ))}
      <hr />
      <label htmlFor="grid-sel">Grade (m)</label>
      <select id="grid-sel" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
        {[0.1, 0.25, 0.5, 1].map((g) => (
          <option key={g} value={g}>
            {String(g).replace('.', ',')}
          </option>
        ))}
      </select>
      <label className="check" style={{ justifyContent: 'center' }}>
        <input type="checkbox" id="snap-toggle" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        Snap
      </label>
      <hr />
      <button className="tool" onClick={onFit} title="Enquadrar o modelo (F)" data-testid="fit">
        <svg viewBox="0 0 24 24">
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Enquadrar
      </button>
    </nav>
  );
}
