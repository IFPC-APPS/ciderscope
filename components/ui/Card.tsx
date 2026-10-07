import React from 'react';

interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Card = ({ title, children, className = '' }: CardProps) => (
  <div className={`mb-4 min-w-0 max-w-full overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--paper)] px-6 py-6 shadow-[var(--shadow)] max-[480px]:px-3.5 max-[480px]:py-4 ${className}`}>
    {title && <h3 className="mb-3.5 text-[15px] font-bold tracking-[-0.01em] text-[var(--ink)] break-words">{title}</h3>}
    {children}
  </div>
);
