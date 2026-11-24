import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { parseNumber } from './format';

/** Mostra um número sem ruído de ponto flutuante, com vírgula decimal. */
export function showNumber(v: number): string {
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toPrecision(10))).replace('.', ',');
}

interface NumProps {
  /** Valor interno (unidades do núcleo). */
  value: number;
  /** Recebe o valor interno já convertido. */
  onCommit(v: number): void;
  unit?: string;
  /** valor_interno = valor_exibido × factor */
  factor?: number;
  valid?(v: number): boolean;
  disabled?: boolean;
  testid?: string;
  title?: string;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * Campo numérico: aceita vírgula ou ponto, aplica ao sair do campo ou com Enter. Valor não
 * finito (NaN) aparece vazio. Dentro de um FormScope, o Enter também envia o formulário.
 */
export function NumField({ value, onCommit, unit, factor = 1, valid, disabled, testid, title, inputRef }: NumProps) {
  const autoId = useId();
  const shown = showNumber(value / factor);
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(shown);
      setBad(false);
    }
  }, [shown, editing]);

  const commit = () => {
    setEditing(false);
    const v = parseNumber(draft);
    if (v === null || (valid && !valid(v * factor))) {
      setBad(true);
      setEditing(true);
      return;
    }
    setBad(false);
    if (showNumber(v) !== shown) onCommit(v * factor);
    else setDraft(shown);
  };

  return (
    <label className={`num${bad ? ' invalid' : ''}`} title={title}>
      <input
        type="text"
        inputMode="decimal"
        id={testid ?? autoId}
        ref={inputRef}
        value={draft}
        disabled={disabled}
        data-testid={testid}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setEditing(true);
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(shown);
            setBad(false);
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && <em>{unit}</em>}
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Check({ checked, onChange, children, testid }: { checked: boolean; onChange(v: boolean): void; children: ReactNode; testid?: string }) {
  const autoId = useId();
  return (
    <label className="check">
      <input type="checkbox" id={testid ?? autoId} checked={checked} data-testid={testid} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/**
 * Formulário de criação ou edição: Enter num campo de texto (depois de o campo confirmar o
 * valor) envia, a não ser que algum campo esteja com valor inválido; Esc cancela e segue
 * adiante (a página aplica a ordem do Esc). O envio roda depois de o React aplicar o valor.
 */
export function FormScope({ onSubmit, onCancel, children, testid }: { onSubmit(): void; onCancel?(): void; children: ReactNode; testid?: string }) {
  const latest = useRef({ onSubmit, onCancel });
  latest.current = { onSubmit, onCancel };
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="form-scope"
      data-testid={testid}
      onKeyDown={(e) => {
        const t = e.target as HTMLInputElement;
        const isText = t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio';
        if (e.key === 'Enter' && isText) {
          e.preventDefault();
          setTimeout(() => {
            // campo com valor inválido: não envia e devolve o foco a ele
            const bad = ref.current?.querySelector<HTMLInputElement>('.num.invalid input');
            if (bad) {
              bad.focus();
              return;
            }
            latest.current.onSubmit();
          }, 0);
        } else if (e.key === 'Escape') {
          setTimeout(() => latest.current.onCancel?.(), 0);
        }
      }}
    >
      {children}
    </div>
  );
}
