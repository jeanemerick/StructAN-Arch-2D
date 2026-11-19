import type { Dispatch } from 'react';
import type { Model, Node, Support } from '../../model/types';
import { deleteNode, setNodalLoad, setSupport, updateNode } from '../../model/ops';
import type { Action } from '../state';
import { Check, Field, NumField } from '../widgets';
import { UNIT } from '../format';

const PRESETS: { key: string; label: string; s: Support | undefined }[] = [
  { key: 'free', label: 'Livre', s: undefined },
  { key: 'rollerY', label: '1º gênero (vertical)', s: { rx: false, ry: true, rz: false } },
  { key: 'rollerX', label: '1º gênero (horizontal)', s: { rx: true, ry: false, rz: false } },
  { key: 'pin', label: '2º gênero', s: { rx: true, ry: true, rz: false } },
  { key: 'fix', label: 'Engaste', s: { rx: true, ry: true, rz: true } },
];

function presetOf(s: Support | undefined): string {
  if (!s || (!s.rx && !s.ry && !s.rz && !s.kx && !s.ky && !s.kz)) return 'free';
  const hit = PRESETS.find((p) => p.s && p.s.rx === s.rx && p.s.ry === s.ry && p.s.rz === s.rz);
  return hit ? hit.key : 'custom';
}

export function NodePanel({ node, model, dispatch }: { node: Node; model: Model; dispatch: Dispatch<Action> }) {
  const apply = (fn: (m: Model) => Model) => dispatch({ type: 'apply', fn });
  const sup = node.support;
  const load = node.load ?? { fx: 0, fy: 0, mz: 0 };
  const arcEnd = model.members.some((k) => k.kind === 'arc' && (k.ni === node.id || k.nj === node.id));
  const preset = presetOf(sup);

  const setSup = (s: Support | undefined) => apply((m) => setSupport(m, node.id, s));
  const patchSup = (p: Partial<Support>) => {
    const base: Support = sup ?? { rx: false, ry: false, rz: false };
    const next = { ...base, ...p };
    const empty = !next.rx && !next.ry && !next.rz && !next.kx && !next.ky && !next.kz;
    setSup(empty ? undefined : next);
  };
  const setLoad = (p: Partial<typeof load>) => {
    const next = { ...load, ...p };
    apply((m) => setNodalLoad(m, node.id, next.fx === 0 && next.fy === 0 && next.mz === 0 ? undefined : next));
  };

  const dirs = [
    { r: 'rx', k: 'kx', d: 'dx', name: 'X', kUnit: 'kN/m', dUnit: 'mm', dFactor: UNIT.mm },
    { r: 'ry', k: 'ky', d: 'dy', name: 'Y', kUnit: 'kN/m', dUnit: 'mm', dFactor: UNIT.mm },
    { r: 'rz', k: 'kz', d: 'dz', name: 'Rotação', kUnit: 'kN·m/rad', dUnit: 'rad', dFactor: UNIT.rad },
  ] as const;

  return (
    <div data-testid="node-panel">
      <h3>Nó {node.id}</h3>
      <div className="grid2">
        <Field label="X">
          <NumField value={node.x} unit="m" disabled={arcEnd} testid="node-x" onCommit={(x) => apply((m) => updateNode(m, node.id, { x }))} />
        </Field>
        <Field label="Y">
          <NumField value={node.y} unit="m" disabled={arcEnd} testid="node-y" onCommit={(y) => apply((m) => updateNode(m, node.id, { y }))} />
        </Field>
      </div>
      {arcEnd && <p className="help">Extremidade de arco: a posição segue a equação e os limites do arco.</p>}

      <h4>Apoio</h4>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p.key} className={`chip${preset === p.key ? ' active' : ''}`} data-testid={`support-${p.key}`} onClick={() => setSup(p.s && { ...p.s })}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="card">
        {dirs.map((d) => {
          const restrained = !!sup?.[d.r];
          return (
            <div key={d.r} className="row">
              <Check checked={restrained} onChange={(on) => patchSup({ [d.r]: on, [d.k]: undefined, [d.d]: undefined })}>
                <span style={{ width: 58, display: 'inline-block' }}>{d.name}</span>
              </Check>
              {restrained ? (
                <NumField value={sup?.[d.d] ?? 0} unit={d.dUnit} factor={d.dFactor} title="Recalque imposto" onCommit={(v) => patchSup({ [d.d]: v === 0 ? undefined : v })} />
              ) : (
                <NumField
                  value={sup?.[d.k] ?? 0}
                  unit={d.kUnit}
                  title="Rigidez de mola (0 = livre)"
                  valid={(v) => v >= 0}
                  onCommit={(v) => patchSup({ [d.k]: v === 0 ? undefined : v })}
                />
              )}
            </div>
          );
        })}
        <p className="help">Direção marcada: restringida (campo = recalque). Desmarcada: livre ou mola (campo = rigidez).</p>
      </div>

      <h4>Carga no nó</h4>
      <div className="grid3">
        <Field label="Fx">
          <NumField value={load.fx} unit="kN" testid="load-fx" onCommit={(fx) => setLoad({ fx })} />
        </Field>
        <Field label="Fy">
          <NumField value={load.fy} unit="kN" testid="load-fy" onCommit={(fy) => setLoad({ fy })} />
        </Field>
        <Field label="Mz">
          <NumField value={load.mz} unit="kN·m" testid="load-mz" onCommit={(mz) => setLoad({ mz })} />
        </Field>
      </div>
      <p className="help">Fy negativo segue a gravidade (sentido −Y); Mz positivo é anti-horário.</p>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn outline danger" onClick={() => apply((m) => deleteNode(m, node.id))}>
          Excluir nó
        </button>
      </div>
    </div>
  );
}
