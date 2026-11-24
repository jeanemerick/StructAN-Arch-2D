/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import readme from '../README.md?raw';

// preferência de vocabulário do Jean: evitar "usar", "mexer", "baixo", "puxar" e variações
const FORBIDDEN =
  /\b(usar|usa|usam|usas|usou|usei|usado|usada|usados|usadas|usando|uso|usos|usuário|usuária|usuários|usuárias|usual|usuais|mexer|mexe|mexa|mexido|baixo|baixa|baixos|baixas|abaixo|embaixo|baixar|puxar|puxa|puxe|puxado)\b/i;

const sources = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('vocabulário da interface, mensagens, manual e README', () => {
  it('nenhum arquivo de src/ nem o README tem as palavras evitadas', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    const hits: string[] = [];
    for (const [file, text] of [...Object.entries(sources), ['README.md', readme] as [string, string]]) {
      text.split('\n').forEach((line, i) => {
        const m = FORBIDDEN.exec(line);
        if (m) hits.push(`${file}:${i + 1}: ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
