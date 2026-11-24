import { Arrow, HingeGlyph, Label, MomentArrow, SupportGlyph } from '../glyphs';
import type { Support } from '../../model/types';

/** Figuras do manual, em SVG e com as cores do tema. */

export function FigAxes() {
  return (
    <svg viewBox="0 0 520 190" className="help-fig" role="img" aria-label="Eixos globais e locais">
      <g>
        <Arrow x1={40} y1={150} x2={130} y2={150} color="var(--ink)" width={1.6} />
        <Arrow x1={40} y1={150} x2={40} y2={60} color="var(--ink)" width={1.6} />
        <Label x={138} y={150} anchor="start">X</Label>
        <Label x={40} y={48}>Y</Label>
        <MomentArrow p={{ x: 40, y: 150 }} ccw color="var(--accent)" r={18} />
        <Label x={70} y={176} color="var(--muted)">eixos globais</Label>
      </g>
      <g>
        <line x1={210} y1={150} x2={360} y2={70} stroke="var(--member)" strokeWidth={2.4} />
        <circle cx={210} cy={150} r={4} fill="var(--glyph-fill)" stroke="var(--member)" strokeWidth={1.6} />
        <circle cx={360} cy={70} r={4} fill="var(--glyph-fill)" stroke="var(--member)" strokeWidth={1.6} />
        <Label x={200} y={166}>i (inicial)</Label>
        <Label x={372} y={60} anchor="start">j (final)</Label>
        <Arrow x1={285} y1={110} x2={335} y2={83} color="var(--accent)" width={1.6} />
        <Label x={340} y={92} anchor="start" color="var(--accent)">x local</Label>
      </g>
      <g>
        <Arrow x1={285} y1={110} x2={258} y2={60} color="var(--pos)" width={1.6} />
        <Label x={250} y={50} color="var(--pos)">+y local (90° anti-horário)</Label>
      </g>
      <Label x={290} y={186} color="var(--muted)">barra: x local de i para j; arcos sempre da esquerda para a direita</Label>
    </svg>
  );
}

export function FigSigns() {
  // trecho de barra horizontal com os três esforços positivos nas duas faces
  return (
    <svg viewBox="0 0 560 200" className="help-fig" role="img" aria-label="Convenção de sinais de N, Q e M">
      {[
        { x: 20, title: 'N > 0: tração', kind: 'N' },
        { x: 200, title: 'Q > 0: gira no sentido horário', kind: 'Q' },
        { x: 380, title: 'M > 0: traciona a fibra −y', kind: 'M' },
      ].map(({ x, title, kind }) => (
        <g key={kind}>
          <rect x={x + 40} y={80} width={80} height={26} fill="var(--accent-soft)" stroke="var(--member)" strokeWidth={1.4} />
          {kind === 'N' && (
            <>
              <Arrow x1={x + 40} y1={93} x2={x + 6} y2={93} color="var(--pos)" width={2} />
              <Arrow x1={x + 120} y1={93} x2={x + 154} y2={93} color="var(--pos)" width={2} />
            </>
          )}
          {kind === 'Q' && (
            <>
              <Arrow x1={x + 30} y1={130} x2={x + 30} y2={70} color="var(--pos)" width={2} />
              <Arrow x1={x + 130} y1={56} x2={x + 130} y2={116} color="var(--pos)" width={2} />
            </>
          )}
          {kind === 'M' && (
            <>
              <MomentArrow p={{ x: x + 34, y: 93 }} ccw={false} color="var(--pos)" r={16} />
              <MomentArrow p={{ x: x + 126, y: 93 }} ccw color="var(--pos)" r={16} />
              <line x1={x + 42} y1={110} x2={x + 118} y2={110} stroke="var(--neg)" strokeWidth={2} strokeDasharray="4 3" />
              <Label x={x + 80} y={124} color="var(--neg)" size={11}>
                fibra tracionada
              </Label>
            </>
          )}
          <Label x={x + 80} y={160} weight={600}>
            {title}
          </Label>
        </g>
      ))}
      <Label x={280} y={190} color="var(--muted)">
        o diagrama de M é desenhado do lado tracionado; N e Q, do lado +y local
      </Label>
    </svg>
  );
}

export function FigThermal() {
  return (
    <svg viewBox="0 0 520 170" className="help-fig" role="img" aria-label="Faces externa e interna para a temperatura">
      <rect x={40} y={70} width={180} height={30} fill="var(--accent-soft)" stroke="var(--member)" strokeWidth={1.4} />
      <Label x={130} y={56} color="var(--neg)">face externa (+y): T_ext</Label>
      <Label x={130} y={116} color="var(--pos)">face interna (−y): T_int</Label>
      <Arrow x1={40} y1={140} x2={220} y2={140} color="var(--muted)" width={1.2} />
      <Label x={130} y={156} color="var(--muted)" size={11}>
        barra desenhada da esquerda para a direita
      </Label>
      <path d="M 290 140 Q 390 0 490 140" fill="none" stroke="var(--member)" strokeWidth={14} strokeOpacity={0.25} />
      <path d="M 290 140 Q 390 0 490 140" fill="none" stroke="var(--member)" strokeWidth={1.6} />
      <Label x={390} y={44} color="var(--neg)">extradorso (+y): T_ext</Label>
      <Label x={390} y={110} color="var(--pos)">intradorso (−y): T_int</Label>
    </svg>
  );
}

export function FigProjection() {
  return (
    <svg viewBox="0 0 520 190" className="help-fig" role="img" aria-label="Carga por comprimento e por projeção">
      <line x1={60} y1={160} x2={220} y2={70} stroke="var(--member)" strokeWidth={2.4} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const t = i / 6;
        const x = 60 + 160 * t;
        const y = 160 - 90 * t;
        return <Arrow key={i} x1={x} y1={y - 30} x2={x} y2={y - 4} color="var(--load)" width={1.1} head={5} />;
      })}
      <Label x={140} y={40} color="var(--load)">por comprimento: q por metro de barra</Label>
      <line x1={300} y1={160} x2={460} y2={70} stroke="var(--member)" strokeWidth={2.4} />
      <rect x={300} y={32} width={160} height={24} fill="var(--load)" fillOpacity={0.08} stroke="var(--load)" strokeWidth={1} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const x = 300 + (160 * i) / 6;
        return <Arrow key={i} x1={x} y1={32} x2={x} y2={56} color="var(--load)" width={1.1} head={5} />;
      })}
      <line x1={300} y1={176} x2={460} y2={176} stroke="var(--muted)" strokeWidth={1} />
      <Label x={380} y={22} color="var(--load)">por projeção: q por metro em planta</Label>
      <Label x={380} y={186} color="var(--muted)" size={11}>
        projeção horizontal
      </Label>
    </svg>
  );
}

const SUPPORTS: { s: Support; name: string }[] = [
  { s: { rx: false, ry: true, rz: false }, name: '1º gênero (vertical)' },
  { s: { rx: true, ry: false, rz: false }, name: '1º gênero (horizontal)' },
  { s: { rx: true, ry: true, rz: false }, name: '2º gênero' },
  { s: { rx: true, ry: true, rz: true }, name: 'Engaste' },
  { s: { rx: false, ry: false, rz: false, ky: 1000 }, name: 'Mola em Y' },
];

export function FigSupports() {
  return (
    <svg viewBox="0 0 600 130" className="help-fig" role="img" aria-label="Tipos de apoio">
      {SUPPORTS.map((x, i) => {
        const cx = 60 + i * 120;
        return (
          <g key={x.name}>
            <line x1={cx - 30} y1={50} x2={cx} y2={50} stroke="var(--member)" strokeWidth={2.4} />
            <SupportGlyph p={{ x: cx, y: 50 }} s={x.s} />
            <circle cx={cx} cy={50} r={3.6} fill="var(--glyph-fill)" stroke="var(--member)" strokeWidth={1.6} />
            <Label x={cx} y={112} size={11}>
              {x.name}
            </Label>
          </g>
        );
      })}
    </svg>
  );
}

export function FigBarTypes() {
  return (
    <svg viewBox="0 0 560 110" className="help-fig" role="img" aria-label="Desenho dos tipos de barra">
      <line x1={30} y1={50} x2={160} y2={50} stroke="var(--member)" strokeWidth={2.4} />
      <Label x={95} y={86}>Pórtico (EA e EI)</Label>
      <line x1={210} y1={50} x2={340} y2={50} stroke="var(--member)" strokeWidth={1.3} />
      <HingeGlyph p={{ x: 210, y: 50 }} dir={{ x: 1, y: 0 }} />
      <HingeGlyph p={{ x: 340, y: 50 }} dir={{ x: -1, y: 0 }} />
      <Label x={275} y={38} color="var(--muted)" size={11}>
        EA
      </Label>
      <Label x={275} y={86}>Somente axial</Label>
      <line x1={390} y1={50} x2={520} y2={50} stroke="var(--member)" strokeWidth={4.6} />
      <line x1={390} y1={50} x2={520} y2={50} stroke="var(--canvas)" strokeWidth={1.6} />
      <Label x={455} y={38} color="var(--muted)" size={11}>
        EI
      </Label>
      <Label x={455} y={86}>Somente flexão</Label>
    </svg>
  );
}
