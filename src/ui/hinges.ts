import type { Id, Model } from '../model/types';

export interface EndHinge {
  memberId: Id;
  end: 'i' | 'j';
}

/**
 * O que desenhar como rótula:
 * - `nodes`: rótulas atribuídas pelo nó, desenhadas como uma bolinha vazia única no nó;
 * - `supports`: nós de apoio que deixam a rotação livre (2º e 1º gênero) e onde chega no máximo
 *   uma barra ligada rigidamente: a articulação do próprio apoio, também bolinha vazia no nó
 *   (como A e B do arco triarticulado). Só desenho: não muda o modelo de cálculo;
 * - `ends`: rótulas atribuídas na extremidade da barra (e as das barras somente axiais),
 *   desenhadas como bolinha vazia na ponta da própria barra, afastada do nó. Numa ponta
 *   cujo nó já é rotulado, a rótula da barra não se repete.
 */
export function hingeMarks(m: Model): { nodes: Id[]; supports: Id[]; ends: EndHinge[] } {
  const hinged = new Set(m.nodes.filter((n) => n.hinge).map((n) => n.id));
  const ends: EndHinge[] = [];
  const rigid = new Map<Id, number>();
  for (const k of m.members) {
    const axial = k.behavior === 'axial';
    const relI = axial || k.hingeI;
    const relJ = axial || k.hingeJ;
    if (relI && !hinged.has(k.ni)) ends.push({ memberId: k.id, end: 'i' });
    if (relJ && !hinged.has(k.nj)) ends.push({ memberId: k.id, end: 'j' });
    if (!relI) rigid.set(k.ni, (rigid.get(k.ni) ?? 0) + 1);
    if (!relJ) rigid.set(k.nj, (rigid.get(k.nj) ?? 0) + 1);
  }
  const supports = m.nodes
    .filter((n) => {
      const s = n.support;
      if (!s || hinged.has(n.id)) return false;
      const holds = s.rx || s.ry || (s.kx ?? 0) > 0 || (s.ky ?? 0) > 0;
      const rotFree = !s.rz && !((s.kz ?? 0) > 0);
      return holds && rotFree && (rigid.get(n.id) ?? 0) <= 1;
    })
    .map((n) => n.id);
  return { nodes: [...hinged], supports, ends };
}
