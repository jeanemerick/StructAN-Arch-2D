import { describe, it, expect } from 'vitest';
import { compileExpr } from '../src/expr/parser';

function evalAt(src: string, x: number): number {
  const c = compileExpr(src);
  if (!c.ok) throw new Error(`não compilou: ${src}: ${c.error}`);
  return c.fn(x);
}

describe('compileExpr — avaliação', () => {
  it('parábola x*(20-x)/20 em x=10 vale 5', () => {
    expect(evalAt('x*(20-x)/20', 10)).toBeCloseTo(5, 12);
  });
  it('aceita vírgula decimal: 4*2,5*x*(10-x)/10^2 em x=5 vale 2,5', () => {
    expect(evalAt('4*2,5*x*(10-x)/10^2', 5)).toBeCloseTo(2.5, 12);
  });
  it('menos unário tem precedência inferior a ^: -x^2 em x=3 vale -9', () => {
    expect(evalAt('-x^2', 3)).toBeCloseTo(-9, 12);
  });
  it('^ é associativo à direita: 2^3^2 = 512', () => {
    expect(evalAt('2^3^2', 0)).toBeCloseTo(512, 9);
  });
  it('funções: sqrt, cosh, sin com pi', () => {
    expect(evalAt('sqrt(25-x^2)', 3)).toBeCloseTo(4, 12);
    expect(evalAt('-10*cosh(x/10)', 0)).toBeCloseTo(-10, 12);
    expect(evalAt('sin(pi/2)', 0)).toBeCloseTo(1, 12);
  });
  it('notação científica, constante e e log base 10', () => {
    expect(evalAt('1e3*x', 2)).toBeCloseTo(2000, 9);
    expect(evalAt('ln(e)', 0)).toBeCloseTo(1, 12);
    expect(evalAt('log(1000)', 0)).toBeCloseTo(3, 12);
  });
  it('aceita espaços e maiúsculas em X', () => {
    expect(evalAt(' 2 * X + 1 ', 3)).toBeCloseTo(7, 12);
  });
});

describe('compileExpr — erros', () => {
  const bad = ['', '2*(x+1', 'foo(x)', '2x', 'x+'];
  for (const src of bad) {
    it(`rejeita "${src}" com mensagem e posição`, () => {
      const c = compileExpr(src);
      expect(c.ok).toBe(false);
      if (c.ok) return;
      expect(c.error.length).toBeGreaterThan(0);
      expect(c.pos).toBeGreaterThanOrEqual(0);
      expect(c.pos).toBeLessThanOrEqual(src.length);
    });
  }
  it('mensagem de "2x" sugere o operador *', () => {
    const c = compileExpr('2x');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toContain('*');
  });
  it('nunca usa eval: identificadores arbitrários são rejeitados', () => {
    const c = compileExpr('constructor');
    expect(c.ok).toBe(false);
  });
});
