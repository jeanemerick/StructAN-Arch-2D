/**
 * Matriz simétrica armazenada em perfil (skyline) por colunas, com fatoração LDLᵀ
 * (algoritmo de colunas ativas) e reordenação Cuthill–McKee reversa dos nós.
 */

export class Skyline {
  readonly n: number;
  private readonly first: Int32Array;
  private readonly start: Int32Array;
  private readonly a: Float64Array;
  private factored = false;

  /** `firstRow[j]` é a primeira linha não nula da coluna j (0 ≤ firstRow[j] ≤ j). */
  constructor(n: number, firstRow: Int32Array) {
    this.n = n;
    this.first = Int32Array.from(firstRow);
    this.start = new Int32Array(n + 1);
    for (let j = 0; j < n; j++) {
      if (this.first[j] < 0 || this.first[j] > j) throw new Error('perfil inválido');
      this.start[j + 1] = this.start[j] + (j - this.first[j] + 1);
    }
    this.a = new Float64Array(this.start[n]);
  }

  private idx(i: number, j: number): number {
    return this.start[j] + (i - this.first[j]);
  }

  /** Soma v na posição (i, j) — e por simetria em (j, i). */
  add(i: number, j: number, v: number): void {
    if (i > j) [i, j] = [j, i];
    if (i < this.first[j]) throw new Error(`posição (${i}, ${j}) fora do perfil`);
    this.a[this.idx(i, j)] += v;
  }

  diag(i: number): number {
    return this.a[this.idx(i, i)];
  }

  /** LDLᵀ no próprio armazenamento. Falha se algum pivô ≤ 1e-10 × maior diagonal. */
  factor(): { ok: true } | { ok: false; index: number } {
    const { n, first, a } = this;
    let maxDiag = 0;
    for (let j = 0; j < n; j++) maxDiag = Math.max(maxDiag, Math.abs(this.diag(j)));
    const tol = 1e-10 * (maxDiag > 0 ? maxDiag : 1);
    for (let j = 0; j < n; j++) {
      const fj = first[j];
      const sj = this.start[j] - fj; // a[sj + i] = elemento (i, j)
      // g_ij = a_ij − Σ l_ri g_rj
      for (let i = fj + 1; i < j; i++) {
        const fi = first[i];
        const si = this.start[i] - fi;
        const r0 = Math.max(fi, fj);
        let acc = 0;
        for (let r = r0; r < i; r++) acc += a[si + r] * a[sj + r];
        a[sj + i] -= acc;
      }
      // l_ij = g_ij / d_ii ;  d_jj = a_jj − Σ l_rj g_rj
      let d = a[sj + j];
      for (let r = fj; r < j; r++) {
        const g = a[sj + r];
        const l = g / a[this.start[r] + (r - first[r])];
        d -= l * g;
        a[sj + r] = l;
      }
      if (!(d > tol)) return { ok: false, index: j };
      a[sj + j] = d;
    }
    this.factored = true;
    return { ok: true };
  }

  solve(b: Float64Array): Float64Array {
    if (!this.factored) throw new Error('matriz não fatorada');
    const { n, first, a } = this;
    const x = Float64Array.from(b);
    for (let j = 0; j < n; j++) {
      const sj = this.start[j] - first[j];
      let acc = 0;
      for (let r = first[j]; r < j; r++) acc += a[sj + r] * x[r];
      x[j] -= acc;
    }
    for (let j = 0; j < n; j++) x[j] /= a[this.idx(j, j)];
    for (let j = n - 1; j >= 0; j--) {
      const sj = this.start[j] - first[j];
      const xj = x[j];
      for (let r = first[j]; r < j; r++) x[r] -= a[sj + r] * xj;
    }
    return x;
  }
}

/**
 * Ordenação Cuthill–McKee reversa. Devolve perm com perm[novo] = antigo.
 * Cada componente conexa parte de um nó pseudoperiférico.
 */
export function rcmOrder(nNodes: number, edges: [number, number][]): number[] {
  const adj: number[][] = Array.from({ length: nNodes }, () => []);
  for (const [a, b] of edges) {
    if (a === b) continue;
    adj[a].push(b);
    adj[b].push(a);
  }
  for (const l of adj) {
    l.sort((p, q) => p - q);
    for (let i = l.length - 1; i > 0; i--) if (l[i] === l[i - 1]) l.splice(i, 1);
  }
  const deg = adj.map((l) => l.length);
  const visited = new Uint8Array(nNodes);
  const order: number[] = [];

  const bfsLevels = (root: number): number[][] => {
    const seen = new Uint8Array(nNodes);
    seen[root] = 1;
    const levels = [[root]];
    for (;;) {
      const next: number[] = [];
      for (const v of levels[levels.length - 1])
        for (const w of adj[v])
          if (!seen[w]) {
            seen[w] = 1;
            next.push(w);
          }
      if (next.length === 0) return levels;
      levels.push(next);
    }
  };

  const byDegree = Array.from({ length: nNodes }, (_, i) => i).sort((p, q) => deg[p] - deg[q] || p - q);
  for (const seed of byDegree) {
    if (visited[seed]) continue;
    // nó pseudoperiférico: repete BFS a partir do nó de menor grau do último nível
    let root = seed;
    let depth = bfsLevels(root).length;
    for (let it = 0; it < 5; it++) {
      const last = bfsLevels(root).at(-1)!;
      const cand = last.reduce((best, v) => (deg[v] < deg[best] ? v : best), last[0]);
      const d = bfsLevels(cand).length;
      if (d <= depth) break;
      root = cand;
      depth = d;
    }
    visited[root] = 1;
    const queue = [root];
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h];
      order.push(v);
      const nb = adj[v].filter((w) => !visited[w]).sort((p, q) => deg[p] - deg[q] || p - q);
      for (const w of nb) {
        visited[w] = 1;
        queue.push(w);
      }
    }
  }
  return order.reverse();
}
