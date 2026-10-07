import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ok' | 'ghost' | 'danger' | 'dangerGhost';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export const Button = ({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) => {
  const baseClass = 'inline-flex cursor-pointer items-center gap-[7px] rounded-[var(--radius)] border border-transparent font-semibold leading-none transition-[background,border-color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring-line)]';
  const sizeClass = size === 'sm'
    ? 'min-h-[34px] rounded-lg px-3 py-[7px] text-[12.5px] max-[480px]:min-h-[34px] max-[480px]:text-xs'
    : 'min-h-[42px] px-[18px] py-2.5 text-sm max-[480px]:px-4 max-[480px]:text-[13px]';
  const variantClass = {
    primary: 'border-[var(--primary)] bg-[var(--primary)] text-white hover:border-[var(--primary-2)] hover:bg-[var(--primary-2)]',
    ok: 'border-[var(--primary)] bg-[var(--primary)] text-white hover:border-[var(--primary-2)] hover:bg-[var(--primary-2)]',
    secondary: 'border-[var(--border)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--border-strong)] hover:bg-[var(--paper2)]',
    ghost: 'border-transparent bg-transparent text-[var(--mid)] hover:bg-[rgba(98,141,23,.06)] hover:text-[var(--primary)]',
    danger: 'border-[var(--danger)] bg-[var(--danger)] text-white hover:brightness-105',
    dangerGhost: 'border-transparent bg-transparent text-[var(--danger)] hover:bg-[rgba(198,40,40,.06)] hover:text-[var(--danger)]',
  }[variant];
  
  return (
    <button 
      className={`${baseClass} ${variantClass} ${sizeClass} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
};
