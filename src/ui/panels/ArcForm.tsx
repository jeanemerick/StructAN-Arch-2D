import { useMemo, useState } from 'react';
import type { Section } from '../../model/types';
import { compileArcCurve, NSEG_MAX, NSEG_MIN } from '../../model/curve';
import { catenary, circular, parabola } from '../../model/presets';
import { Field, NumField } from '../widgets';

export type Preset = 'free' | 'parabola' | 'circular' | 'catenary';

export interface ArcDraft {
  preset: Preset;
  expr: string;
  xi: number;
  xj: number;
  nSeg: number;
  x0: number;
  y0: number;
  L: number;
  f: number;
  sectionId: string;
}

export function defaultDraft(sectionId: string): ArcDraft {
  return { preset: 'parabola', expr: parabola(0, 0, 20, 5), xi: 0, xj: 20, nSeg: 40, x0: 0, y0: 0, L: 20, f: 5, sectionId };
}

const PRESET_LABEL: Record<Preset, string> = {
  free: 'Equação livre',
  parabola: 'Parábola',
  circular: 'Arco circular',
  catenary: 'Catenária',
};

/** Recalcula equação e limites a partir do modelo pronto. */
export function applyPreset(d: ArcDraft): { draft: ArcDraft; error: string | null } {
  if (d.preset === 'free') return { draft: d, error: null };
  try {
    const gen = d.preset === 'parabola' ? parabola : d.preset === 'circular' ? circular : catenary;
    if (!(d.L > 0) || !(d.f > 0)) throw new Error('Vão e flecha devem ser positivos');
    return { draft: { ...d, expr: gen(d.x0, d.y0, d.L, d.f), xi: d.x0, xj: d.x0 + d.L }, error: null };
  } catch (e) {
    return { draft: d, error: (e as Error).message };
  }
}

/** Mensagem de erro da equação/limites ou null. */
export function draftError(d: ArcDraft): string | null {
  if (!Number.isInteger(d.nSeg) || d.nSeg < NSEG_MIN || d.nSeg > NSEG_MAX) return `Segmentos: inteiro entre ${NSEG_MIN} e ${NSEG_MAX}`;
  const c = compileArcCurve(d.expr, d.xi, d.xj);
  return c.ok ? null : c.error;
}

interface Props {
  draft: ArcDraft;
  setDraft(d: ArcDraft): void;
  sections?: Section[];
  submitLabel: string;
  onSubmit(d: ArcDraft): string | null;
  testPrefix?: string;
}

/** Formulário do arco: modelo pronto ou equação livre y = f(x), limites e segmentos. */
export function ArcFields({ draft, setDraft, sections, submitLabel, onSubmit, testPrefix = 'arc' }: Props) {
  const [presetError, setPresetError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const error = useMemo(() => draftError(draft), [draft]);

  const update = (p: Partial<ArcDraft>) => {
    const next = { ...draft, ...p };
    const r = applyPreset(next);
    setPresetError(r.error);
    setSubmitError(null);
    setDraft(r.draft);
  };

  return (
    <div>
      <Field label="Modelo pronto">
        <select className="sel" id={`${testPrefix}-preset`} value={draft.preset} data-testid={`${testPrefix}-preset`} onChange={(e) => update({ preset: e.target.value as Preset })}>
          {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
        </select>
      </Field>
      {draft.preset !== 'free' && (
        <div className="grid2" style={{ marginTop: 8 }}>
          <Field label="x inicial (nascença)">
            <NumField value={draft.x0} unit="m" onCommit={(x0) => update({ x0 })} />
          </Field>
          <Field label="y das nascenças">
            <NumField value={draft.y0} unit="m" onCommit={(y0) => update({ y0 })} />
          </Field>
          <Field label="Vão L">
            <NumField value={draft.L} unit="m" testid={`${testPrefix}-span`} valid={(v) => v > 0} onCommit={(L) => update({ L })} />
          </Field>
          <Field label="Flecha f">
            <NumField value={draft.f} unit="m" testid={`${testPrefix}-rise`} valid={(v) => v > 0} onCommit={(f) => update({ f })} />
          </Field>
        </div>
      )}
      {presetError && <div className="err">{presetError}</div>}

      <div style={{ marginTop: 10 }}>
        <Field label="y = f(x)">
          <input
            type="text"
            className="text expr"
            id={`${testPrefix}-expr`}
            value={draft.expr}
            spellCheck={false}
            data-testid={`${testPrefix}-expr`}
            onChange={(e) => {
              setSubmitError(null);
              setDraft({ ...draft, expr: e.target.value, preset: 'free' });
            }}
          />
        </Field>
      </div>
      <div className="grid3" style={{ marginTop: 6 }}>
        <Field label="x inicial">
          <NumField value={draft.xi} unit="m" testid={`${testPrefix}-xi`} onCommit={(xi) => setDraft({ ...draft, xi, preset: 'free' })} />
        </Field>
        <Field label="x final">
          <NumField value={draft.xj} unit="m" testid={`${testPrefix}-xj`} onCommit={(xj) => setDraft({ ...draft, xj, preset: 'free' })} />
        </Field>
        <Field label="Segmentos">
          <NumField value={draft.nSeg} testid={`${testPrefix}-nseg`} valid={(v) => Number.isInteger(v) && v >= NSEG_MIN && v <= NSEG_MAX} onCommit={(nSeg) => setDraft({ ...draft, nSeg })} />
        </Field>
      </div>
      {sections && (
        <div style={{ marginTop: 6 }}>
          <Field label="Seção">
            <select className="sel" id={`${testPrefix}-section`} value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {(error || submitError) && (
        <div className="err" data-testid={`${testPrefix}-error`}>
          {submitError ?? error}
        </div>
      )}
      <p className="help">
        Aceita x, pi, e, + − * / ^ e as funções sqrt, sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, ln, log, abs. Multiplicação sempre com * (2*x).
      </p>
      <button
        className="btn primary"
        disabled={!!error}
        data-testid={`${testPrefix}-submit`}
        onClick={() => {
          const e = onSubmit(draft);
          setSubmitError(e);
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
