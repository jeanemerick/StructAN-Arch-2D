import { useMemo, useState } from 'react';
import type { ArcShape, Section } from '../../model/types';
import { compileArcCurve, NSEG_MAX, NSEG_MIN } from '../../model/curve';
import { arcBetween, parabola } from '../../model/presets';
import { Field, FormScope, NumField } from '../widgets';
import { curvePolyline, type Pt } from '../geometry';

export type ArcMode = 'nodes' | 'free';

/** Rascunho do arco novo: entre dois nós (forma e altura) ou por equação livre y = f(x). */
export interface ArcDraft {
  mode: ArcMode;
  pi: Pt | null;
  pj: Pt | null;
  shape: ArcShape;
  rise: number;
  expr: string;
  xi: number;
  xj: number;
  nSeg: number;
  sectionId: string;
}

export function defaultDraft(sectionId: string): ArcDraft {
  return { mode: 'nodes', pi: null, pj: null, shape: 'parabola', rise: 1.5, expr: parabola(0, 0, 20, 5), xi: 0, xj: 20, nSeg: 40, sectionId };
}

export const SHAPE_LABEL: Record<ArcShape, string> = {
  parabola: 'Parábola',
  circular: 'Arco circular',
  catenary: 'Catenária',
};

const segError = (n: number) => (!Number.isInteger(n) || n < NSEG_MIN || n > NSEG_MAX ? `Segmentos: inteiro entre ${NSEG_MIN} e ${NSEG_MAX}` : null);

/** Equação e limites que o rascunho vai gerar, ou a mensagem de erro (null enquanto faltam os nós). */
export function draftCurve(d: ArcDraft): { expr: string; xi: number; xj: number } | { error: string } | null {
  const se = segError(d.nSeg);
  if (d.mode === 'free') {
    if (se) return { error: se };
    const c = compileArcCurve(d.expr, d.xi, d.xj);
    return c.ok ? { expr: d.expr, xi: d.xi, xj: d.xj } : { error: c.error };
  }
  if (!complete(d.pi) || !complete(d.pj)) return null;
  if (se) return { error: se };
  try {
    return arcBetween(d.shape, d.pi, d.pj, d.rise);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function draftPreview(d: ArcDraft): Pt[] | null {
  const c = draftCurve(d);
  if (!c || 'error' in c) return null;
  return curvePolyline(c.expr, c.xi, c.xj);
}

const complete = (p: Pt | null): p is Pt => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Próximo ponto que um clique no desenho preenche. */
export function nextPick(d: ArcDraft): 'pi' | 'pj' {
  return complete(d.pi) && !complete(d.pj) ? 'pj' : 'pi';
}

/** Aplica um clique no desenho: primeiro o nó inicial, depois o final; com os dois, recomeça. */
export function pickPoint(d: ArcDraft, p: Pt): ArcDraft {
  return nextPick(d) === 'pj' ? { ...d, pj: p } : { ...d, pi: p, pj: null };
}

const EXPR_HELP = 'Aceita x, pi, e, + − * / ^ e as funções sqrt, sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, ln, log, abs. Multiplicação sempre com * (2*x).';

interface Props {
  draft: ArcDraft;
  setDraft(d: ArcDraft): void;
  sections: Section[];
  onSubmit(d: ArcDraft): string | null;
  onCancel(): void;
}

/** Formulário do arco novo. Enter cria; Esc fecha. */
export function NewArcForm({ draft, setDraft, sections, onSubmit, onCancel }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const curve = useMemo(() => draftCurve(draft), [draft]);
  const error = curve && 'error' in curve ? curve.error : null;
  const ready = !!curve && !error;
  const set = (p: Partial<ArcDraft>) => {
    setSubmitError(null);
    setDraft({ ...draft, ...p });
  };
  const submit = () => {
    if (!ready) {
      setSubmitError(error ?? 'Escolha o nó inicial e o nó final do arco');
      return;
    }
    setSubmitError(onSubmit(draft));
  };
  const coord = (which: 'pi' | 'pj', axis: 'x' | 'y') => (v: number) => set({ [which]: { ...(draft[which] ?? { x: NaN, y: NaN }), [axis]: v } });
  const pickHint = nextPick(draft) === 'pi' ? 'Clique no desenho para escolher o nó inicial' : 'Clique no desenho para escolher o nó final';

  return (
    <FormScope onSubmit={submit} onCancel={onCancel} testid="arc-form">
      <h3>Novo arco</h3>
      <div className="chips" role="tablist">
        <button className={`chip${draft.mode === 'nodes' ? ' active' : ''}`} data-testid="arc-mode-nodes" onClick={() => set({ mode: 'nodes' })}>
          Entre dois nós
        </button>
        <button className={`chip${draft.mode === 'free' ? ' active' : ''}`} data-testid="arc-mode-free" onClick={() => set({ mode: 'free' })}>
          Equação livre (avançado)
        </button>
      </div>

      {draft.mode === 'nodes' ? (
        <>
          <p className="help">
            {pickHint} (nós existentes e a grade atraem o clique), ou digite as coordenadas. A equação é gerada sozinha e o arco fica preso aos dois nós.
          </p>
          <div className="grid2">
            <Field label="Nó inicial: X">
              <NumField value={draft.pi?.x ?? NaN} unit="m" testid="arc-xi" onCommit={coord('pi', 'x')} />
            </Field>
            <Field label="Y">
              <NumField value={draft.pi?.y ?? NaN} unit="m" testid="arc-yi" onCommit={coord('pi', 'y')} />
            </Field>
            <Field label="Nó final: X">
              <NumField value={draft.pj?.x ?? NaN} unit="m" testid="arc-xj" onCommit={coord('pj', 'x')} />
            </Field>
            <Field label="Y">
              <NumField value={draft.pj?.y ?? NaN} unit="m" testid="arc-yj" onCommit={coord('pj', 'y')} />
            </Field>
            <Field label="Forma">
              <select className="sel" id="arc-shape" data-testid="arc-shape" value={draft.shape} onChange={(e) => set({ shape: e.target.value as ArcShape })}>
                {(Object.keys(SHAPE_LABEL) as ArcShape[]).map((k) => (
                  <option key={k} value={k}>
                    {SHAPE_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Altura do arco f">
              <NumField value={draft.rise} unit="m" testid="arc-rise" valid={(v) => v > 0} onCommit={(rise) => set({ rise })} />
            </Field>
          </div>
          <p className="help">A altura do arco é medida na vertical, a partir da corda entre os dois nós, no meio do vão.</p>
        </>
      ) : (
        <>
          <Field label="y = f(x)">
            <input
              type="text"
              className="text expr"
              id="arc-expr"
              value={draft.expr}
              spellCheck={false}
              data-testid="arc-expr"
              onChange={(e) => set({ expr: e.target.value })}
            />
          </Field>
          <div className="grid2" style={{ marginTop: 6 }}>
            <Field label="x inicial">
              <NumField value={draft.xi} unit="m" testid="arc-fxi" onCommit={(xi) => set({ xi })} />
            </Field>
            <Field label="x final">
              <NumField value={draft.xj} unit="m" testid="arc-fxj" onCommit={(xj) => set({ xj })} />
            </Field>
          </div>
          <p className="help">{EXPR_HELP}</p>
        </>
      )}

      <div className="grid2" style={{ marginTop: 6 }}>
        <Field label="Segmentos">
          <NumField value={draft.nSeg} testid="arc-nseg" valid={(v) => Number.isInteger(v) && v >= NSEG_MIN && v <= NSEG_MAX} onCommit={(nSeg) => set({ nSeg })} />
        </Field>
        <Field label="Seção">
          <select className="sel" id="arc-section" value={draft.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {(submitError ?? error) && (
        <div className="err" data-testid="arc-error">
          {submitError ?? error}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={!ready} data-testid="arc-submit" onClick={submit}>
          Criar arco
        </button>
        <button className="btn outline" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      <p className="help">Enter cria o arco; Esc fecha o formulário.</p>
    </FormScope>
  );
}

/** Edição do arco já criado: forma e altura (arco gerado entre nós) ou equação livre. */
export interface ArcEditDraft {
  shape: ArcShape;
  rise: number;
  expr: string;
  xi: number;
  xj: number;
  nSeg: number;
}

export function ArcEditFields({
  draft,
  setDraft,
  generated,
  error,
  onSubmit,
  onReset,
  onFree,
}: {
  draft: ArcEditDraft;
  setDraft(d: ArcEditDraft): void;
  generated: boolean;
  error: string | null;
  onSubmit(): void;
  onReset(): void;
  onFree?(): void;
}) {
  const set = (p: Partial<ArcEditDraft>) => setDraft({ ...draft, ...p });
  const free = !generated;
  const exprError = useMemo(() => {
    if (!free) return null;
    const c = compileArcCurve(draft.expr, draft.xi, draft.xj);
    return c.ok ? segError(draft.nSeg) : c.error;
  }, [free, draft]);
  return (
    <FormScope onSubmit={onSubmit} onCancel={onReset} testid="arc-edit">
      {generated ? (
        <div className="grid2">
          <Field label="Forma">
            <select className="sel" id="arcedit-shape" data-testid="arcedit-shape" value={draft.shape} onChange={(e) => set({ shape: e.target.value as ArcShape })}>
              {(Object.keys(SHAPE_LABEL) as ArcShape[]).map((k) => (
                <option key={k} value={k}>
                  {SHAPE_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Altura do arco f">
            <NumField value={draft.rise} unit="m" testid="arcedit-rise" valid={(v) => v > 0} onCommit={(rise) => set({ rise })} />
          </Field>
        </div>
      ) : (
        <>
          <Field label="y = f(x)">
            <input type="text" className="text expr" id="arcedit-expr" value={draft.expr} spellCheck={false} data-testid="arcedit-expr" onChange={(e) => set({ expr: e.target.value })} />
          </Field>
          <div className="grid2" style={{ marginTop: 6 }}>
            <Field label="x inicial">
              <NumField value={draft.xi} unit="m" testid="arcedit-xi" onCommit={(xi) => set({ xi })} />
            </Field>
            <Field label="x final">
              <NumField value={draft.xj} unit="m" testid="arcedit-xj" onCommit={(xj) => set({ xj })} />
            </Field>
          </div>
          <p className="help">{EXPR_HELP}</p>
        </>
      )}
      <div className="grid2" style={{ marginTop: 6 }}>
        <Field label="Segmentos">
          <NumField value={draft.nSeg} testid="arcedit-nseg" valid={(v) => Number.isInteger(v) && v >= NSEG_MIN && v <= NSEG_MAX} onCommit={(nSeg) => set({ nSeg })} />
        </Field>
      </div>
      {(error ?? exprError) && (
        <div className="err" data-testid="arcedit-error">
          {error ?? exprError}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" data-testid="arcedit-submit" disabled={!!exprError} onClick={onSubmit}>
          Aplicar ao arco
        </button>
        {generated && onFree && (
          <button className="btn outline" data-testid="arcedit-free" onClick={onFree}>
            Editar a equação
          </button>
        )}
      </div>
      {generated && <p className="help">Arco gerado entre as nascenças: mover uma delas refaz a curva.</p>}
    </FormScope>
  );
}
