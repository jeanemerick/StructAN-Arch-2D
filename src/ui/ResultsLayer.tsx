import { useEffect, useMemo, type ReactNode } from 'react';
import type { Id, Model } from '../model/types';
import type { AnalysisOk } from '../solver/analyze';
import { memberStations, type Station } from '../solver/diagrams';
import type { View } from './state';
import { modelBounds, toScreen, type Pt, type ViewT } from './geometry';
import { Arrow, Label, MomentArrow } from './glyphs';
import { formatValue } from './format';
import { buildChains, chainShape } from './diagramShapes';

export interface HoverInfo {
  px: number;
  py: number;
  st: Station;
  label: string;
}

interface Props {
  model: Model;
  analysis: AnalysisOk;
  view: View;
  v: ViewT;
  scale: number;
  showValues: boolean;
  hoverPx: Pt | null;
  onHover(h: HoverInfo | null): void;
  /** Altura da área de desenho, para posicionar a legenda no canto inferior. */
  height: number;
}

type Effort = 'N' | 'Q' | 'M';

export function useStations(model: Model, analysis: AnalysisOk): Map<Id, Station[]> {
  return useMemo(() => {
    const map = new Map<Id, Station[]>();
    for (const k of model.members) map.set(k.id, memberStations(model, analysis, k.id, 40));
    return map;
  }, [model, analysis]);
}

export function diagramFactor(model: Model, stations: Map<Id, Station[]>, effort: Effort, scale: number): number {
  let maxAbs = 0;
  for (const st of stations.values()) for (const p of st) maxAbs = Math.max(maxAbs, Math.abs(p[effort]));
  const b = modelBounds(model);
  const D = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  return maxAbs > 1e-9 ? ((0.12 * D) / maxAbs) * scale : 0;
}

export function deformFactor(model: Model, stations: Map<Id, Station[]>, scale: number): number {
  let maxD = 0;
  for (const st of stations.values()) for (const p of st) maxD = Math.max(maxD, Math.hypot(p.dx, p.dy));
  const b = modelBounds(model);
  const D = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  return maxD > 1e-15 ? ((0.05 * D) / maxD) * scale : 0;
}

export function ResultsLayer({ model, analysis, view, v, scale, showValues, hoverPx, onHover, height }: Props) {
  const legendY = height - 16;
  const kindOf = new Map(model.members.map((k) => [k.id, k.kind === 'arc' ? 'Arco' : 'Barra']));
  const stations = useStations(model, analysis);

  useEffect(() => {
    if (!hoverPx || view === 'model') {
      onHover(null);
      return;
    }
    let best: HoverInfo | null = null;
    let bestD = 14;
    for (const [id, st] of stations) {
      for (const p of st) {
        const s = toScreen(v, p.x, p.y);
        const d = Math.hypot(s.x - hoverPx.x, s.y - hoverPx.y);
        if (d < bestD) {
          bestD = d;
          best = { px: s.x, py: s.y, st: p, label: `${kindOf.get(id) ?? 'Barra'} ${id}` };
        }
      }
    }
    onHover(best);
  }, [hoverPx?.x, hoverPx?.y, stations, v, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const out: ReactNode[] = [];

  if (view === 'N' || view === 'Q' || view === 'M') {
    const k = diagramFactor(model, stations, view, scale);
    let maxAbs = 0;
    for (const st of stations.values()) for (const p of st) maxAbs = Math.max(maxAbs, Math.abs(p[view]));
    const scr = (p: Pt) => toScreen(v, p.x, p.y);
    const pts = (list: Pt[]) =>
      list
        .map((p) => {
          const q = scr(p);
          return `${q.x},${q.y}`;
        })
        .join(' ');
    buildChains(model, stations, view).forEach((ch, ci) => {
      const shape = chainShape(ch, k);
      // um polígono por trecho de mesmo sinal: sem emendas entre trechos nem paredes em nós que só dividem a peça
      shape.fills.forEach((f, fi) =>
        out.push(<polygon key={`d-${ci}-${fi}`} points={pts(f.pts)} fill={f.sign > 0 ? 'var(--pos)' : 'var(--neg)'} fillOpacity={0.2} stroke="none" />),
      );
      out.push(<polyline key={`o-${ci}`} points={pts(shape.outline)} fill="none" stroke="var(--outline)" strokeWidth={1.2} strokeLinejoin="round" />);
      if (showValues && maxAbs > 1e-9) {
        const st = ch.pts;
        const idx = new Set([0, st.length - 1]);
        let iMax = 0;
        st.forEach((p, i) => {
          if (Math.abs(p.v) > Math.abs(st[iMax].v)) iMax = i;
        });
        if (iMax > 0 && iMax < st.length - 1 && Math.abs(st[iMax].v) > 1.02 * Math.max(Math.abs(st[0].v), Math.abs(st[st.length - 1].v))) idx.add(iMax);
        for (const i of idx) {
          const val = st[i].v;
          if (Math.abs(val) < 1e-6 * maxAbs) continue;
          const b = scr(st[i]);
          const o = scr(shape.offsets[i]);
          const dx = o.x - b.x;
          const dy = o.y - b.y;
          const L = Math.hypot(dx, dy) || 1;
          out.push(
            <Label key={`l-${ci}-${i}`} x={o.x + (dx / L) * 12} y={o.y + (dy / L) * 12} color={val >= 0 ? 'var(--pos)' : 'var(--neg)'} weight={600}>
              {formatValue(val)}
            </Label>,
          );
        }
      }
    });
    const unit = view === 'M' ? 'kN·m' : 'kN';
    out.push(
      <Label key="legend" x={12} y={legendY} anchor="start" color="var(--muted)">
        {maxAbs <= 1e-9 ? 'Esforço nulo em toda a estrutura' : `máx |${view}| = ${formatValue(maxAbs)} ${unit} · azul: positivo · vermelho: negativo${view === 'M' ? ' · desenhado do lado tracionado' : ''}`}
      </Label>,
    );
  }

  if (view === 'deformed') {
    const f = deformFactor(model, stations, scale);
    let maxP: { s: Pt; d: number } | null = null;
    for (const [id, st] of stations) {
      const pts = st.map((p) => toScreen(v, p.x + p.dx * f, p.y + p.dy * f));
      out.push(<polyline key={`df-${id}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--deformed)" strokeWidth={2.2} strokeLinejoin="round" />);
      st.forEach((p, i) => {
        const d = Math.hypot(p.dx, p.dy);
        if (!maxP || d > maxP.d) maxP = { s: pts[i], d };
      });
    }
    const mp = maxP as { s: Pt; d: number } | null;
    if (showValues && mp && mp.d > 0) {
      out.push(<circle key="dmax" cx={mp.s.x} cy={mp.s.y} r={3.5} fill="var(--deformed)" />);
      out.push(
        <Label key="dmaxl" x={mp.s.x + 8} y={mp.s.y - 12} color="var(--deformed)" anchor="start" weight={600}>
          {`δmáx = ${formatValue(mp.d * 1000)} mm`}
        </Label>,
      );
    }
    out.push(
      <Label key="dfac" x={12} y={legendY} anchor="start" color="var(--muted)">
        {f > 0 ? `Deformada ampliada ${formatValue(f)}×` : 'Sem deslocamentos'}
      </Label>,
    );
  }

  if (view === 'reactions') {
    let maxR = 0;
    for (const r of analysis.reactions) maxR = Math.max(maxR, Math.abs(r.fx), Math.abs(r.fy), Math.abs(r.mz));
    const tol = 1e-9 * Math.max(1, maxR);
    for (const r of analysis.reactions) {
      const n = model.nodes.find((k) => k.id === r.nodeId);
      if (!n) continue;
      const p = toScreen(v, n.x, n.y);
      if (Math.abs(r.fx) > tol) {
        const s = Math.sign(r.fx);
        out.push(<Arrow key={`rx-${r.nodeId}`} x1={p.x - s * 58} y1={p.y + 30} x2={p.x - s * 14} y2={p.y + 30} color="var(--reaction)" width={2.2} />);
        out.push(
          <Label key={`rxl-${r.nodeId}`} x={p.x - s * 36} y={p.y + 42} color="var(--reaction)" weight={600}>
            {`${formatValue(Math.abs(r.fx))} kN`}
          </Label>,
        );
      }
      if (Math.abs(r.fy) > tol) {
        const s = Math.sign(r.fy);
        out.push(<Arrow key={`ry-${r.nodeId}`} x1={p.x} y1={p.y + s * 70} x2={p.x} y2={p.y + s * 26} color="var(--reaction)" width={2.2} />);
        out.push(
          <Label key={`ryl-${r.nodeId}`} x={p.x + 8} y={p.y + s * 62} color="var(--reaction)" anchor="start" weight={600}>
            {`${formatValue(Math.abs(r.fy))} kN`}
          </Label>,
        );
      }
      if (Math.abs(r.mz) > tol) {
        out.push(<MomentArrow key={`rm-${r.nodeId}`} p={p} ccw={r.mz > 0} color="var(--reaction)" r={22} />);
        out.push(
          <Label key={`rml-${r.nodeId}`} x={p.x + 28} y={p.y - 24} color="var(--reaction)" anchor="start" weight={600}>
            {`${formatValue(Math.abs(r.mz))} kN·m`}
          </Label>,
        );
      }
    }
  }

  return <g>{out}</g>;
}
