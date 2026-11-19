import { useMemo, type Dispatch } from 'react';
import type { Model } from '../../model/types';
import type { Analysis } from '../../solver/analyze';
import { extremes, memberStations } from '../../solver/diagrams';
import type { Action } from '../state';
import { formatValue } from '../format';

export function ResultsTable({ model, analysis, dispatch }: { model: Model; analysis: Analysis; dispatch: Dispatch<Action> }) {
  const rows = useMemo(() => {
    if (!analysis.ok) return [];
    return model.members.map((k) => ({ id: k.id, kind: k.kind, ex: extremes(memberStations(model, analysis, k.id, 40)) }));
  }, [model, analysis]);

  if (!analysis.ok) {
    return (
      <div data-testid="results-table">
        <h3>Resultados</h3>
        <p className="help">A análise não foi concluída. Corrija os itens abaixo:</p>
        {analysis.issues.map((i, k) => (
          <div key={k} className="err">
            • {i.message}
          </div>
        ))}
      </div>
    );
  }
  const sel = (kind: 'node' | 'member', id: string) => dispatch({ type: 'select', selection: { kind, id } });
  return (
    <div data-testid="results-table">
      <h3>Reações de apoio</h3>
      <table className="res">
        <thead>
          <tr>
            <th>Nó</th>
            <th>Fx (kN)</th>
            <th>Fy (kN)</th>
            <th>Mz (kN·m)</th>
          </tr>
        </thead>
        <tbody>
          {analysis.reactions.map((r) => (
            <tr key={r.nodeId} className="clickable" onClick={() => sel('node', r.nodeId)}>
              <td>{r.nodeId}</td>
              <td data-testid={`reaction-${r.nodeId}-fx`}>{formatValue(r.fx)}</td>
              <td data-testid={`reaction-${r.nodeId}-fy`}>{formatValue(r.fy)}</td>
              <td data-testid={`reaction-${r.nodeId}-mz`}>{formatValue(r.mz)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Esforços extremos por barra</h4>
      <table className="res">
        <thead>
          <tr>
            <th>Barra</th>
            <th>N mín/máx</th>
            <th>Q mín/máx</th>
            <th>M mín/máx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => sel('member', r.id)}>
              <td>
                {r.kind === 'arc' ? 'Arco' : 'Barra'} {r.id}
              </td>
              <td>
                {formatValue(r.ex.N[0])} / {formatValue(r.ex.N[1])}
              </td>
              <td>
                {formatValue(r.ex.Q[0])} / {formatValue(r.ex.Q[1])}
              </td>
              <td>
                {formatValue(r.ex.M[0])} / {formatValue(r.ex.M[1])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="help">N em kN (tração +), Q em kN, M em kN·m (+ traciona o lado de baixo / interno do arco).</p>

      <h4>Deslocamento máximo</h4>
      <table className="res">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {r.kind === 'arc' ? 'Arco' : 'Barra'} {r.id}
              </td>
              <td>{formatValue(r.ex.disp * 1000)} mm</td>
            </tr>
          ))}
        </tbody>
      </table>
      {analysis.warnings.map((w, k) => (
        <p key={k} className="help status-warn">
          ⚠ {w.message}
        </p>
      ))}
    </div>
  );
}
