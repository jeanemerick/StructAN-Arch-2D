import { useEffect, useState, type Dispatch } from 'react';
import type { Arc, DistLoad, Member, Model } from '../../model/types';
import { deleteMember, splitMember, updateArc, updateMember } from '../../model/ops';
import type { Action } from '../state';
import { Check, Field, NumField } from '../widgets';
import { formatValue } from '../format';
import { memberPolyline } from '../geometry';
import { ArcFields, type ArcDraft } from './ArcForm';

const DIR_LABEL: Record<DistLoad['dir'], string> = {
  globalY: 'Vertical (Y global)',
  globalX: 'Horizontal (X global)',
  localY: 'Normal ao eixo (y local)',
  localX: 'Tangente ao eixo (x local)',
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
  const fromArc = (): ArcDraft => ({
    preset: 'free',
    expr: arc.expr,
    xi: ni.x,
    xj: nj.x,
    nSeg: arc.nSeg,
    x0: ni.x,
    y0: ni.y,
    L: nj.x - ni.x,
    f: 1,
    sectionId: arc.sectionId,
  });
  const [draft, setDraft] = useState<ArcDraft>(fromArc);
  useEffect(() => setDraft(fromArc()), [arc.id, arc.expr, arc.nSeg, ni.x, nj.x]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ArcFields
      draft={draft}
      setDraft={setDraft}
      submitLabel="Aplicar ao arco"
      testPrefix="arcedit"
      onSubmit={(d) => {
        const r = updateArc(model, arc.id, { expr: d.expr, nSeg: d.nSeg, xi: d.xi, xj: d.xj });
        if ('error' in r) return r.error;
        dispatch({ type: 'apply', fn: () => r });
        return null;
      }}
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
        <span className="lbl">Rótulas</span>
        <Check checked={member.hingeI} testid="hinge-i" onChange={(v) => apply((m) => updateMember(m, member.id, { hingeI: v }))}>
          no início
        </Check>
        <Check checked={member.hingeJ} testid="hinge-j" onChange={(v) => apply((m) => updateMember(m, member.id, { hingeJ: v }))}>
          no fim
        </Check>
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

      <h4>Inserir nó</h4>
      <div className="row">
        <span className="lbl">{isArc ? 'na abscissa x' : 'na fração (0–1)'}</span>
        <NumField value={splitAt} unit={isArc ? 'm' : undefined} testid="split-at" onCommit={setSplitAt} />
        <button
          className="btn outline"
          disabled={!splitValid}
          data-testid="split-member"
          onClick={() => {
            const r = splitMember(model, member.id, splitAt);
            dispatch({ type: 'apply', fn: () => r.model, select: { kind: 'node', id: r.nodeId } });
          }}
        >
          Inserir
        </button>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn outline danger" onClick={() => apply((m) => deleteMember(m, member.id))}>
          Excluir {isArc ? 'arco' : 'barra'}
        </button>
      </div>
    </div>
  );
}
