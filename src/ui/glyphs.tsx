import type { ReactNode } from 'react';
import type { Support } from '../model/types';
import type { Pt } from './geometry';

/** Seta de (x1, y1) até a ponta (x2, y2), em pixels. */
export function Arrow({
  x1,
  y1,
  x2,
  y2,
  color,
  width = 1.6,
  head = 7,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width?: number;
  head?: number;
}) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (L < 1e-6) return null;
  const ux = (x2 - x1) / L;
  const uy = (y2 - y1) / L;
  const bx = x2 - ux * head;
  const by = y2 - uy * head;
  const px = -uy * head * 0.45;
  const py = ux * head * 0.45;
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} />
      <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={color} />
    </g>
  );
}

/** Momento: arco circular em torno do ponto, anti-horário quando ccw. */
export function MomentArrow({ p, ccw, color, r = 17 }: { p: Pt; ccw: boolean; color: string; r?: number }) {
  // na tela o eixo y aponta para baixo: anti-horário visual = sweep 0
  const a0 = (-40 * Math.PI) / 180;
  const a1 = (220 * Math.PI) / 180;
  const start = { x: p.x + r * Math.cos(a0), y: p.y - r * Math.sin(a0) };
  const end = { x: p.x + r * Math.cos(a1), y: p.y - r * Math.sin(a1) };
  const [from, to] = ccw ? [start, end] : [end, start];
  const sweep = ccw ? 0 : 1;
  // tangente na ponta
  const ang = ccw ? a1 : a0;
  const tx = ccw ? -Math.sin(ang) : Math.sin(ang);
  const ty = ccw ? -Math.cos(ang) : Math.cos(ang);
  const h = 7;
  const bx = to.x - tx * h;
  const by = to.y - ty * h;
  return (
    <g>
      <path d={`M ${from.x} ${from.y} A ${r} ${r} 0 1 ${sweep} ${to.x} ${to.y}`} fill="none" stroke={color} strokeWidth={1.6} />
      <polygon
        points={`${to.x},${to.y} ${bx - ty * h * 0.45},${by + tx * h * 0.45} ${bx + ty * h * 0.45},${by - tx * h * 0.45}`}
        fill={color}
      />
    </g>
  );
}

export function Label({
  x,
  y,
  children,
  color = 'var(--ink)',
  anchor = 'middle',
  weight,
}: {
  x: number;
  y: number;
  children: ReactNode;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
}) {
  return (
    <text x={x} y={y} className="svg-label" fill={color} textAnchor={anchor} dominantBaseline="middle" fontWeight={weight}>
      {children}
    </text>
  );
}

function Hatch({ x1, y1, x2, y2, dx, dy, color }: { x1: number; y1: number; x2: number; y2: number; dx: number; dy: number; color: string }) {
  const n = 5;
  const lines = [];
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    const y = y1 + ((y2 - y1) * i) / n;
    lines.push(<line key={i} x1={x} y1={y} x2={x + dx} y2={y + dy} stroke={color} strokeWidth={1} />);
  }
  return <g>{lines}</g>;
}

function Spring({ from, dir, color }: { from: Pt; dir: Pt; color: string }) {
  const L = 26;
  const n = 6;
  const px = -dir.y;
  const py = dir.x;
  const pts: string[] = [`${from.x},${from.y}`];
  for (let i = 1; i < n; i++) {
    const t = (L * i) / n;
    const s = i % 2 ? 5 : -5;
    pts.push(`${from.x + dir.x * t + px * s},${from.y + dir.y * t + py * s}`);
  }
  const end = { x: from.x + dir.x * L, y: from.y + dir.y * L };
  pts.push(`${end.x},${end.y}`);
  return (
    <g>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.4} />
      <line x1={end.x - px * 9} y1={end.y - py * 9} x2={end.x + px * 9} y2={end.y + py * 9} stroke={color} strokeWidth={1.6} />
      <Hatch x1={end.x - px * 9} y1={end.y - py * 9} x2={end.x + px * 9} y2={end.y + py * 9} dx={dir.x * 5 - px * 4} dy={dir.y * 5 - py * 4} color={color} />
    </g>
  );
}

/** Símbolo de apoio na posição p (pixels). */
export function SupportGlyph({ p, s, color = 'var(--member)' }: { p: Pt; s: Support; color?: string }) {
  const { x, y } = p;
  const parts: ReactNode[] = [];
  const tri = (dir: 'down' | 'left', rollers: boolean) => {
    if (dir === 'down') {
      parts.push(<polygon key="t" points={`${x},${y + 3} ${x - 10},${y + 19} ${x + 10},${y + 19}`} fill="#fff" stroke={color} strokeWidth={1.5} />);
      const base = rollers ? y + 24 : y + 19;
      if (rollers) parts.push(<line key="r" x1={x - 13} y1={y + 22} x2={x + 13} y2={y + 22} stroke={color} strokeWidth={1.5} />);
      parts.push(<line key="b" x1={x - 14} y1={base} x2={x + 14} y2={base} stroke={color} strokeWidth={1.5} />);
      parts.push(<Hatch key="h" x1={x - 14} y1={base} x2={x + 14} y2={base} dx={-5} dy={6} color={color} />);
    } else {
      parts.push(<polygon key="t" points={`${x - 3},${y} ${x - 19},${y - 10} ${x - 19},${y + 10}`} fill="#fff" stroke={color} strokeWidth={1.5} />);
      const base = rollers ? x - 24 : x - 19;
      if (rollers) parts.push(<line key="r" x1={x - 22} y1={y - 13} x2={x - 22} y2={y + 13} stroke={color} strokeWidth={1.5} />);
      parts.push(<line key="b" x1={base} y1={y - 14} x2={base} y2={y + 14} stroke={color} strokeWidth={1.5} />);
      parts.push(<Hatch key="h" x1={base} y1={y - 14} x2={base} y2={y + 14} dx={-6} dy={5} color={color} />);
    }
  };
  if (s.rx && s.ry && s.rz) {
    parts.push(<line key="f" x1={x - 16} y1={y} x2={x + 16} y2={y} stroke={color} strokeWidth={2.4} />);
    parts.push(<Hatch key="fh" x1={x - 16} y1={y} x2={x + 16} y2={y} dx={-6} dy={8} color={color} />);
  } else if (s.rz) {
    // engaste deslizante
    parts.push(<rect key="q" x={x - 7} y={y - 7} width={14} height={14} fill="none" stroke={color} strokeWidth={1.5} />);
    if (s.ry) {
      parts.push(<line key="b" x1={x - 14} y1={y + 12} x2={x + 14} y2={y + 12} stroke={color} strokeWidth={1.5} />);
      parts.push(<Hatch key="h" x1={x - 14} y1={y + 12} x2={x + 14} y2={y + 12} dx={-5} dy={6} color={color} />);
    }
    if (s.rx) {
      parts.push(<line key="bx" x1={x - 12} y1={y - 14} x2={x - 12} y2={y + 14} stroke={color} strokeWidth={1.5} />);
      parts.push(<Hatch key="hx" x1={x - 12} y1={y - 14} x2={x - 12} y2={y + 14} dx={-6} dy={5} color={color} />);
    }
  } else if (s.rx && s.ry) tri('down', false);
  else if (s.ry) tri('down', true);
  else if (s.rx) tri('left', true);
  if (!s.ry && s.ky) parts.push(<Spring key="ky" from={{ x, y }} dir={{ x: 0, y: 1 }} color={color} />);
  if (!s.rx && s.kx) parts.push(<Spring key="kx" from={{ x, y }} dir={{ x: -1, y: 0 }} color={color} />);
  if (!s.rz && s.kz) parts.push(<circle key="kz" cx={x} cy={y} r={9} fill="none" stroke={color} strokeDasharray="3 2" strokeWidth={1.4} />);
  return <g>{parts}</g>;
}

/** Rótula desenhada sobre a barra, perto do nó (dir: unitário da barra saindo do nó, em pixels). */
export function HingeGlyph({ p, dir }: { p: Pt; dir: Pt }) {
  return <circle cx={p.x + dir.x * 8} cy={p.y + dir.y * 8} r={4.2} fill="#fff" stroke="var(--member)" strokeWidth={1.6} />;
}
