import type { Issue, Model } from './types';
import { compileArcCurve, NSEG_MAX, NSEG_MIN } from './curve';
import { membersThrough, sectionArea } from './ops';

/** Tolerância para considerar o nó sobre a curva do arco (m). */
const ON_CURVE_TOL = 1e-5;

function fmt(v: number, d = 3): string {
  return v.toFixed(d).replace('.', ',');
}

export function validateModel(m: Model): Issue[] {
  const issues: Issue[] = [];
  const nodes = new Map(m.nodes.map((n) => [n.id, n]));
  const sections = new Map(m.sections.map((s) => [s.id, s]));

  if (m.members.length === 0) {
    issues.push({ severity: 'error', message: 'O modelo não tem barras. Desenhe nós e barras para começar.' });
  }

  for (const n of m.nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
      issues.push({ severity: 'error', message: `Coordenadas inválidas no nó ${n.id}`, target: { kind: 'node', id: n.id } });
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
    } else if (!badSectionReported.has(sec.id)) {
      const { A, I } = sectionArea(sec);
      if (!(sec.E > 0) || !(A > 0) || !(I > 0)) {
        badSectionReported.add(sec.id);
        issues.push({
          severity: 'error',
          message: `A seção "${sec.name}" precisa de E, área e inércia positivos`,
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
    const supported = m.nodes.some((n) => n.support && (n.support.rx || n.support.ry || n.support.rz || n.support.kx || n.support.ky || n.support.kz));
    if (!supported) issues.push({ severity: 'error', message: 'A estrutura não tem apoios' });
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
