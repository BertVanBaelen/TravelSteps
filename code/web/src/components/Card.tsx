import type { HTMLAttributes } from 'react';

/** White rounded surface; the basic building block of every page. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card${className ? ` ${className}` : ''}`} {...rest} />;
}
