import React from 'react';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
}

const VARIANT_CLASSES: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
  outline: 'bg-transparent text-slate-600 border border-slate-300',
};

export default function Badge({ label, variant = 'default' }: BadgeProps): React.ReactElement {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.default}`}>
      {label}
    </span>
  );
}
