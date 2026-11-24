import { useEffect, useState } from 'react';
import type { Issue } from '../model/types';
import type { Analysis } from '../solver/analyze';
import type { View } from './state';
import type { Pt } from './geometry';
import { formatNumber } from './format';

const VIEWS: { v: View; label: string }[] = [
  { v: 'model', label: 'Modelo' },
  { v: 'reactions', label: 'Reações' },
  { v: 'N', label: 'Normal N' },
  { v: 'Q', label: 'Cortante Q' },
  { v: 'M', label: 'Momento M' },
  { v: 'deformed', label: 'Deformada' },
];

interface Props {
  view: View;
  setView(v: View): void;
  scale: number;
  setScale(s: number): void;
  showValues: boolean;
  setShowValues(b: boolean): void;
  showReactions: boolean;
  setShowReactions(b: boolean): void;
  loadsOnAxis: boolean;
  setLoadsOnAxis(b: boolean): void;
  cursor: Pt | null;
  analysis: Analysis;
  onIssue(i: Issue): void;
}

export function StatusBar(p: Props) {
  const { view, setView, scale, setScale, showValues, setShowValues, cursor, analysis, onIssue } = p;
  const [listOpen, setListOpen] = useState(false);
  const issues: Issue[] = analysis.ok ? analysis.warnings : analysis.issues;
  const first = issues[0];
  const effort = view === 'N' || view === 'Q' || view === 'M';
  useEffect(() => setListOpen(false), [analysis]);
  return (
    <footer className="bottombar">
      <div className="viewbar">
        {VIEWS.map(({ v, label }) => (
          <button key={v} className={`viewtab${view === v ? ' active' : ''}`} data-testid={`tab-${v}`} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
        <div className="spacer" />
        {view !== 'model' && view !== 'reactions' && (
          <label className="check" title="Escala do desenho">
            Escala
            <input
              type="range"
              id="scale-range"
              min={-2}
              max={2}
              step={0.05}
              value={Math.log2(scale)}
              onChange={(e) => setScale(2 ** Number(e.target.value))}
              data-testid="scale"
            />
          </label>
        )}
        {effort && (
          <label className="check" title="Setas e valores das reações de apoio junto do diagrama">
            <input type="checkbox" id="show-reactions" data-testid="show-reactions" checked={p.showReactions} onChange={(e) => p.setShowReactions(e.target.checked)} />
            Reações
          </label>
        )}
        {view === 'model' && (
          <label className="check" title="Desenha as cargas distribuídas sobre o eixo das barras, em vez de faixas retas">
            <input type="checkbox" id="loads-on-axis" data-testid="loads-on-axis" checked={p.loadsOnAxis} onChange={(e) => p.setLoadsOnAxis(e.target.checked)} />
            Cargas sobre o eixo
          </label>
        )}
        <label className="check">
          <input type="checkbox" id="show-values" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
          Valores
        </label>
      </div>
      <div className="statusline">
        <span style={{ minWidth: 190 }} data-testid="cursor-pos">
          {cursor ? `x: ${formatNumber(cursor.x, 3)} m   y: ${formatNumber(cursor.y, 3)} m` : ' '}
        </span>
        {analysis.ok ? (
          <span className="status ok" data-testid="status">
            <span className="dot" />
            Análise concluída
          </span>
        ) : (
          <button className="status error" data-testid="status" onClick={() => first && onIssue(first)} title="Clique para selecionar o item">
            <span className="dot" />
            {first?.message}
          </button>
        )}
        {analysis.ok && issues.length > 0 && (
          <button className="status status-warn" data-testid="warning" onClick={() => onIssue(first)} title="Clique para selecionar o item">
            ⚠ {first.message}
          </button>
        )}
        {(analysis.ok ? issues.length > 0 : issues.length > 1) && (
          <div className="issues-wrap">
            <button className="btn outline small" data-testid="issues-toggle" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
              {analysis.ok ? `${issues.length} aviso${issues.length > 1 ? 's' : ''}` : `${issues.length} erros`} ▴
            </button>
            {listOpen && (
              <div className="issues-list" role="list" data-testid="issues-list">
                {issues.map((i, k) => (
                  <button
                    key={k}
                    role="listitem"
                    className={i.severity === 'error' ? 'issue error' : 'issue warn'}
                    onClick={() => {
                      setListOpen(false);
                      onIssue(i);
                    }}
                  >
                    {i.severity === 'error' ? '✕' : '⚠'} {i.message}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
