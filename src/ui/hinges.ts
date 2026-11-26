import type { Id, Model } from '../model/types';

export interface EndHinge {
  memberId: Id;
  end: 'i' | 'j';
}

/**
 * O que desenhar como rótula:
 * - `nodes`: rótulas atribuídas pelo nó, desenhadas como uma bolinha vazia única no nó;
 * - `ends`: rótulas atribuídas na extremidade da barra (e as das barras somente axiais),
 *   desenhadas como bolinha vazia na ponta da própria barra, afastada do nó. Numa ponta
 *   cujo nó já é rotulado, a rótula da barra não se repete.
 */
export function hingeMarks(m: Model): { nodes: Id[]; ends: EndHinge[] } {
  const hinged = new Set(m.nodes.filter((n) => n.hinge).map((n) => n.id));
  const ends: EndHinge[] = [];
  for (const k of m.members) {
    const axial = k.behavior === 'axial';
    if ((axial || k.hingeI) && !hinged.has(k.ni)) ends.push({ memberId: k.id, end: 'i' });
    if ((axial || k.hingeJ) && !hinged.has(k.nj)) ends.push({ memberId: k.id, end: 'j' });
  }
  return { nodes: [...hinged], ends };
}
