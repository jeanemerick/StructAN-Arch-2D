import type { Id, Issue, Model } from '../model/types';
import { validateModel } from '../model/validate';
import { buildMesh, type Mesh } from './mesh';
import { condense, equivLoads, localStiffness, toGlobal, vecToGlobal, vecToLocal, type Mat } from './element';
import { rcmOrder, Skyline } from './skyline';

export interface Reaction {
  nodeId: Id;
  fx: number;
  fy: number;
  mz: number;
}

export interface AnalysisOk {
  ok: true;
  mesh: Mesh;
  /** Deslocamentos globais, 3 por nó da malha: ux, uy (m), rz (rad). */
  u: Float64Array;
  /** Esforços de extremidade por elemento, eixos locais: [f1x, f1y, m1, f2x, f2y, m2]. */
  endForces: number[][];
  /** Deslocamentos de extremidade por elemento, eixos locais, com rotações liberadas recuperadas. */
  endDisp: number[][];
  reactions: Reaction[];
  warnings: Issue[];
}

export type Analysis = AnalysisOk | { ok: false; issues: Issue[] };

const DIR_NAMES = ['X', 'Y', 'rotação'];

interface ElemData {
  dofs: number[];
  kLocal: Mat;
  feq: number[];
  kGlobal: Mat;
  fGlobal: number[];
  recover(u: number[]): number[];
}

export function analyze(model: Model): Analysis {
  const issues = validateModel(model);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) return { ok: false, issues: errors };
  const warnings = issues.filter((i) => i.severity === 'warning');

  const mesh = buildMesh(model);
  const nn = mesh.nodes.length;
  const ndof = 3 * nn;
  const byId = new Map(model.nodes.map((n) => [n.id, n]));

  // --- restrições, recalques e molas
  const restrained = new Uint8Array(ndof);
  const prescribed = new Float64Array(ndof);
  const spring = new Float64Array(ndof);
  for (const [id, i] of mesh.nodeIndex) {
    const s = byId.get(id)!.support;
    if (!s) continue;
    const r = [s.rx, s.ry, s.rz];
    const d = [s.dx ?? 0, s.dy ?? 0, s.dz ?? 0];
    const k = [s.kx ?? 0, s.ky ?? 0, s.kz ?? 0];
    for (let q = 0; q < 3; q++) {
      if (r[q]) {
        restrained[3 * i + q] = 1;
        prescribed[3 * i + q] = d[q];
      } else if (k[q] > 0) {
        spring[3 * i + q] = k[q];
      }
    }
  }

  // --- rotações sem rigidez (todas as barras rotuladas no nó) são travadas
  const rotStiff = new Uint8Array(nn);
  for (const e of mesh.elems) {
    if (!e.relA) rotStiff[e.a] = 1;
    if (!e.relB) rotStiff[e.b] = 1;
  }
  const locked = new Uint8Array(ndof);
  for (let i = 0; i < nn; i++) {
    const q = 3 * i + 2;
    if (!rotStiff[i] && !restrained[q] && spring[q] === 0) {
      locked[q] = 1;
      const mid = mesh.nodes[i].modelNodeId;
      const load = mid ? byId.get(mid)!.load : undefined;
      if (load && load.mz !== 0) {
        warnings.push({
          severity: 'warning',
          message: `O momento aplicado no nó ${mid} é ignorado: todas as barras chegam rotuladas nele`,
          target: { kind: 'node', id: mid! },
        });
      }
    }
  }

  // --- numeração das equações na ordem Cuthill–McKee reversa
  const perm = rcmOrder(
    nn,
    mesh.elems.map((e) => [e.a, e.b]),
  );
  const eq = new Int32Array(ndof).fill(-1);
  const eqDof: number[] = [];
  for (const node of perm) {
    for (let q = 0; q < 3; q++) {
      const g = 3 * node + q;
      if (!restrained[g] && !locked[g]) {
        eq[g] = eqDof.length;
        eqDof.push(g);
      }
    }
  }
  const neq = eqDof.length;

  // --- matrizes dos elementos
  const data: ElemData[] = mesh.elems.map((e) => {
    const kLocal = localStiffness(e.EA, e.EI, e.L);
    const feq = equivLoads(e.L, e.load);
    const released: number[] = [];
    if (e.relA) released.push(2);
    if (e.relB) released.push(5);
    const cond = condense(kLocal, feq, released);
    return {
      dofs: [3 * e.a, 3 * e.a + 1, 3 * e.a + 2, 3 * e.b, 3 * e.b + 1, 3 * e.b + 2],
      kLocal,
      feq,
      kGlobal: toGlobal(cond.k, e.c, e.s),
      fGlobal: vecToGlobal(cond.feq, e.c, e.s),
      recover: cond.recover,
    };
  });

  // --- perfil
  const firstRow = new Int32Array(neq);
  for (let j = 0; j < neq; j++) firstRow[j] = j;
  for (const d of data) {
    const eqs = d.dofs.map((g) => eq[g]).filter((v) => v >= 0);
    if (eqs.length === 0) continue;
    const lo = Math.min(...eqs);
    for (const j of eqs) if (lo < firstRow[j]) firstRow[j] = lo;
  }
  const K = new Skyline(neq, firstRow);
  const F = new Float64Array(neq);

  // --- montagem
  for (const d of data) {
    for (let i = 0; i < 6; i++) {
      const ei = eq[d.dofs[i]];
      if (ei < 0) continue;
      F[ei] += d.fGlobal[i];
      for (let j = 0; j < 6; j++) {
        const gj = d.dofs[j];
        const ej = eq[gj];
        if (ej >= 0) {
          if (ei <= ej) K.add(ei, ej, d.kGlobal[i][j]);
        } else if (prescribed[gj] !== 0) {
          F[ei] -= d.kGlobal[i][j] * prescribed[gj];
        }
      }
    }
  }
  for (let g = 0; g < ndof; g++) {
    if (spring[g] > 0 && eq[g] >= 0) K.add(eq[g], eq[g], spring[g]);
  }
  for (const [id, i] of mesh.nodeIndex) {
    const l = byId.get(id)!.load;
    if (!l) continue;
    const vals = [l.fx, l.fy, l.mz];
    for (let q = 0; q < 3; q++) {
      const e = eq[3 * i + q];
      if (e >= 0) F[e] += vals[q];
    }
  }

  // --- solução
  const u = new Float64Array(ndof);
  for (let g = 0; g < ndof; g++) if (restrained[g]) u[g] = prescribed[g];
  if (neq > 0) {
    const f = K.factor();
    if (!f.ok) return { ok: false, issues: [instability(model, mesh, eqDof[f.index])] };
    const x = K.solve(F);
    for (let e = 0; e < neq; e++) u[eqDof[e]] = x[e];
  }

  // --- esforços de extremidade
  const endForces: number[][] = [];
  const endDisp: number[][] = [];
  mesh.elems.forEach((e, k) => {
    const d = data[k];
    const ul = d.recover(vecToLocal(d.dofs.map((g) => u[g]), e.c, e.s));
    const fl = d.kLocal.map((row, i) => row.reduce((acc, kij, j) => acc + kij * ul[j], 0) - d.feq[i]);
    endDisp.push(ul);
    endForces.push(fl);
  });

  // --- reações: R = Σ forças nodo→elemento − carga aplicada
  const sum = new Float64Array(ndof);
  mesh.elems.forEach((e, k) => {
    const fg = vecToGlobal(endForces[k], e.c, e.s);
    const dofs = data[k].dofs;
    for (let i = 0; i < 6; i++) sum[dofs[i]] += fg[i];
  });
  const reactions: Reaction[] = [];
  for (const [id, i] of mesh.nodeIndex) {
    const n = byId.get(id)!;
    if (!n.support) continue;
    const l = n.load ?? { fx: 0, fy: 0, mz: 0 };
    const applied = [l.fx, l.fy, l.mz];
    const r = [0, 0, 0];
    for (let q = 0; q < 3; q++) {
      const g = 3 * i + q;
      if (restrained[g]) r[q] = sum[g] - applied[q];
      else if (spring[g] > 0) r[q] = -spring[g] * u[g];
    }
    reactions.push({ nodeId: id, fx: r[0], fy: r[1], mz: r[2] });
  }

  return { ok: true, mesh, u, endForces, endDisp, reactions, warnings };
}

function instability(model: Model, mesh: Mesh, g: number): Issue {
  const i = Math.floor(g / 3);
  const dir = DIR_NAMES[g % 3];
  const node = mesh.nodes[i];
  if (node.modelNodeId) {
    return {
      severity: 'error',
      message: `Estrutura instável (hipostática): deslocamento livre no nó ${node.modelNodeId}, direção ${dir}. Verifique apoios e rótulas.`,
      target: { kind: 'node', id: node.modelNodeId },
    };
  }
  const elem = mesh.elems.find((e) => e.a === i || e.b === i);
  const memberId = elem?.memberId ?? model.members[0]?.id;
  return {
    severity: 'error',
    message: `Estrutura instável (hipostática): deslocamento livre no arco ${memberId} (x = ${node.x.toFixed(2).replace('.', ',')} m), direção ${dir}. Verifique apoios e rótulas.`,
    target: memberId ? { kind: 'member', id: memberId } : undefined,
  };
}
