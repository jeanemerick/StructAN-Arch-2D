import { useEffect, useState, type Dispatch } from 'react';
import type { Model, Section, Shape } from '../../model/types';
import { addSection, deleteSection, sectionArea, sectionProps, updateSection } from '../../model/ops';
import type { Action } from '../state';
import { Field, NumField } from '../widgets';
import { formatValue, UNIT } from '../format';

function NameInput({ id, value, onCommit }: { id: string; value: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="text"
      className="text"
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft.trim() ? onCommit(draft.trim()) : setDraft(value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

const SHAPE_LABEL: Record<Shape['kind'], string> = {
  rect: 'Retangular',
  circ: 'Circular',
  generic: 'Genérica (A, I)',
  direct: 'Rigidez direta (EA, EI)',
};

function defaultShape(kind: Shape['kind'], s: Section): Shape {
  if (kind === 'rect') return { kind, b: 0.2, h: 0.4 };
  if (kind === 'circ') return { kind, d: 0.3 };
  const geo = sectionArea(s);
  if (kind === 'generic') return geo ? { kind, A: geo.A, I: geo.I } : { kind, A: 0.08, I: 0.001 };
  const { EA, EI } = sectionProps(s);
  return { kind, EA, EI };
}

function withoutH(sh: Extract<Shape, { kind: 'generic' | 'direct' }>): Shape {
  const { h: _h, ...rest } = sh;
  return rest as Shape;
}

export function SectionsPanel({ model, dispatch }: { model: Model; dispatch: Dispatch<Action> }) {
  const [err, setErr] = useState<string | null>(null);
  const apply = (fn: (m: Model) => Model) => dispatch({ type: 'apply', fn });
  const pos = (v: number) => v > 0;
  const nonNeg = (v: number) => v >= 0;
  return (
    <div data-testid="sections-panel">
      <h3>Seções</h3>
      <p className="help">
        E em GPa, dimensões em cm. Em <b>Rigidez direta</b>, EA e EI são digitados (a barra somente axial só precisa de EA; a somente flexão, só de EI). As barras recebem a seção no
        painel de propriedades.
      </p>
      {model.sections.map((s) => {
        const geo = sectionArea(s);
        const { EA, EI } = sectionProps(s);
        const users = model.members.filter((k) => k.sectionId === s.id).length;
        const setShape = (shape: Shape) => apply((m) => updateSection(m, s.id, { shape }));
        const sh = s.shape;
        const direct = sh.kind === 'direct';
        return (
          <div key={s.id} className="card" data-testid={`section-${s.id}`}>
            <div className="card-head">
              <NameInput id={`section-name-${s.id}`} value={s.name} onCommit={(name) => apply((m) => updateSection(m, s.id, { name }))} />
              <button
                className="btn danger"
                title={users ? 'Seção atribuída a barras' : 'Remover seção'}
                disabled={users > 0 || model.sections.length <= 1}
                onClick={() => {
                  const r = deleteSection(model, s.id);
                  if ('error' in r) setErr(r.error);
                  else apply(() => r);
                }}
              >
                ✕
              </button>
            </div>
            <div className="grid2">
              <Field label="Tipo">
                <select className="sel" id={`section-kind-${s.id}`} value={sh.kind} onChange={(e) => setShape(defaultShape(e.target.value as Shape['kind'], s))}>
                  {(Object.keys(SHAPE_LABEL) as Shape['kind'][]).map((k) => (
                    <option key={k} value={k}>
                      {SHAPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              {!direct && (
                <Field label="E">
                  <NumField value={s.E} unit="GPa" factor={UNIT.GPa} valid={pos} testid={`section-E-${s.id}`} onCommit={(E) => apply((m) => updateSection(m, s.id, { E }))} />
                </Field>
              )}
              {sh.kind === 'rect' && (
                <>
                  <Field label="Base b">
                    <NumField value={sh.b} unit="cm" factor={UNIT.cm} valid={pos} onCommit={(b) => setShape({ ...sh, b })} />
                  </Field>
                  <Field label="Altura h">
                    <NumField value={sh.h} unit="cm" factor={UNIT.cm} valid={pos} onCommit={(h) => setShape({ ...sh, h })} />
                  </Field>
                </>
              )}
              {sh.kind === 'circ' && (
                <Field label="Diâmetro d">
                  <NumField value={sh.d} unit="cm" factor={UNIT.cm} valid={pos} onCommit={(d) => setShape({ kind: 'circ', d })} />
                </Field>
              )}
              {sh.kind === 'generic' && (
                <>
                  <Field label="Área A">
                    <NumField value={sh.A} unit="cm²" factor={UNIT.cm2} valid={nonNeg} onCommit={(Av) => setShape({ ...sh, A: Av })} />
                  </Field>
                  <Field label="Inércia I">
                    <NumField value={sh.I} unit="cm⁴" factor={UNIT.cm4} valid={nonNeg} onCommit={(Iv) => setShape({ ...sh, I: Iv })} />
                  </Field>
                </>
              )}
              {sh.kind === 'direct' && (
                <>
                  <Field label="EA">
                    <NumField value={sh.EA} unit="kN" valid={nonNeg} testid={`section-EA-${s.id}`} onCommit={(v) => setShape({ ...sh, EA: v })} />
                  </Field>
                  <Field label="EI">
                    <NumField value={sh.EI} unit="kN·m²" valid={nonNeg} testid={`section-EI-${s.id}`} onCommit={(v) => setShape({ ...sh, EI: v })} />
                  </Field>
                </>
              )}
              {(sh.kind === 'generic' || sh.kind === 'direct') && (
                <Field label="Altura h (gradiente)">
                  <NumField
                    value={sh.h ?? 0}
                    unit="cm"
                    factor={UNIT.cm}
                    valid={nonNeg}
                    title="Altura da seção, só para o gradiente de temperatura (0 = não informada)"
                    onCommit={(h) => setShape(h > 0 ? { ...sh, h } : withoutH(sh))}
                  />
                </Field>
              )}
              <Field label="α (dilatação)">
                <NumField value={s.alpha} unit="×10⁻⁵/°C" factor={1e-5} valid={nonNeg} testid={`section-alpha-${s.id}`} onCommit={(alpha) => apply((m) => updateSection(m, s.id, { alpha }))} />
              </Field>
            </div>
            <p className="help">
              {geo ? `A = ${formatValue(geo.A / UNIT.cm2)} cm² · I = ${formatValue(geo.I / UNIT.cm4)} cm⁴ · ` : ''}EA = {formatValue(EA)} kN · EI = {formatValue(EI)} kN·m² · {users} barra(s)
            </p>
          </div>
        );
      })}
      {err && <div className="err">{err}</div>}
      <button className="btn outline" onClick={() => apply((m) => addSection(m).model)}>
        + Nova seção
      </button>
    </div>
  );
}
