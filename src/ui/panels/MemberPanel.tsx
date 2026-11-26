import { useEffect, useState, type Dispatch } from 'react';
import type { Arc, Behavior, DistLoad, Member, Model, Thermal } from '../../model/types';
import { deleteMember, regenerateArc, splitMember, updateArc, updateArcSegments, updateMember } from '../../model/ops';
import type { Action } from '../state';
import { Check, Field, FormScope, NumField } from '../widgets';
import { formatValue } from '../format';
import { memberPolyline } from '../geometry';
import { ArcEditFields, type ArcEditDraft } from './ArcForm';

const DIR_LABEL: Record<DistLoad['dir'], string> = {
  globalY: 'Vertical (Y global)',
  globalX: 'Horizontal (X global)',
  localY: 'Normal ao eixo (y local)',
  localX: 'Tangente ao eixo (x local)',
};

const BEHAVIOR_LABEL: Record<Behavior, string> = {
  frame: 'Pórtico',
  axial: 'Somente axial (tirante/escora)',
  bending: 'Somente flexão (inextensível)',
};

const BEHAVIOR_HELP: Record<Behavior, string> = {
  frame: 'Resiste a esforço normal e a flexão (EA e EI).',
  axial: 'Só esforço normal (EA). É sempre birrotulada e não transmite momento às outras barras.',
  bending: 'Só flexão (EI): o comprimento não muda, pois a deformação axial é desprezada.',
};

function memberLength(m: Model, k: Member): number {
  const pts = memberPolyline(m, k);
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

function ArcEditor({ arc, model, dispatch }: { arc: Arc; model: Model; dispatch: Dispatch<Action> }) {
  const ni = model.nodes.find((n) => n.id === arc.ni)!;
  const nj = model.nodes.find((n) => n.id === arc.nj)!;
  const fromArc = (): ArcEditDraft => ({ shape: arc.gen?.shape ?? 'parabola', rise: arc.gen?.rise ?? 1, expr: arc.expr, xi: ni.x, xj: nj.x, nSeg: arc.nSeg });
  const [draft, setDraft] = useState<ArcEditDraft>(fromArc);
  const [forceFree, setForceFree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(fromArc());
    setForceFree(false);
    setError(null);
  }, [arc.id, arc.expr, arc.nSeg, arc.gen?.shape, arc.gen?.rise, ni.x, nj.x]); // eslint-disable-line react-hooks/exhaustive-deps
  const generated = !!arc.gen && !forceFree;
  const submit = () => {
    let r: Model | { error: string };
    if (generated) {
      r = regenerateArc(model, arc.gen!, { shape: draft.shape, rise: draft.rise });
      if (!('error' in r)) r = updateArcSegments(r, arc.id, draft.nSeg);
    } else {
      r = updateArc(model, arc.id, { expr: draft.expr, nSeg: draft.nSeg, xi: draft.xi, xj: draft.xj });
    }
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(null);
    const next = r;
    dispatch({ type: 'apply', fn: () => next });
  };
  return (
    <ArcEditFields
      draft={draft}
      setDraft={(d) => {
        setError(null);
        setDraft(d);
      }}
      generated={generated}
      error={error}
      onSubmit={submit}
      onReset={() => {
        setDraft(fromArc());
        setError(null);
      }}
      onFree={() => setForceFree(true)}
    />
  );
}

function LoadRow({ q, onChange, onRemove, i }: { q: DistLoad; onChange(q: DistLoad): void; onRemove(): void; i: number }) {
  const global = q.dir === 'globalX' || q.dir === 'globalY';
  return (
    <div className="card" data-testid={`dist-load-${i}`}>
      <div className="card-head">
        <select className="sel" id={`dist-dir-${i}`} value={q.dir} onChange={(e) => onChange({ ...q, dir: e.target.value as DistLoad['dir'] })}>
          {(Object.keys(DIR_LABEL) as DistLoad['dir'][]).map((d) => (
            <option key={d} value={d}>
              {DIR_LABEL[d]}
            </option>
          ))}
        </select>
        <button className="btn danger" title="Remover carga" onClick={onRemove}>
          ✕
        </button>
      </div>
      {global && (
        <div className="chips" style={{ marginBottom: 6 }}>
          <button className={`chip${q.ref === 'length' ? ' active' : ''}`} onClick={() => onChange({ ...q, ref: 'length' })}>
            por comprimento
          </button>
          <button className={`chip${q.ref === 'projection' ? ' active' : ''}`} onClick={() => onChange({ ...q, ref: 'projection' })}>
            por projeção
          </button>
        </div>
      )}
      <div className="grid2">
        <Field label="Início">
          <NumField value={q.qi} unit="kN/m" testid={`dist-qi-${i}`} onCommit={(qi) => onChange({ ...q, qi, qj: q.qi === q.qj ? qi : q.qj })} />
        </Field>
        <Field label="Fim">
          <NumField value={q.qj} unit="kN/m" testid={`dist-qj-${i}`} onCommit={(qj) => onChange({ ...q, qj })} />
        </Field>
      </div>
    </div>
  );
}

export function MemberPanel({ member, model, dispatch }: { member: Member; model: Model; dispatch: Dispatch<Action> }) {
  const apply = (fn: (m: Model) => Model) => dispatch({ type: 'apply', fn });
  const ni = model.nodes.find((n) => n.id === member.ni);
  const nj = model.nodes.find((n) => n.id === member.nj);
  const [splitAt, setSplitAt] = useState<number>(0.5);
  const isArc = member.kind === 'arc';
  useEffect(() => {
    if (ni && nj) setSplitAt(isArc ? (ni.x + nj.x) / 2 : 0.5);
  }, [member.id, ni?.x, nj?.x, isArc]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ni || !nj) return null;

  const setLoads = (loads: DistLoad[]) => apply((m) => updateMember(m, member.id, { loads }));
  const doSplit = () => {
    try {
      const r = splitMember(model, member.id, splitAt);
      dispatch({ type: 'apply', fn: () => r.model, select: { kind: 'node', id: r.nodeId } });
    } catch {
      /* posição inválida: o botão já fica desativado */
    }
  };
  const setThermal = (p: Partial<Thermal>) => {
    const next = { tExt: member.thermal?.tExt ?? 0, tInt: member.thermal?.tInt ?? 0, ...p };
    apply((m) => updateMember(m, member.id, { thermal: next.tExt === 0 && next.tInt === 0 ? undefined : next }));
  };
  const splitValid = isArc ? splitAt > ni.x && splitAt < nj.x : splitAt > 0 && splitAt < 1;

  return (
    <div data-testid="member-panel">
      <h3>
        {isArc ? 'Arco' : 'Barra'} {member.id}
      </h3>
      <p className="help">
        Nó {member.ni} → nó {member.nj} · comprimento {formatValue(memberLength(model, member))} m
      </p>

      <div className="row">
        <span className="lbl">Seção</span>
        <select className="sel" id="member-section" value={member.sectionId} data-testid="member-section" onChange={(e) => apply((m) => updateMember(m, member.id, { sectionId: e.target.value }))}>
          {model.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <span className="lbl">Tipo de barra</span>
        <select
          className="sel"
          id="member-behavior"
          data-testid="member-behavior"
          value={member.behavior}
          onChange={(e) => apply((m) => updateMember(m, member.id, { behavior: e.target.value as Behavior }))}
        >
          {(Object.keys(BEHAVIOR_LABEL) as Behavior[])
            .filter((b) => !isArc || b !== 'axial')
            .map((b) => (
              <option key={b} value={b}>
                {BEHAVIOR_LABEL[b]}
              </option>
            ))}
        </select>
      </div>
      <p className="help">{BEHAVIOR_HELP[member.behavior]}</p>
      <div className="row">
        <span className="lbl">Rótulas</span>
        {member.behavior === 'axial' ? (
          <span className="help">nas duas pontas (barra somente axial)</span>
        ) : (
          <>
            <Check
              checked={member.hingeI || !!ni.hinge}
              disabled={!!ni.hinge}
              title={ni.hinge ? `A rótula vem do nó ${ni.id}` : undefined}
              testid="hinge-i"
              onChange={(v) => apply((m) => updateMember(m, member.id, { hingeI: v }))}
            >
              no início{ni.hinge ? ' (do nó)' : ''}
            </Check>
            <Check
              checked={member.hingeJ || !!nj.hinge}
              disabled={!!nj.hinge}
              title={nj.hinge ? `A rótula vem do nó ${nj.id}` : undefined}
              testid="hinge-j"
              onChange={(v) => apply((m) => updateMember(m, member.id, { hingeJ: v }))}
            >
              no fim{nj.hinge ? ' (do nó)' : ''}
            </Check>
          </>
        )}
      </div>

      {member.kind === 'arc' && (
        <>
          <h4>Geometria do arco</h4>
          <ArcEditor arc={member} model={model} dispatch={dispatch} />
        </>
      )}

      <h4>Cargas distribuídas</h4>
      {member.loads.length === 0 && <p className="help">Nenhuma carga distribuída.</p>}
      {member.loads.map((q, i) => (
        <LoadRow
          key={i}
          i={i}
          q={q}
          onChange={(nq) => setLoads(member.loads.map((l, j) => (j === i ? nq : l)))}
          onRemove={() => setLoads(member.loads.filter((_, j) => j !== i))}
        />
      ))}
      <button
        className="btn outline"
        data-testid="add-dist-load"
        onClick={() => setLoads([...member.loads, { dir: 'globalY', ref: isArc ? 'projection' : 'length', qi: -10, qj: -10 }])}
      >
        + Adicionar carga distribuída
      </button>
      <p className="help">Valores negativos: sentido −Y (gravidade), sentido −X ou para dentro da curva (y local negativo). Em arcos a variação é linear em x.</p>

      <h4>Temperatura</h4>
      <div className="grid2">
        <Field label="Face externa (+y)">
          <NumField value={member.thermal?.tExt ?? 0} unit="°C" testid="temp-ext" onCommit={(tExt) => setThermal({ tExt })} />
        </Field>
        <Field label="Face interna (−y)">
          <NumField value={member.thermal?.tInt ?? 0} unit="°C" testid="temp-int" onCommit={(tInt) => setThermal({ tInt })} />
        </Field>
      </div>
      <p className="help">
        Variação em relação à temperatura de referência. Face externa: lado +y local ({isArc ? 'extradorso do arco' : 'topo da barra desenhada da esquerda para a direita'}). Parte
        uniforme = média das duas; gradiente = (interna − externa)/h.
      </p>

      <h4>Inserir nó</h4>
      <FormScope onSubmit={() => splitValid && doSplit()} testid="split-form">
        <div className="row">
          <span className="lbl">{isArc ? 'na abscissa x' : 'na fração (0–1)'}</span>
          <NumField value={splitAt} unit={isArc ? 'm' : undefined} testid="split-at" onCommit={setSplitAt} />
          <button className="btn outline" disabled={!splitValid} data-testid="split-member" onClick={doSplit}>
            Inserir
          </button>
        </div>
      </FormScope>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn outline danger" onClick={() => apply((m) => deleteMember(m, member.id))}>
          Excluir {isArc ? 'arco' : 'barra'}
        </button>
      </div>
    </div>
  );
}
