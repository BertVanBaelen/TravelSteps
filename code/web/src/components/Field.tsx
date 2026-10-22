import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Listbox, type ListboxOption } from './Listbox';

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

interface SelectProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ListboxOption[];
  hint?: string;
  disabled?: boolean;
}

/** Labelled dropdown in the app style (replaces the native select). */
export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  hint,
  disabled,
}: SelectProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <Listbox
        id={name}
        variant="field"
        title={label}
        options={options}
        selected={value}
        onSelect={onChange}
        disabled={disabled}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
export function Alert({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  return (
    <p className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
