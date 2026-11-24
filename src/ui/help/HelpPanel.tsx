import { useEffect, useMemo, useRef, useState } from 'react';
import { MANUAL } from './manual';

/** Texto sem acentos e em minúsculas, para a busca. */
export function normalize(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Manual numa área larga sobre o desenho e o painel: índice, busca e conteúdo. Esc fecha. */
export function HelpPanel({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState<Set<string> | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => {
    const q = normalize(query.trim());
    if (!q) {
      setVisible(null);
      return;
    }
    const words = q.split(/\s+/);
    const hit = new Set<string>();
    for (const [id, el] of refs.current) {
      const text = normalize(el.textContent ?? '');
      if (words.every((w) => text.includes(w))) hit.add(id);
    }
    setVisible(hit);
  }, [query]);

  const shown = useMemo(() => MANUAL.filter((s) => !visible || visible.has(s.id)), [visible]);

  return (
    <div
      className="help-overlay"
      role="dialog"
      aria-label="Ajuda"
      data-testid="help"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="help-head">
        <h2>Ajuda</h2>
        <input
          ref={searchRef}
          type="search"
          className="text help-search"
          id="help-search"
          data-testid="help-search"
          placeholder="Buscar no manual (ex.: rótula, projeção, temperatura)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn outline" data-testid="help-close" onClick={onClose}>
          Fechar (Esc)
        </button>
      </header>
      <div className="help-body">
        <nav className="help-toc" aria-label="Índice">
          {MANUAL.map((s) => (
            <button
              key={s.id}
              className={visible && !visible.has(s.id) ? 'dim' : ''}
              onClick={() => {
                if (visible && !visible.has(s.id)) setQuery('');
                setTimeout(() => refs.current.get(s.id)?.scrollIntoView({ block: 'start' }), 0);
              }}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div className="help-content" ref={contentRef}>
          {visible && shown.length === 0 && <p className="help">Nada encontrado para “{query}”.</p>}
          {MANUAL.map((s) => (
            <section
              key={s.id}
              id={`ajuda-${s.id}`}
              data-testid={`help-section-${s.id}`}
              ref={(el) => {
                if (el) refs.current.set(s.id, el);
                else refs.current.delete(s.id);
              }}
              hidden={!!visible && !visible.has(s.id)}
            >
              <h3>{s.title}</h3>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
