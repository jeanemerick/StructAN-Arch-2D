import { describe, it, expect } from 'vitest';
import { parseNumber, formatNumber, formatValue } from '../src/ui/format';

describe('parseNumber', () => {
  it('aceita vírgula ou ponto decimal, sinal e notação científica', () => {
    expect(parseNumber('2,5')).toBe(2.5);
    expect(parseNumber('2.5')).toBe(2.5);
    expect(parseNumber('-1e3')).toBe(-1000);
    expect(parseNumber(' 7 ')).toBe(7);
    expect(parseNumber('-0,25')).toBe(-0.25);
  });
  it('rejeita texto inválido e vazio', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('1,2,3')).toBeNull();
    expect(parseNumber('2x')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('usa vírgula decimal e o número de casas pedido', () => {
    expect(formatNumber(1234.5, 2)).toBe('1234,50');
    expect(formatNumber(-0.125, 3)).toBe('-0,125');
    expect(formatNumber(3, 0)).toBe('3');
  });
  it('não mostra "-0"', () => {
    expect(formatNumber(-0.0001, 2)).toBe('0,00');
  });
});

describe('formatValue', () => {
  it('ajusta as casas ao tamanho do número', () => {
    expect(formatValue(141.4213)).toBe('141,4');
    expect(formatValue(27.7128)).toBe('27,71');
    expect(formatValue(0.5695)).toBe('0,570');
    expect(formatValue(1e-12)).toBe('0');
  });
  it('arredonda antes de escolher as casas: 99,99999 e 100,00001 aparecem iguais', () => {
    expect(formatValue(99.99999)).toBe('100,0');
    expect(formatValue(100.00001)).toBe('100,0');
    expect(formatValue(-9.99999)).toBe('-10,00');
  });
});
