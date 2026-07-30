import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Tone = 'primary' | 'success' | 'danger' | 'muted';

export function Button({
  tone = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button className={`ui-button ui-button-${tone} ${className}`} {...props} />;
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`ui-card ${className}`}>{children}</section>;
}

export function Chip({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`ui-chip ui-chip-${tone}`}>{children}</span>;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="ui-badge">{children}</span>;
}

export function Avatar({
  name,
  src,
}: {
  name?: string | null;
  src?: string | null;
}) {
  if (src) {
    return <img className="ui-avatar" src={src} alt={name || 'avatar'} />;
  }

  return <span className="ui-avatar">{(name?.trim()?.[0] || '?').toUpperCase()}</span>;
}

export function SearchBox(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ui-search" type="search" {...props} />;
}

export function Modal({
  title,
  children,
  open,
  onClose,
}: {
  title: string;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="ui-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ui-modal-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="סגור">
            x
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return <div className="ui-toast">{children}</div>;
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
