import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject } from 'react';
import type { DistLoad, Id, Model } from '../model/types';
import { addBar } from '../model/ops';
import { resolveClickNode, snapPoint } from './picking';
import type { Analysis } from '../solver/analyze';
import { isSelected, type Action, type UiState } from './state';
import { fitView, hitTest, itemsInWindow, memberPolyline, modelBounds, toScreen, toWorld, zoomAt, type Pt, type ViewT } from './geometry';
import { Arrow, HingeGlyph, Label, MomentArrow, SupportGlyph } from './glyphs';
import { formatValue } from './format';
import { ResultsLayer, type HoverInfo } from './ResultsLayer';
import { computeLoadBands } from './loadBands';

interface Props {
  state: UiState;
  dispatch: Dispatch<Action>;
  analysis: Analysis;
  fitKey: number;
  draftArc: Pt[] | null;
  svgRef: RefObject<SVGSVGElement>;
  onCursor(p: Pt | null): void;
  /** Quando definido, o clique entrega o ponto (com snap) em vez de criar ou selecionar. */
  pick?: (p: Pt) => void;
  /** Marcadores de pré-visualização (nó por coordenadas, nascenças do arco). */
  marks?: Pt[];
  /** Dica mostrada no alto do desenho (substitui a padrão da ferramenta). */
  hintText?: string;
}

const HIT_PX = 8;

export function Canvas({ state, dispatch, analysis, fitKey, draftArc, svgRef, onCursor, pick, marks, hintText }: Props) {
  const { model, tool, selection, barStart } = state;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewT | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [panning, setPanning] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  /** Arraste em curso: mover a vista, janela de seleção ou clique (ainda sem movimento). */
  const pan = useRef<{ sx: number; sy: number; v: ViewT; moved: boolean; button: number; mode: 'pan' | 'window' | 'click'; touch: boolean } | null>(null);
  const [win, setWin] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const suppressMenu = useRef(false);
  const spaceDown = useRef(false);

  const polylines = useMemo(() => {
    const map = new Map<Id, Pt[]>();
    for (const k of model.members) map.set(k.id, memberPolyline(model, k));
    return map;
  }, [model]);

  // tamanho da área
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // enquadrar na primeira medida e quando pedido
  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => {
    if (size.w > 0 && size.h > 0) setView(fitView(modelBounds(modelRef.current), size.w, size.h));
  }, [fitKey, size.w > 0 && size.h > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        spaceDown.current = true;
        if (e.target === document.body) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // zoom com a roda (listener não passivo para impedir a rolagem da página)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => (v ? zoomAt(v, e.clientX - r.left, e.clientY - r.top, factor) : v));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svgRef]);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pickOpts = (v: ViewT) => ({ tol: HIT_PX / v.scale, snap: state.snap, grid: state.grid, polylines });
  const snapAt = (raw: Pt, v: ViewT): Pt => snapPoint(model, raw, pickOpts(v));

  const handleClick = (p: Pt, v: ViewT, shift: boolean) => {
    const raw = toWorld(v, p.x, p.y);
    if (pick) {
      pick(snapAt(raw, v));
      return;
    }
    if (tool === 'select' || tool === 'arc') {
      const h = hitTest(model, raw.x, raw.y, HIT_PX / v.scale, polylines);
      if (h) dispatch({ type: 'select', selection: { kind: h.kind, id: h.id }, how: shift ? 'toggle' : 'replace' });
      else if (!shift) dispatch({ type: 'select', selection: null });
      return;
    }
    const r = resolveClickNode(model, raw, pickOpts(v));
    if (!r) return;
    if (tool === 'node') {
      dispatch({ type: 'apply', fn: () => r.model, select: { kind: 'node', id: r.id } });
      return;
    }
    // ferramenta barra
    if (!barStart || !r.model.nodes.some((n) => n.id === barStart)) {
      dispatch({ type: 'apply', fn: () => r.model });
      dispatch({ type: 'set', patch: { barStart: r.id } });
      return;
    }
    if (r.id === barStart) return;
    const dup = r.model.members.some((k) => (k.ni === barStart && k.nj === r.id) || (k.ni === r.id && k.nj === barStart));
    const next = dup ? { model: r.model, id: '' } : addBar(r.model, barStart, r.id);
    dispatch({ type: 'apply', fn: () => next.model, select: next.id ? { kind: 'member', id: next.id } : undefined });
    dispatch({ type: 'set', patch: { barStart: r.id } });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view) return;
    const p = local(e);
    const touch = e.pointerType === 'touch';
    // botão do meio, botão direito ou Espaço: move a vista; no Selecionar, o esquerdo faz a janela;
    // no toque, arrastar move a vista e tocar é clique
    const mode: 'pan' | 'window' | 'click' =
      e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown.current) || touch ? 'pan' : tool === 'select' && !pick ? 'window' : 'click';
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pan.current = { sx: p.x, sy: p.y, v: view, moved: false, button: e.button, mode, touch };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!view) return;
    const p = local(e);
    const pc = pan.current;
    if (pc && pc.mode !== 'click') {
      const dx = p.x - pc.sx;
      const dy = p.y - pc.sy;
      if (!pc.moved && Math.hypot(dx, dy) > 3) {
        pc.moved = true;
        if (pc.mode === 'pan') setPanning(true);
      }
      if (pc.moved && pc.mode === 'pan') {
        setView({ ...pc.v, ox: pc.v.ox + dx, oy: pc.v.oy + dy });
        return;
      }
      if (pc.moved && pc.mode === 'window') setWin({ x0: pc.sx, y0: pc.sy, x1: p.x, y1: p.y });
    }
    const raw = toWorld(view, p.x, p.y);
    const snapped = snapAt(raw, view);
    setCursor(tool === 'node' || tool === 'bar' || pick ? snapped : raw);
    onCursor(snapped);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const pc = pan.current;
    pan.current = null;
    setPanning(false);
    if (!view || !pc) return;
    if (pc.moved) {
      if (pc.mode === 'pan' && pc.button === 2) suppressMenu.current = true;
      if (pc.mode === 'window' && win) {
        // da esquerda para a direita: só o que estiver inteiro dentro; da direita para a esquerda: o que a janela tocar
        const a = toWorld(view, win.x0, win.y0);
        const b = toWorld(view, win.x1, win.y1);
        const rect = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
        const found = itemsInWindow(model, rect, win.x1 >= win.x0 ? 'inside' : 'crossing', polylines);
        dispatch({ type: 'select', selection: found, how: e.shiftKey ? 'add' : 'replace' });
      }
      setWin(null);
      return;
    }
    setWin(null);
    if ((e.button === 0 || pc.touch) && !spaceDown.current) handleClick(local(e), view, e.shiftKey);
  };

  const onLeave = () => {
    setCursor(null);
    setHover(null);
    onCursor(null);
  };

  const v = view;
  const resultsView = state.view !== 'model';

  const content: ReactNode[] = [];
  if (v) {
    content.push(<GridLayer key="grid" v={v} w={size.w} h={size.h} grid={state.grid} />);
    // barras e arcos
    for (const k of model.members) {
      const pts = polylines.get(k.id) ?? [];
      const sp = pts.map((p) => toScreen(v, p.x, p.y));
      const isSel = isSelected(selection, 'member', k.id);
      const color = isSel ? 'var(--selected)' : resultsView ? 'var(--member-dim)' : 'var(--member)';
      const ptsAttr = sp.map((p) => `${p.x},${p.y}`).join(' ');
      // pórtico: traço cheio; somente axial: traço fino; somente flexão: traço duplo
      const width = k.behavior === 'axial' ? (isSel ? 2.4 : 1.3) : k.behavior === 'bending' ? (isSel ? 5.5 : resultsView ? 3.6 : 4.6) : isSel ? 3.5 : resultsView ? 1.6 : 2.4;
      content.push(<polyline key={`m-${k.id}`} points={ptsAttr} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" data-member={k.id} />);
      if (k.behavior === 'bending') {
        content.push(<polyline key={`mi-${k.id}`} points={ptsAttr} fill="none" stroke="var(--canvas)" strokeWidth={width - 3} strokeLinejoin="round" pointerEvents="none" />);
      }
      if (k.behavior !== 'frame' && !resultsView && sp.length >= 2) {
        const i = Math.floor((sp.length - 1) / 2);
        const a = sp[i];
        const b = sp[i + 1];
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // etiqueta do lado de cima (ou à esquerda) da barra
        let nx = -(b.y - a.y) / L;
        let ny = (b.x - a.x) / L;
        if (ny > 0 || (Math.abs(ny) < 1e-9 && nx > 0)) {
          nx = -nx;
          ny = -ny;
        }
        content.push(
          <Label key={`tag-${k.id}`} x={(a.x + b.x) / 2 + nx * 11} y={(a.y + b.y) / 2 + ny * 11 + 4} color="var(--muted)">
            {k.behavior === 'axial' ? 'EA' : 'EI'}
          </Label>,
        );
      }
    }
    if (resultsView && analysis.ok) {
      content.push(<ResultsLayer key="res" model={model} analysis={analysis} view={state.view} v={v} scale={state.scale} showValues={state.showValues} showReactions={state.showReactions} hoverPx={cursor ? toScreen(v, cursor.x, cursor.y) : null} onHover={setHover} height={size.h} />);
    }
    if (!resultsView) content.push(<LoadsLayer key="loads" model={model} v={v} polylines={polylines} onAxis={state.loadsOnAxis} />);
    // rótulas
    for (const k of model.members) {
      const pts = polylines.get(k.id) ?? [];
      if (pts.length < 2) continue;
      const axial = k.behavior === 'axial';
      const ends: [boolean, Pt, Pt][] = [
        [axial || k.hingeI, pts[0], pts[1]],
        [axial || k.hingeJ, pts[pts.length - 1], pts[pts.length - 2]],
      ];
      ends.forEach(([on, a, b], i) => {
        if (!on) return;
        const A = toScreen(v, a.x, a.y);
        const B = toScreen(v, b.x, b.y);
        const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
        content.push(<HingeGlyph key={`h-${k.id}-${i}`} p={A} dir={{ x: (B.x - A.x) / L, y: (B.y - A.y) / L }} />);
      });
    }
    // apoios e nós
    for (const n of model.nodes) {
      const p = toScreen(v, n.x, n.y);
      if (n.support) content.push(<SupportGlyph key={`s-${n.id}`} p={p} s={n.support} />);
    }
    for (const n of model.nodes) {
      const p = toScreen(v, n.x, n.y);
      const isSel = isSelected(selection, 'node', n.id);
      const isStart = barStart === n.id;
      content.push(
        <circle
          key={`n-${n.id}`}
          cx={p.x}
          cy={p.y}
          r={isSel || isStart ? 5.5 : 3.6}
          fill={isSel || isStart ? 'var(--selected)' : 'var(--glyph-fill)'}
          stroke={isSel || isStart ? 'var(--selected)' : 'var(--member)'}
          strokeWidth={1.6}
          data-node={n.id}
        />,
      );
    }
    // pré-visualizações
    if (draftArc && draftArc.length > 1) {
      const sp = draftArc.map((p) => toScreen(v, p.x, p.y));
      content.push(
        <polyline key="draft" points={sp.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" />,
      );
      for (const p of [sp[0], sp[sp.length - 1]]) content.push(<circle key={`dp-${p.x}`} cx={p.x} cy={p.y} r={4} fill="var(--accent)" />);
    }
    if (tool === 'bar' && barStart && cursor) {
      const s = model.nodes.find((n) => n.id === barStart);
      if (s) {
        const a = toScreen(v, s.x, s.y);
        const b = toScreen(v, cursor.x, cursor.y);
        content.push(<line key="rubber" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" />);
      }
    }
    for (const [i, m] of (marks ?? []).entries()) {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
      const c = toScreen(v, m.x, m.y);
      content.push(
        <g key={`mark-${i}`} stroke="var(--accent)" strokeWidth={1.6} data-testid="preview-mark">
          <circle cx={c.x} cy={c.y} r={6} fill="var(--accent-soft)" />
          <line x1={c.x - 11} y1={c.y} x2={c.x + 11} y2={c.y} />
          <line x1={c.x} y1={c.y - 11} x2={c.x} y2={c.y + 11} />
        </g>,
      );
    }
    if (win) {
      const crossing = win.x1 < win.x0;
      content.push(
        <rect
          key="window"
          x={Math.min(win.x0, win.x1)}
          y={Math.min(win.y0, win.y1)}
          width={Math.abs(win.x1 - win.x0)}
          height={Math.abs(win.y1 - win.y0)}
          fill="var(--accent-soft)"
          fillOpacity={0.35}
          stroke="var(--accent)"
          strokeDasharray={crossing ? '5 4' : undefined}
          data-testid="select-window"
        />,
      );
    }
    if ((tool === 'node' || tool === 'bar' || pick) && cursor) {
      const c = toScreen(v, cursor.x, cursor.y);
      content.push(
        <g key="cursor" stroke="var(--accent)" strokeWidth={1}>
          <line x1={c.x - 9} y1={c.y} x2={c.x + 9} y2={c.y} />
          <line x1={c.x} y1={c.y - 9} x2={c.x} y2={c.y + 9} />
          <circle cx={c.x} cy={c.y} r={4} fill="none" />
        </g>,
      );
    }
  }

  const hint =
    hintText ??
    (tool === 'select'
      ? 'Clique seleciona (Shift soma) · arrastar faz a janela de seleção · botão do meio, direito ou Espaço movem a vista · roda: zoom'
      : tool === 'node'
        ? 'Clique para criar um nó · sobre uma barra ou arco, o nó entra nele'
        : tool === 'bar'
          ? barStart
            ? 'Clique no nó final · Esc ou botão direito para terminar'
            : 'Clique no ponto inicial da barra'
          : 'Defina o arco no painel à direita');

  return (
    <div ref={wrapRef} className={`canvas-wrap tool-${tool}${panning ? ' panning' : ''}`}>
      <svg
        ref={svgRef}
        data-testid="canvas"
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onLeave}
        onContextMenu={(e) => {
          e.preventDefault();
          if (suppressMenu.current) {
            suppressMenu.current = false;
            return;
          }
          dispatch({ type: 'set', patch: { barStart: null } });
        }}
      >
        <rect x={0} y={0} width={size.w} height={size.h} fill="var(--canvas)" />
        {content}
      </svg>
      <div className="hint">{hint}</div>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.px + 14, size.w - 190), top: Math.max(hover.py - 90, 4) }}>
          <div>
            <b>{hover.label}</b> · x = {formatValue(hover.st.x)} m, y = {formatValue(hover.st.y)} m
          </div>
          <div>N = {formatValue(hover.st.N)} kN · Q = {formatValue(hover.st.Q)} kN</div>
          <div>M = {formatValue(hover.st.M)} kN·m</div>
          <div>
            δx = {formatValue(hover.st.dx * 1000)} mm · δy = {formatValue(hover.st.dy * 1000)} mm
          </div>
        </div>
      )}
    </div>
  );
}

function GridLayer({ v, w, h, grid }: { v: ViewT; w: number; h: number; grid: number }) {
  let step = grid;
  while (step * v.scale < 8) step *= 5;
  const a = toWorld(v, 0, h);
  const b = toWorld(v, w, 0);
  const lines: ReactNode[] = [];
  const x0 = Math.ceil(a.x / step);
  const x1 = Math.floor(b.x / step);
  const y0 = Math.ceil(a.y / step);
  const y1 = Math.floor(b.y / step);
  if (x1 - x0 > 400 || y1 - y0 > 400) return null;
  for (let i = x0; i <= x1; i++) {
    const sx = v.ox + i * step * v.scale;
    const major = i % 5 === 0;
    lines.push(<line key={`x${i}`} x1={sx} y1={0} x2={sx} y2={h} stroke={i === 0 ? 'var(--axis)' : major ? 'var(--grid-major)' : 'var(--grid)'} strokeWidth={1} />);
  }
  for (let j = y0; j <= y1; j++) {
    const sy = v.oy - j * step * v.scale;
    const major = j % 5 === 0;
    lines.push(<line key={`y${j}`} x1={0} y1={sy} x2={w} y2={sy} stroke={j === 0 ? 'var(--axis)' : major ? 'var(--grid-major)' : 'var(--grid)'} strokeWidth={1} />);
  }
  return <g shapeRendering="crispEdges">{lines}</g>;
}

const unitLoad = (q: DistLoad) => (q.dir === 'localX' || q.dir === 'localY' ? 'kN/m (local)' : q.ref === 'projection' ? 'kN/m (proj.)' : 'kN/m');

/**
 * Cargas distribuídas e nodais, desenhadas em pixels. Por padrão, as cargas em direção global
 * vão em faixas retas (loadBands.ts); `onAxis` desenha todas sobre o eixo do elemento (desenho antigo).
 */
function LoadsLayer({ model, v, polylines, onAxis }: { model: Model; v: ViewT; polylines: Map<Id, Pt[]>; onAxis: boolean }) {
  const out: ReactNode[] = [];
  const color = 'var(--load)';
  let axisSet: Set<string> | null = null;
  if (!onAxis) {
    const screen = new Map([...polylines].map(([id, pts]) => [id, pts.map((p) => toScreen(v, p.x, p.y))]));
    const { bands, onAxis: rest } = computeLoadBands(model, screen, polylines);
    axisSet = new Set(rest.map((r) => `${r.memberId}:${r.loadIndex}`));
    bands.forEach((b, bi) => {
      out.push(
        <polygon
          key={`band-${bi}`}
          points={b.outline.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="var(--load)"
          fillOpacity={0.07}
          stroke={color}
          strokeWidth={1.1}
          strokeLinejoin="round"
          data-testid="load-band"
        />,
      );
      b.arrows.forEach((a, ai) => out.push(<Arrow key={`ba-${bi}-${ai}`} x1={a.tail.x} y1={a.tail.y} x2={a.head.x} y2={a.head.y} color={color} width={1.1} head={5} />));
      out.push(
        <Label key={`bl-${bi}`} x={b.label.x} y={b.label.y} color={color} anchor={b.label.anchor} halo>
          {b.label.text}
        </Label>,
      );
    });
  }
  for (const k of model.members) {
    const pts = polylines.get(k.id);
    if (!pts || pts.length < 2 || k.loads.length === 0) continue;
    const sp = pts.map((p) => toScreen(v, p.x, p.y));
    // comprimento acumulado em pixels
    const cum = [0];
    for (let i = 1; i < sp.length; i++) cum.push(cum[i - 1] + Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y));
    const total = cum[cum.length - 1];
    if (total < 4) continue;
    const xi = pts[0].x;
    const xj = pts[pts.length - 1].x;
    k.loads.forEach((q, li) => {
      const qmax = Math.max(Math.abs(q.qi), Math.abs(q.qj));
      if (qmax === 0) return;
      if (axisSet && !axisSet.has(`${k.id}:${li}`)) return;
      const nArrows = Math.max(3, Math.min(40, Math.round(total / 28)));
      const tails: Pt[] = [];
      const offset = li * 34;
      for (let a = 0; a <= nArrows; a++) {
        const target = (total * a) / nArrows;
        let i = 1;
        while (i < cum.length - 1 && cum[i] < target) i++;
        const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        const P = { x: sp[i - 1].x + (sp[i].x - sp[i - 1].x) * t, y: sp[i - 1].y + (sp[i].y - sp[i - 1].y) * t };
        const segL = Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y) || 1;
        const tx = (sp[i].x - sp[i - 1].x) / segL;
        const ty = (sp[i].y - sp[i - 1].y) / segL;
        const frac = k.kind === 'arc' ? (pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t - xi) / (xj - xi || 1) : target / total;
        const val = q.qi + (q.qj - q.qi) * frac;
        // direção da força na tela
        let d: Pt;
        if (q.dir === 'globalY') d = { x: 0, y: -Math.sign(val) };
        else if (q.dir === 'globalX') d = { x: Math.sign(val), y: 0 };
        else if (q.dir === 'localY') d = { x: ty * Math.sign(val), y: -tx * Math.sign(val) };
        else d = { x: tx * Math.sign(val), y: ty * Math.sign(val) };
        const len = 8 + (26 * Math.abs(val)) / qmax;
        if (q.dir === 'localX') {
          // seta paralela à barra, deslocada para o lado
          const side = { x: ty, y: -tx };
          const base = { x: P.x + side.x * (10 + offset), y: P.y + side.y * (10 + offset) };
          if (a < nArrows && Math.abs(val) > 0) out.push(<Arrow key={`lx-${k.id}-${li}-${a}`} x1={base.x} y1={base.y} x2={base.x + d.x * 12} y2={base.y + d.y * 12} color={color} width={1.2} head={5} />);
          continue;
        }
        const head = { x: P.x - d.x * offset, y: P.y - d.y * offset };
        const tail = { x: head.x - d.x * len, y: head.y - d.y * len };
        if (Math.abs(val) < 1e-12) {
          tails.push(head);
          continue;
        }
        tails.push(tail);
        out.push(<Arrow key={`q-${k.id}-${li}-${a}`} x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} color={color} width={1.1} head={5} />);
      }
      if (tails.length > 1) out.push(<polyline key={`env-${k.id}-${li}`} points={tails.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={1.2} />);
      const lp = tails[Math.floor(tails.length / 2)] ?? sp[Math.floor(sp.length / 2)];
      const text = q.qi === q.qj ? `${formatValue(q.qi)} ${unitLoad(q)}` : `${formatValue(q.qi)} → ${formatValue(q.qj)} ${unitLoad(q)}`;
      out.push(
        <Label key={`ql-${k.id}-${li}`} x={lp.x} y={lp.y - 10} color={color}>
          {text}
        </Label>,
      );
    });
  }
  for (const n of model.nodes) {
    if (!n.load) continue;
    const p = toScreen(v, n.x, n.y);
    const { fx, fy, mz } = n.load;
    if (fx !== 0) {
      const s = Math.sign(fx);
      out.push(<Arrow key={`fx-${n.id}`} x1={p.x - s * 48} y1={p.y} x2={p.x - s * 6} y2={p.y} color={color} width={2} />);
      out.push(
        <Label key={`fxl-${n.id}`} x={p.x - s * 30} y={p.y - 10} color={color}>
          {formatValue(Math.abs(fx))} kN
        </Label>,
      );
    }
    if (fy !== 0) {
      const s = Math.sign(fy);
      out.push(<Arrow key={`fy-${n.id}`} x1={p.x} y1={p.y + s * 48} x2={p.x} y2={p.y + s * 6} color={color} width={2} />);
      out.push(
        <Label key={`fyl-${n.id}`} x={p.x + 6} y={p.y + s * 42} color={color} anchor="start">
          {formatValue(Math.abs(fy))} kN
        </Label>,
      );
    }
    if (mz !== 0) {
      out.push(<MomentArrow key={`mz-${n.id}`} p={p} ccw={mz > 0} color={color} />);
      out.push(
        <Label key={`mzl-${n.id}`} x={p.x + 22} y={p.y - 20} color={color} anchor="start">
          {formatValue(Math.abs(mz))} kN·m
        </Label>,
      );
    }
  }
  return <g>{out}</g>;
}
