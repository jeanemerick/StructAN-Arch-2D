import { useEffect, useMemo, type ReactNode } from 'react';
import type { Id, Model } from '../model/types';
import type { AnalysisOk } from '../solver/analyze';
import { memberExtremes, memberStations, type MemberExtremes, type Station } from '../solver/diagrams';
import type { View } from './state';
import { modelBounds, toScreen, type Pt, type ViewT } from './geometry';
import { Arrow, Label, MomentArrow } from './glyphs';
import { formatValue } from './format';
import { buildChains, chainShape, drawDir, type Effort } from './diagramShapes';
import { endLabels } from './diagramLabels';
import { placeLabels, type Box, type LabelRequest } from './labels';

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
  showReactions: boolean;
  hoverPx: Pt | null;
  onHover(h: HoverInfo | null): void;
  /** Altura da área de desenho, para posicionar a legenda no canto inferior. */
  height: number;
}

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

interface LabelStyle {
  color: string;
  weight?: number;
  size?: number;
  /** Ponto do diagrama ligado ao texto por um traço de chamada. */
  leaderFrom?: Pt;
  testid?: string;
}

const boxOfSegment = (a: Pt, b: Pt, pad = 4): Box => ({
  minX: Math.min(a.x, b.x) - pad,
  maxX: Math.max(a.x, b.x) + pad,
  minY: Math.min(a.y, b.y) - pad,
  maxY: Math.max(a.y, b.y) + pad,
});

/** Setas das reações e pedidos de rótulo (posição decidida junto com os demais rótulos). */
function reactionGlyphs(model: Model, analysis: AnalysisOk, v: ViewT) {
  const nodes: ReactNode[] = [];
  const reqs: LabelRequest[] = [];
  const blocked: Box[] = [];
  const styles = new Map<string, LabelStyle>();
  let maxR = 0;
  for (const r of analysis.reactions) maxR = Math.max(maxR, Math.abs(r.fx), Math.abs(r.fy), Math.abs(r.mz));
  const tol = 1e-9 * Math.max(1, maxR);
  const color = 'var(--reaction)';
  for (const r of analysis.reactions) {
    const n = model.nodes.find((k) => k.id === r.nodeId);
    if (!n) continue;
    const p = toScreen(v, n.x, n.y);
    const add = (key: string, text: string, candidates: Pt[]) => {
      reqs.push({ key, text, candidates, priority: 90 });
      styles.set(key, { color, weight: 600, testid: key });
    };
    if (Math.abs(r.fx) > tol) {
      const s = Math.sign(r.fx);
      const a = { x: p.x - s * 58, y: p.y + 30 };
      const b = { x: p.x - s * 14, y: p.y + 30 };
      nodes.push(<Arrow key={`rx-${r.nodeId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={color} width={2.2} />);
      blocked.push(boxOfSegment(a, b));
      const t = `${formatValue(Math.abs(r.fx))} kN`;
      add(`reaction-${r.nodeId}-fx`, t, [
        { x: p.x - s * 36, y: p.y + 43 },
        { x: p.x - s * 36, y: p.y + 18 },
        { x: p.x - s * (62 + t.length * 3.4), y: p.y + 30 },
      ]);
    }
    if (Math.abs(r.fy) > tol) {
      const s = Math.sign(r.fy);
      const a = { x: p.x, y: p.y + s * 70 };
      const b = { x: p.x, y: p.y + s * 26 };
      nodes.push(<Arrow key={`ry-${r.nodeId}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={color} width={2.2} />);
      blocked.push(boxOfSegment(a, b));
      const t = `${formatValue(Math.abs(r.fy))} kN`;
      const w = t.length * 3.4 + 8;
      add(`reaction-${r.nodeId}-fy`, t, [
        { x: p.x + w, y: p.y + s * 60 },
        { x: p.x - w, y: p.y + s * 60 },
        { x: p.x, y: p.y + s * 80 },
      ]);
    }
    if (Math.abs(r.mz) > tol) {
      nodes.push(<MomentArrow key={`rm-${r.nodeId}`} p={p} ccw={r.mz > 0} color={color} r={22} />);
      blocked.push({ minX: p.x - 24, maxX: p.x + 24, minY: p.y - 24, maxY: p.y + 24 });
      const t = `${formatValue(Math.abs(r.mz))} kN·m`;
      const w = t.length * 3.4;
      add(`reaction-${r.nodeId}-mz`, t, [
        { x: p.x + 28 + w, y: p.y - 24 },
        { x: p.x - 28 - w, y: p.y - 24 },
        { x: p.x + 28 + w, y: p.y + 24 },
      ]);
    }
  }
  return { nodes, reqs, blocked, styles };
}

export function ResultsLayer({ model, analysis, view, v, scale, showValues, showReactions, hoverPx, onHover, height }: Props) {
  const legendY = height - 16;
  const kindOf = new Map(model.members.map((k) => [k.id, k.kind === 'arc' ? 'Arco' : 'Barra']));
  const stations = useStations(model, analysis);
  const extremes = useMemo(() => new Map<Id, MemberExtremes>(model.members.map((k) => [k.id, memberExtremes(model, analysis, k.id)])), [model, analysis]);

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
  const reqs: LabelRequest[] = [];
  const blocked: Box[] = [];
  const styles = new Map<string, LabelStyle>();
  const scr = (p: Pt) => toScreen(v, p.x, p.y);

  if (view === 'N' || view === 'Q' || view === 'M') {
    const k = diagramFactor(model, stations, view, scale);
    let maxAbs = 0;
    for (const st of stations.values()) for (const p of st) maxAbs = Math.max(maxAbs, Math.abs(p[view]));
    const pts = (list: Pt[]) =>
      list
        .map((p) => {
          const q = scr(p);
          return `${q.x},${q.y}`;
        })
        .join(' ');
    const chains = buildChains(model, stations, view);
    const reversed = new Map<Id, boolean>();
    chains.forEach((ch, ci) => {
      ch.members.forEach((id, i) => reversed.set(id, ch.reversed[i]));
      const shape = chainShape(ch, k);
      // um polígono por trecho de mesmo sinal: sem emendas entre trechos nem paredes em nós que só dividem a peça
      shape.fills.forEach((f, fi) =>
        out.push(<polygon key={`d-${ci}-${fi}`} points={pts(f.pts)} fill={f.sign > 0 ? 'var(--pos)' : 'var(--neg)'} fillOpacity={0.2} stroke="none" />),
      );
      out.push(<polyline key={`o-${ci}`} points={pts(shape.outline)} fill="none" stroke="var(--outline)" strokeWidth={1.2} strokeLinejoin="round" />);
    });

    if (showValues && maxAbs > 1e-9) {
      const tol = 1e-6 * maxAbs;
      const colorOf = (val: number) => (val >= 0 ? 'var(--pos)' : 'var(--neg)');
      /** Ponto do diagrama (tela) para um valor no eixo do membro e direção de fora. */
      const diagramPoint = (id: Id, e: { x: number; y: number; tx: number; ty: number; value: number }) => {
        const [dx, dy] = drawDir(view, e, reversed.get(id) ?? false);
        const base = scr(e);
        const at = scr({ x: e.x + dx * e.value * k, y: e.y + dy * e.value * k });
        let ox = at.x - base.x;
        let oy = at.y - base.y;
        let L = Math.hypot(ox, oy);
        if (L < 1) {
          const q = scr({ x: e.x + dx, y: e.y + dy });
          ox = (q.x - base.x) * Math.sign(e.value || 1);
          oy = (q.y - base.y) * Math.sign(e.value || 1);
          L = Math.hypot(ox, oy) || 1;
        }
        return { at, out: { x: ox / L, y: oy / L }, along: (() => {
          const t = scr({ x: e.x + e.tx, y: e.y + e.ty });
          const tl = Math.hypot(t.x - base.x, t.y - base.y) || 1;
          return { x: (t.x - base.x) / tl, y: (t.y - base.y) / tl };
        })() };
      };
      // extremos da estrutura (destaque) e de cada barra (menos peso), exatos
      let gMax: { id: Id; e: MemberExtremes['N']['max'] } | null = null;
      let gMin: { id: Id; e: MemberExtremes['N']['min'] } | null = null;
      for (const [id, ex] of extremes) {
        const { max, min } = ex[view];
        if (max.value > tol && (!gMax || max.value > gMax.e.value)) gMax = { id, e: max };
        if (min.value < -tol && (!gMin || min.value < gMin.e.value)) gMin = { id, e: min };
      }
      const globals = [gMax && { ...gMax, tag: 'máx' }, gMin && { ...gMin, tag: 'mín' }].filter(Boolean) as { id: Id; e: MemberExtremes['N']['max']; tag: string }[];
      for (const g of globals) {
        const d = diagramPoint(g.id, g.e);
        out.push(<circle key={`gx-${g.tag}`} cx={d.at.x} cy={d.at.y} r={4.2} fill={colorOf(g.e.value)} stroke="var(--canvas)" strokeWidth={1.5} data-testid={`extreme-${g.tag === 'máx' ? 'max' : 'min'}`} />);
        const key = `g-${g.tag}`;
        const text = `${g.tag} ${formatValue(g.e.value)}`;
        const a = (s: number, t = 0) => ({ x: d.at.x + d.out.x * s + d.along.x * t, y: d.at.y + d.out.y * s + d.along.y * t });
        reqs.push({ key, text, priority: 100, candidates: [a(18), a(30), a(16, 34), a(16, -34), a(42)] });
        styles.set(key, { color: colorOf(g.e.value), weight: 700, testid: `extreme-label-${g.tag === 'máx' ? 'max' : 'min'}` });
      }
      // pontas das cadeias (apoios, cantos e saltos) já ganham rótulo próprio
      const chainEnds = chains.flatMap((ch) => [ch.pts[0], ch.pts[ch.pts.length - 1]]);
      const shown: { x: number; y: number; value: number }[] = [];
      for (const [id, ex] of extremes) {
        const mem = model.members.find((q) => q.id === id)!;
        const ni = model.nodes.find((n) => n.id === mem.ni)!;
        const nj = model.nodes.find((n) => n.id === mem.nj)!;
        const span = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        for (const e of [ex[view].max, ex[view].min]) {
          if (Math.abs(e.value) < 0.02 * maxAbs) continue;
          if (globals.some((g) => Math.abs(g.e.value - e.value) < tol && Math.hypot(g.e.x - e.x, g.e.y - e.y) < 1e-6)) continue;
          if (chainEnds.some((p) => Math.hypot(e.x - p.x, e.y - p.y) < 0.03 * span)) continue;
          // o mesmo ponto como extremo de duas peças (fecho de um arco dividido, por exemplo): um rótulo só
          if (shown.some((p) => Math.abs(p.value - e.value) < tol && Math.hypot(p.x - e.x, p.y - e.y) < 1e-6)) continue;
          shown.push({ x: e.x, y: e.y, value: e.value });
          const d = diagramPoint(id, e);
          out.push(<circle key={`mx-${id}-${e.value}`} cx={d.at.x} cy={d.at.y} r={2.2} fill={colorOf(e.value)} />);
          const key = `m-${id}-${e.value > 0 ? 'p' : 'n'}`;
          reqs.push({ key, text: formatValue(e.value), priority: 30, fontSize: 11, candidates: [{ x: d.at.x + d.out.x * 14, y: d.at.y + d.out.y * 14 }, { x: d.at.x + d.out.x * 24, y: d.at.y + d.out.y * 24 }] });
          styles.set(key, { color: colorOf(e.value), weight: 500, size: 11 });
        }
      }
      // pontas das cadeias: apoios, cantos e saltos (um valor de cada lado, com traço de chamada)
      for (const l of endLabels(chains, k, scr, maxAbs)) {
        // o extremo da estrutura já mostra este valor neste ponto
        if (globals.some((g) => Math.abs(g.e.value - l.value) < tol && Math.hypot(scr(g.e).x - l.base.x, scr(g.e).y - l.base.y) < 2)) continue;
        reqs.push({ key: l.key, text: l.text, candidates: l.candidates, priority: 80 });
        styles.set(l.key, { color: colorOf(l.value), weight: 600, leaderFrom: l.leader ? l.at : undefined });
      }
    }
    const unit = view === 'M' ? 'kN·m' : 'kN';
    out.push(
      <Label key="legend" x={12} y={legendY} anchor="start" color="var(--muted)">
        {maxAbs <= 1e-9 ? 'Esforço nulo em toda a estrutura' : `máx |${view}| = ${formatValue(maxAbs)} ${unit} · azul: positivo · vermelho: negativo${view === 'M' ? ' · desenhado do lado tracionado' : ''}`}
      </Label>,
    );
  }

  if (view === 'reactions' || ((view === 'N' || view === 'Q' || view === 'M') && showReactions)) {
    const r = reactionGlyphs(model, analysis, v);
    out.push(...r.nodes);
    reqs.push(...r.reqs);
    blocked.push(...r.blocked);
    for (const [key, st] of r.styles) styles.set(key, st);
  }

  if (view === 'deformed') {
    const f = deformFactor(model, stations, scale);
    let maxP: { s: Pt; d: number } | null = null;
    for (const [id, st] of stations) {
      const ps = st.map((p) => toScreen(v, p.x + p.dx * f, p.y + p.dy * f));
      out.push(<polyline key={`df-${id}`} points={ps.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--deformed)" strokeWidth={2.2} strokeLinejoin="round" />);
      st.forEach((p, i) => {
        const d = Math.hypot(p.dx, p.dy);
        if (!maxP || d > maxP.d) maxP = { s: ps[i], d };
      });
    }
    const mp = maxP as { s: Pt; d: number } | null;
    if (showValues && mp && mp.d > 0) {
      out.push(<circle key="dmax" cx={mp.s.x} cy={mp.s.y} r={3.5} fill="var(--deformed)" />);
      out.push(
        <Label key="dmaxl" x={mp.s.x + 8} y={mp.s.y - 12} color="var(--deformed)" anchor="start" weight={600} halo>
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

  // todos os rótulos de valor juntos, sem colisão
  for (const p of placeLabels(reqs, blocked)) {
    const st = styles.get(p.key)!;
    if (st.leaderFrom) {
      out.push(<line key={`ld-${p.key}`} x1={st.leaderFrom.x} y1={st.leaderFrom.y} x2={p.x} y2={p.y} stroke={st.color} strokeWidth={1} strokeOpacity={0.7} />);
    }
    out.push(
      <Label key={`lb-${p.key}`} x={p.x} y={p.y} color={st.color} weight={st.weight} size={st.size} halo testid={st.testid}>
        {p.text}
      </Label>,
    );
  }

  return <g>{out}</g>;
}
