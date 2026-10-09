import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, id, ...input }: FieldProps) {
  const inputId = id ?? input.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input id={inputId} {...input} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export function TextAreaField({ label, hint, id, ...input }: TextAreaProps) {
  const inputId = id ?? input.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <textarea id={inputId} {...input} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function SelectField({ label, id, children, ...input }: SelectProps) {
  const inputId = id ?? input.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <select id={inputId} {...input}>
        {children}
      </select>
    </label>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
