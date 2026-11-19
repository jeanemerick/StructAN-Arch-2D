/**
 * Onde a tecla foi digitada: 'text' (campos de texto: os atalhos ficam desligados),
 * 'select' (listas: só os atalhos com Ctrl, Esc e Delete valem) ou 'other'.
 */
export type HotkeyTarget = 'text' | 'select' | 'other';

const TEXT_TYPES = new Set(['', 'text', 'search', 'number', 'email', 'password', 'tel', 'url']);

export function hotkeyTarget(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): HotkeyTarget {
  if (!el) return 'other';
  if (el.isContentEditable) return 'text';
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return 'text';
  if (tag === 'INPUT') return TEXT_TYPES.has((el.type ?? '').toLowerCase()) ? 'text' : 'other';
  if (tag === 'SELECT') return 'select';
  return 'other';
}
