import type { Issue, Model } from './types';
import { compileArcCurve, NSEG_MAX, NSEG_MIN } from './curve';
import type { Behavior, Section } from './types';
import { membersThrough, nodeNear, sectionHeight, sectionProps } from './ops';

/** Tolerância para considerar o nó sobre a curva do arco (m). */
const ON_CURVE_TOL = 1e-5;

function fmt(v: number, d = 3): string {
  return v.toFixed(d).replace('.', ',');
}

/** Mensagem quando a seção não tem as rigidezes que o tipo de barra exige; null se estiver tudo certo. */
function sectionProblem(sec: Section, behavior: Behavior, memberId: string): string | null {
  const { EA, EI } = sectionProps(sec);
  const needEA = behavior !== 'bending';
  const needEI = behavior !== 'axial';
  const okEA = !needEA || EA > 0;
  const okEI = !needEI || EI > 0;
  const forWhat = behavior === 'axial' ? ` (a barra ${memberId} é somente axial)` : behavior === 'bending' ? ` (a barra ${memberId} é somente flexão)` : '';
  if (sec.shape.kind === 'direct') {
    if (okEA && okEI) return null;
    const what = needEA && needEI ? 'EA e EI positivos' : needEA ? 'EA positivo' : 'EI positivo';
    return `A seção "${sec.name}" (rigidez direta) precisa de ${what}${forWhat}`;
  }
  if (sec.E > 0 && okEA && okEI) return null;
  const what = needEA && needEI ? 'E, área e inércia positivos' : needEA ? 'E e área positivos' : 'E e inércia positivos';
  return `A seção "${sec.name}" precisa de ${what}${forWhat}`;
}

export function validateModel(m: Model): Issue[] {
  const issues: Issue[] = [];
  const nodes = new Map(m.nodes.map((n) => [n.id, n]));
  const sections = new Map(m.sections.map((s) => [s.id, s]));

  if (m.members.length === 0) {
    issues.push({ severity: 'error', message: 'O modelo não tem barras. Desenhe nós e barras para começar.' });
  }

  const DIRS = [
    ['rx', 'kx', 'dx', 'X'],
    ['ry', 'ky', 'dy', 'Y'],
    ['rz', 'kz', 'dz', 'rotação'],
  ] as const;
  for (const n of m.nodes) {
    const target = { kind: 'node' as const, id: n.id };
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      issues.push({ severity: 'error', message: `Coordenadas inválidas no nó ${n.id}`, target });
    }
    const s = n.support;
    if (!s) continue;
    for (const [r, k, d, name] of DIRS) {
      if (!s[r] && (s[k] ?? 0) < 0) {
        issues.push({ severity: 'error', message: `A mola do nó ${n.id} na direção ${name} tem rigidez negativa`, target });
      }
      if (!s[r] && (s[d] ?? 0) !== 0) {
        issues.push({ severity: 'warning', message: `O recalque do nó ${n.id} na direção ${name} é ignorado: essa direção não está restringida`, target });
      }
    }
  }

  const badSectionReported = new Set<string>();
  for (const k of m.members) {
    const target = { kind: 'member' as const, id: k.id };
    const ni = nodes.get(k.ni);
    const nj = nodes.get(k.nj);
    if (!ni || !nj) {
      issues.push({ severity: 'error', message: `A barra ${k.id} liga um nó inexistente`, target });
      continue;
    }
    const sec = sections.get(k.sectionId);
    if (!sec) {
      issues.push({ severity: 'error', message: `A barra ${k.id} não tem seção válida`, target });
    } else {
      const key = `${sec.id}:${k.behavior}`;
      const problem = sectionProblem(sec, k.behavior, k.id);
      if (problem && !badSectionReported.has(key)) {
        badSectionReported.add(key);
        issues.push({ severity: 'error', message: problem, target });
      }
      if (k.thermal && k.thermal.tExt !== k.thermal.tInt) {
        if (k.behavior === 'axial') {
          issues.push({
            severity: 'warning',
            message: `Na barra somente axial ${k.id} só a parte uniforme da temperatura é considerada (o gradiente não tem efeito)`,
            target,
          });
        } else {
          const h = sectionHeight(sec);
          if (!(h !== undefined && h > 0)) {
            issues.push({
              severity: 'error',
              message: `A barra ${k.id} tem gradiente de temperatura: informe a altura h da seção "${sec.name}"`,
              target,
            });
          }
        }
      }
      if (!(sec.alpha >= 0) && !badSectionReported.has(`${sec.id}:alpha`)) {
        badSectionReported.add(`${sec.id}:alpha`);
        issues.push({ severity: 'error', message: `O coeficiente de dilatação da seção "${sec.name}" deve ser zero ou positivo`, target });
      }
    }
    if (k.kind === 'arc' && k.behavior === 'axial') {
      issues.push({
        severity: 'error',
        message: `O arco ${k.id} não pode ser somente axial: escolha Pórtico ou Somente flexão`,
        target,
      });
    }
    if (k.kind === 'bar' && k.behavior === 'axial') {
      const L = Math.hypot(nj.x - ni.x, nj.y - ni.y) || 1;
      const c = (nj.x - ni.x) / L;
      const sn = (nj.y - ni.y) / L;
      const transverse = k.loads.some((q) => {
        if (q.qi === 0 && q.qj === 0) return false;
        if (q.dir === 'localX') return false;
        if (q.dir === 'localY') return true;
        return (q.dir === 'globalY' ? Math.abs(c) : Math.abs(sn)) > 1e-9;
      });
      if (transverse) {
        issues.push({
          severity: 'error',
          message: `A barra ${k.id} é somente axial e não aceita carga transversal distribuída: aplique a carga nos nós ou mude o tipo da barra.`,
          target,
        });
      }
    }
    if (k.kind === 'bar') {
      if (Math.hypot(nj.x - ni.x, nj.y - ni.y) < 1e-9) {
        issues.push({ severity: 'error', message: `A barra ${k.id} tem comprimento nulo`, target });
      }
      continue;
    }
    // arco
    if (!Number.isInteger(k.nSeg) || k.nSeg < NSEG_MIN || k.nSeg > NSEG_MAX) {
      issues.push({
        severity: 'error',
        message: `O arco ${k.id} deve ter entre ${NSEG_MIN} e ${NSEG_MAX} segmentos`,
        target,
      });
    }
    const c = compileArcCurve(k.expr, ni.x, nj.x);
    if (!c.ok) {
      issues.push({ severity: 'error', message: `Arco ${k.id}: ${c.error}`, target });
      continue;
    }
    for (const n of [ni, nj]) {
      const d = Math.abs(c.fn(n.x) - n.y);
      if (d > ON_CURVE_TOL) {
        issues.push({
          severity: 'error',
          message: `O nó ${n.id} não está sobre a curva do arco ${k.id} (diferença de ${fmt(d)} m)`,
          target,
        });
      }
    }
  }

  if (m.members.length > 0) {
    const supported = m.nodes.some((n) => n.support && (n.support.rx || n.support.ry || n.support.rz || (n.support.kx ?? 0) > 0 || (n.support.ky ?? 0) > 0 || (n.support.kz ?? 0) > 0));
    if (!supported) issues.push({ severity: 'error', message: 'A estrutura não tem apoios' });
  }

  // nós distintos no mesmo ponto (menos de 1 mm): parecem ligados, mas não estão
  const seenPair = new Set<string>();
  for (const n of m.nodes) {
    const other = nodeNear(m, n.x, n.y, n.id);
    if (!other) continue;
    const key = [n.id, other.id].sort().join('|');
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    issues.push({
      severity: 'error',
      message: `Os nós ${n.id} e ${other.id} estão no mesmo ponto mas não estão ligados. Selecione um deles e clique em "Ligar ao elemento" para fundi-los.`,
      target: { kind: 'node', id: n.id },
    });
  }

  // barras retas repetidas (mesmas pontas): rigidez dobrada sem querer
  const pairs = new Map<string, string>();
  for (const k of m.members) {
    if (k.kind !== 'bar') continue;
    const key = [k.ni, k.nj].sort().join('|');
    const prev = pairs.get(key);
    if (prev) {
      issues.push({ severity: 'error', message: `As barras ${prev} e ${k.id} ligam os mesmos nós: exclua uma delas`, target: { kind: 'member', id: k.id } });
    } else pairs.set(key, k.id);
  }

  // nós soltos: sobre o interior de uma barra ou arco sem estar ligados, ou sem barra nenhuma
  const connected = new Set<string>();
  for (const k of m.members) {
    connected.add(k.ni);
    connected.add(k.nj);
  }
  for (const n of m.nodes) {
    const loaded = !!n.load && (n.load.fx !== 0 || n.load.fy !== 0 || n.load.mz !== 0);
    const supported = !!n.support && (n.support.rx || n.support.ry || n.support.rz || !!n.support.kx || !!n.support.ky || !!n.support.kz);
    const target = { kind: 'node' as const, id: n.id };
    const what = loaded && supported ? 'carga e apoio' : loaded ? 'carga' : 'apoio';
    const hits = membersThrough(m, n.x, n.y, (k) => k.ni === n.id || k.nj === n.id);
    if (hits.length > 0) {
      const k = m.members.find((q) => q.id === hits[0].id)!;
      const el = k.kind === 'arc' ? `o arco ${k.id}` : `a barra ${k.id}`;
      const pron = k.kind === 'arc' ? 'ele' : 'ela';
      const grave = loaded || supported || connected.has(n.id);
      issues.push({
        severity: grave ? 'error' : 'warning',
        message: `O nó ${n.id} está sobre ${el} mas não está ligado a ${pron}. Selecione o nó e clique em "Ligar ao elemento".`,
        target,
      });
      continue;
    }
    if (connected.has(n.id)) continue;
    if (loaded || supported) {
      issues.push({
        severity: 'error',
        message: `O nó ${n.id} tem ${what} mas não está ligado a nenhuma barra. Leve-o para uma barra ou arco, ou remova ${loaded && supported ? 'a carga e o apoio' : loaded ? 'a carga' : 'o apoio'}.`,
        target,
      });
    } else {
      issues.push({ severity: 'warning', message: `O nó ${n.id} não está ligado a nenhuma barra e será ignorado`, target });
    }
  }
  return issues;
}
