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
  cursor: Pt | null;
  analysis: Analysis;
  onIssue(i: Issue): void;
}

export function StatusBar({ view, setView, scale, setScale, showValues, setShowValues, cursor, analysis, onIssue }: Props) {
  const first = analysis.ok ? null : analysis.issues[0];
  const warnings = analysis.ok ? analysis.warnings.length : 0;
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
        <label className="check">
          <input type="checkbox" id="show-values" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
          Valores
        </label>
      </div>
      <div className="statusline">
        <span style={{ minWidth: 170 }}>{cursor ? `x: ${formatNumber(cursor.x, 2)} m   y: ${formatNumber(cursor.y, 2)} m` : ' '}</span>
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
        {analysis.ok && warnings > 0 && (
          <button className="status status-warn" data-testid="warning" style={{ cursor: 'pointer' }} onClick={() => onIssue(analysis.warnings[0])} title="Clique para selecionar o item">
            ⚠ {analysis.warnings[0].message}
            {warnings > 1 ? ` (+${warnings - 1} aviso${warnings > 2 ? 's' : ''} na aba Resultados)` : ''}
          </button>
        )}
      </div>
    </footer>
  );
}
