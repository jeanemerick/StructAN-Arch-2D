import { describe, it, expect, vi } from 'vitest';
import { chooseSaveRoute, saveErrorMessage, saveWith } from '../src/ui/saver';

describe('chooseSaveRoute', () => {
  it('fora da plataforma (arquivo local, GitHub Pages) salva pelo link do navegador', () => {
    expect(chooseSaveRoute({ hosted: false, downloads: null })).toBe('anchor');
  });
  it('na página hospedada com a capacidade disponível salva pela plataforma', () => {
    expect(chooseSaveRoute({ hosted: true, downloads: { save: async () => ({ status: 'saved' as const }) } })).toBe('capability');
  });
  it('na página hospedada sem a capacidade avisa que não há como salvar', () => {
    expect(chooseSaveRoute({ hosted: true, downloads: null })).toBe('unavailable');
  });
});

describe('saveErrorMessage', () => {
  it('recusa de quem está vendo a página não gera mensagem', () => {
    expect(saveErrorMessage('declined')).toBeNull();
  });
  it('limite de pedidos pede para tentar de novo', () => {
    expect(saveErrorMessage('rate_limited')).toMatch(/tente de novo/i);
  });
  it('formato não permitido e códigos desconhecidos explicam que não foi possível salvar', () => {
    expect(saveErrorMessage('extension_not_enabled')).toMatch(/formato/i);
    expect(saveErrorMessage('unavailable')).toMatch(/não é possível salvar/i);
    expect(saveErrorMessage('qualquer-outro')).toMatch(/não é possível salvar/i);
  });
});

describe('saveWith', () => {
  const blob = new Blob(['{}'], { type: 'application/json' });
  it('rota capability chama save com nome e dados e devolve sem mensagem', async () => {
    const save = vi.fn(async () => ({ status: 'saved' as const }));
    const anchor = vi.fn();
    const msg = await saveWith({ hosted: true, downloads: { save } }, 'modelo.json', blob, anchor);
    expect(save).toHaveBeenCalledWith({ filename: 'modelo.json', data: blob });
    expect(anchor).not.toHaveBeenCalled();
    expect(msg).toBeNull();
  });
  it('rota capability com recusa não mostra erro; com falha mostra mensagem', async () => {
    const declined = { save: vi.fn(async () => Promise.reject({ code: 'declined', message: 'no' })) };
    expect(await saveWith({ hosted: true, downloads: declined }, 'a.csv', blob, vi.fn())).toBeNull();
    const broken = { save: vi.fn(async () => Promise.reject({ code: 'unavailable', message: 'x' })) };
    expect(await saveWith({ hosted: true, downloads: broken }, 'a.csv', blob, vi.fn())).toMatch(/não é possível salvar/i);
  });
  it('rota anchor chama o salvamento do navegador', async () => {
    const anchor = vi.fn();
    expect(await saveWith({ hosted: false, downloads: null }, 'a.png', blob, anchor)).toBeNull();
    expect(anchor).toHaveBeenCalledWith('a.png', blob);
  });
  it('rota unavailable devolve aviso e não tenta salvar', async () => {
    const anchor = vi.fn();
    const msg = await saveWith({ hosted: true, downloads: null }, 'a.png', blob, anchor);
    expect(anchor).not.toHaveBeenCalled();
    expect(msg).toMatch(/não é possível salvar/i);
  });
});
