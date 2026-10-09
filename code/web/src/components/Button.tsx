import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'm' | 's';
  block?: boolean;
  /** Icon shown before the label; the text label stays so the action is clear. */
  icon?: ReactNode;
}

/** Class names of a button, also usable on links that look like a button. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: 'm' | 's' = 'm', block = false): string {
  return ['btn', `btn-${variant}`, size === 's' && 'btn-small', block && 'btn-block'].filter(Boolean).join(' ');
}

export function Button({
  variant = 'secondary',
  size = 'm',
  block = false,
  icon,
  className,
  type = 'button',
  children,
  ...rest
}: Props) {
  const cls = buttonClass(variant, size, block) + (className ? ` ${className}` : '');
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}