/**
 * Interpretador de expressões y = f(x) para a definição de arcos.
 *
 * Gramática (precedência crescente):
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := ('-' | '+') unary | power
 *   power  := atom ('^' unary)?          // associativo à direita; -x^2 = -(x^2)
 *   atom   := número | 'x' | constante | função '(' expr ')' | '(' expr ')'
 *
 * Sem eval nem new Function: a expressão vira uma árvore de closures.
 */

export type Compiled =
  | { ok: true; fn: (x: number) => number }
  | { ok: false; error: string; pos: number };

type Fn = (x: number) => number;

/** Valor levemente fora do domínio por arredondamento (ex.: 1,21 − 1,1² = −2e-16) é trazido para a borda. */
const ROUND_TOL = 1e-9;
const clampUnit = (v: number) => (Math.abs(v) > 1 && Math.abs(v) < 1 + ROUND_TOL ? Math.sign(v) : v);

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: (v) => Math.asin(clampUnit(v)),
  acos: (v) => Math.acos(clampUnit(v)),
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: (v) => (v < 0 && v > -ROUND_TOL ? 0 : Math.sqrt(v)),
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok =
  | { t: 'num'; v: number; pos: number }
  | { t: 'id'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'end'; pos: number };

class ParseError extends Error {
  constructor(
    message: string,
    public pos: number,
  ) {
    super(message);
  }
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (/[0-9.,]/.test(ch)) {
      const start = i;
      const m = /^(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ParseError(`Número inválido na posição ${start + 1}`, start);
      const v = Number(m[0].replace(',', '.'));
      if (!Number.isFinite(v)) throw new ParseError(`Número inválido na posição ${start + 1}`, start);
      toks.push({ t: 'num', v, pos: start });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0].toLowerCase(), pos: i });
      i += m[0].length;
      continue;
    }
    if ('+-*/^()'.includes(ch)) {
      toks.push({ t: 'op', v: ch, pos: i });
      i++;
      continue;
    }
    throw new ParseError(`Caractere não reconhecido "${ch}" na posição ${i + 1}`, i);
  }
  toks.push({ t: 'end', pos: src.length });
  return toks;
}

class Parser {
  private k = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.k];
  }
  private next(): Tok {
    return this.toks[this.k++];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.t === 'op' && t.v === v;
  }

  parse(): Fn {
    const f = this.expr();
    const t = this.peek();
    if (t.t !== 'end') {
      if (t.t === 'id' || t.t === 'num' || (t.t === 'op' && t.v === '(')) {
        throw new ParseError(
          `Falta um operador antes da posição ${t.pos + 1} (escreva a multiplicação com *, por exemplo 2*x)`,
          t.pos,
        );
      }
      if (t.t === 'op' && t.v === ')') {
        throw new ParseError(`Parêntese ")" sem abertura na posição ${t.pos + 1}`, t.pos);
      }
      throw new ParseError(`Símbolo inesperado na posição ${t.pos + 1}`, t.pos);
    }
    return f;
  }

  private expr(): Fn {
    let left = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next() as { v: string };
      const a = left;
      const b = this.term();
      left = op.v === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }

  private term(): Fn {
    let left = this.unary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.next() as { v: string };
      const a = left;
      const b = this.unary();
      left = op.v === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
    }
    return left;
  }

  private unary(): Fn {
    if (this.isOp('-')) {
      this.next();
      const a = this.unary();
      return (x) => -a(x);
    }
    if (this.isOp('+')) {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  private power(): Fn {
    const base = this.atom();
    if (this.isOp('^')) {
      this.next();
      const exp = this.unary();
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  private atom(): Fn {
    const t = this.next();
    if (t.t === 'num') {
      const v = t.v;
      return () => v;
    }
    if (t.t === 'id') {
      if (t.v === 'x') return (x) => x;
      if (Object.prototype.hasOwnProperty.call(CONSTS, t.v)) {
        const v = CONSTS[t.v];
        return () => v;
      }
      if (Object.prototype.hasOwnProperty.call(FUNCS, t.v)) {
        const f = FUNCS[t.v];
        if (!this.isOp('(')) {
          throw new ParseError(`A função ${t.v} precisa de parênteses, por exemplo ${t.v}(x)`, this.peek().pos);
        }
        this.next();
        const arg = this.expr();
        this.expectClose(t.pos);
        return (x) => f(arg(x));
      }
      throw new ParseError(
        `Nome desconhecido "${t.v}" na posição ${t.pos + 1}. Nomes aceitos: x, pi, e e as funções ${Object.keys(FUNCS).join(', ')}`,
        t.pos,
      );
    }
    if (t.t === 'op' && t.v === '(') {
      const inner = this.expr();
      this.expectClose(t.pos);
      return inner;
    }
    if (t.t === 'end') {
      throw new ParseError(
        t.pos === 0 ? 'A equação está vazia' : 'A equação termina de forma incompleta',
        t.pos,
      );
    }
    throw new ParseError(`Símbolo "${(t as { v: string }).v}" inesperado na posição ${t.pos + 1}`, t.pos);
  }

  private expectClose(openPos: number): void {
    if (this.isOp(')')) {
      this.next();
      return;
    }
    const t = this.peek();
    if (t.t === 'end') {
      throw new ParseError(`Parêntese aberto na posição ${openPos + 1} não foi fechado`, openPos);
    }
    throw new ParseError(`Esperava ")" na posição ${t.pos + 1}`, t.pos);
  }
}

export function compileExpr(src: string): Compiled {
  try {
    const fn = new Parser(tokenize(src)).parse();
    return { ok: true, fn };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, pos: e.pos };
    throw e;
  }
}
