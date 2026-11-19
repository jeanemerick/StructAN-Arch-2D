import { useEffect, useState, type ReactNode } from 'react';
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
}

/** Campo numérico: aceita vírgula ou ponto, aplica ao sair do campo ou com Enter. */
export function NumField({ value, onCommit, unit, factor = 1, valid, disabled, testid, title }: NumProps) {
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
  return (
    <label className="check">
      <input type="checkbox" checked={checked} data-testid={testid} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
