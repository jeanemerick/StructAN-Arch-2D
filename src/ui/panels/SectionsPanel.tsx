import { useEffect, useState, type Dispatch } from 'react';
import type { Model, Section, Shape } from '../../model/types';
import { addSection, deleteSection, sectionArea, updateSection } from '../../model/ops';
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

const SHAPE_LABEL: Record<Shape['kind'], string> = { rect: 'Retangular', circ: 'Circular', generic: 'Genérica (A, I)' };

function defaultShape(kind: Shape['kind'], s: Section): Shape {
  const { A, I } = sectionArea(s);
  if (kind === 'rect') return { kind, b: 0.2, h: 0.4 };
  if (kind === 'circ') return { kind, d: 0.3 };
  return { kind, A, I };
}

export function SectionsPanel({ model, dispatch }: { model: Model; dispatch: Dispatch<Action> }) {
  const [err, setErr] = useState<string | null>(null);
  const apply = (fn: (m: Model) => Model) => dispatch({ type: 'apply', fn });
  const pos = (v: number) => v > 0;
  return (
    <div data-testid="sections-panel">
      <h3>Seções</h3>
      <p className="help">E em GPa, dimensões em cm. As barras recebem a seção no painel de propriedades.</p>
      {model.sections.map((s) => {
        const { A, I } = sectionArea(s);
        const users = model.members.filter((k) => k.sectionId === s.id).length;
        const setShape = (shape: Shape) => apply((m) => updateSection(m, s.id, { shape }));
        return (
          <div key={s.id} className="card">
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
              <Field label="E">
                <NumField value={s.E} unit="GPa" factor={UNIT.GPa} valid={pos} onCommit={(E) => apply((m) => updateSection(m, s.id, { E }))} />
              </Field>
              <Field label="Tipo">
                <select className="sel" id={`section-kind-${s.id}`} value={s.shape.kind} onChange={(e) => setShape(defaultShape(e.target.value as Shape['kind'], s))}>
                  {(Object.keys(SHAPE_LABEL) as Shape['kind'][]).map((k) => (
                    <option key={k} value={k}>
                      {SHAPE_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              {s.shape.kind === 'rect' && (
                <>
                  <Field label="Base b">
                    <NumField value={s.shape.b} unit="cm" factor={UNIT.cm} valid={pos} onCommit={(b) => s.shape.kind === 'rect' && setShape({ ...s.shape, b })} />
                  </Field>
                  <Field label="Altura h">
                    <NumField value={s.shape.h} unit="cm" factor={UNIT.cm} valid={pos} onCommit={(h) => s.shape.kind === 'rect' && setShape({ ...s.shape, h })} />
                  </Field>
                </>
              )}
              {s.shape.kind === 'circ' && (
                <Field label="Diâmetro d">
                  <NumField value={s.shape.d} unit="cm" factor={UNIT.cm} valid={pos} onCommit={(d) => setShape({ kind: 'circ', d })} />
                </Field>
              )}
              {s.shape.kind === 'generic' && (
                <>
                  <Field label="Área A">
                    <NumField value={s.shape.A} unit="cm²" factor={UNIT.cm2} valid={pos} onCommit={(Av) => s.shape.kind === 'generic' && setShape({ ...s.shape, A: Av })} />
                  </Field>
                  <Field label="Inércia I">
                    <NumField value={s.shape.I} unit="cm⁴" factor={UNIT.cm4} valid={pos} onCommit={(Iv) => s.shape.kind === 'generic' && setShape({ ...s.shape, I: Iv })} />
                  </Field>
                </>
              )}
            </div>
            <p className="help">
              A = {formatValue(A / UNIT.cm2)} cm² · I = {formatValue(I / UNIT.cm4)} cm⁴ · {users} barra(s)
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
