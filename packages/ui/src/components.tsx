'use client';

import { CURRENCY_META, formatMoney, type Currency } from '@onebank/shared';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export const cn = clsx;

// ---------------------------------------------------------------- Logo

export function Logo({ className, light = false, compact = false }: { className?: string; light?: boolean; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-serif font-bold tracking-wide', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gold-sheen text-navy-900 shadow-gold">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="12" cy="12" r="7.5" />
          <path d="M12 8v8" />
        </svg>
      </span>
      {!compact && (
        <span className={cn('text-xl', light ? 'text-white' : 'text-navy-800')}>
          One<span className="text-gold-500">Bank</span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- Button

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'outlineLight';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-800 text-white hover:bg-navy-700 shadow-sm',
  gold: 'bg-gold-sheen text-navy-900 hover:brightness-105 shadow-gold',
  secondary: 'bg-navy-50 text-navy-800 hover:bg-navy-100',
  outline: 'border border-navy-200 bg-white text-navy-800 hover:border-navy-400',
  /** For dark (navy) surfaces. */
  outlineLight: 'border border-white/25 bg-white/5 text-white hover:border-white/60 hover:bg-white/10',
  ghost: 'text-navy-700 hover:bg-navy-50',
  danger: 'bg-danger text-white hover:bg-red-800',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' && 'h-8 px-3.5 text-xs',
        size === 'md' && 'h-10 px-5 text-sm',
        size === 'lg' && 'h-12 px-7 text-[15px]',
        block && 'w-full',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Form fields

export function Field({ label, error, hint, children, className, htmlFor }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-navy-700">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : hint ? <p className="text-xs text-navy-400">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  'block w-full rounded-xl border border-navy-100 bg-white px-3.5 text-sm text-navy-900 placeholder:text-navy-300 transition focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-100 disabled:bg-navy-50 disabled:text-navy-400';

export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & { invalid?: boolean; prefix?: ReactNode }>(function Input({ className, invalid, prefix, ...rest }, ref) {
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-navy-400">{prefix}</span>
        <input ref={ref} className={cn(inputBase, 'h-11 pl-9', invalid && 'border-danger', className)} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={cn(inputBase, 'h-11', invalid && 'border-danger', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-[96px] py-2.5', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27 fill=%27%237F8FB8%27%3E%3Cpath d=%27M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z%27/%3E%3C/svg%3E")] bg-[length:18px] bg-[right_12px_center] bg-no-repeat pr-10', className)} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50', checked ? 'bg-gold-500' : 'bg-navy-100')}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

/** 4-digit PIN entry with auto-advance. */
export function PinInput({ value, onChange, length = 4, autoFocus }: { value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          aria-label={`PIN digit ${i + 1}`}
          value={value[i] ?? ''}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            const next = (value.slice(0, i) + d + value.slice(i + 1)).slice(0, length);
            onChange(next);
            if (d && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const d = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (d) {
              e.preventDefault();
              onChange(d);
              refs.current[Math.min(d.length, length - 1)]?.focus();
            }
          }}
          className="h-14 w-12 rounded-xl border border-navy-100 bg-white text-center text-2xl font-semibold text-navy-900 focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-100"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Surfaces

export function Card({ className, children, padded = true, ...rest }: { className?: string; children: ReactNode; padded?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-w-0 rounded-2xl border border-navy-100/70 bg-white shadow-card', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div>
        <h3 className="font-serif text-lg text-navy-800">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-navy-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back}
        <h1 className="font-display text-2xl text-navy-800 sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-navy-50 text-navy-600',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  gold: 'bg-gold-50 text-gold-700',
  info: 'bg-sky-50 text-sky-700',
} as const;
export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', BADGE_TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  PAID: 'success',
  REPAID: 'success',
  RESOLVED: 'success',
  SENT: 'success',
  MATURED: 'success',
  DISBURSED: 'info',
  PENDING: 'warning',
  PROCESSING: 'info',
  AWAITING_REVIEW: 'warning',
  APPLIED: 'warning',
  OPEN: 'info',
  DUE: 'neutral',
  QUEUED: 'neutral',
  INVITED: 'neutral',
  PENDING_VERIFICATION: 'warning',
  LATE: 'danger',
  SUSPENDED: 'warning',
  FROZEN: 'info',
  FAILED: 'danger',
  REJECTED: 'danger',
  BLOCKED: 'danger',
  CLOSED: 'neutral',
  TERMINATED: 'neutral',
  REVERSED: 'neutral',
  DEFAULTED: 'danger',
  DECLINED: 'danger',
  DISABLED: 'neutral',
  BROKEN: 'neutral',
  DISMISSED: 'neutral',
  CONFIRMED: 'danger',
  HIGH: 'danger',
  URGENT: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className} dot>
      {status.replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-gold-500', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-lg bg-navy-50 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent', className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gold-50 text-gold-600">{icon}</div>}
      <p className="font-serif text-lg text-navy-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-navy-400">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative max-h-[92vh] w-full animate-fade-up overflow-y-auto rounded-t-3xl bg-white shadow-lift sm:rounded-3xl',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-navy-50 bg-white/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="font-serif text-xl text-navy-800">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-navy-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-navy-50 bg-white px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-full bg-navy-50 p-1', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition', value === t.value ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-800')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-navy-100 px-1.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-navy-500">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="h-4 w-4" />}>
          Prev
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, icon, tone = 'default', className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'default' | 'navy'; className?: string }) {
  return (
    <Card className={cn(tone === 'navy' && 'border-0 bg-navy-deep text-white', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-xs font-medium uppercase tracking-wider', tone === 'navy' ? 'text-gold-300' : 'text-navy-400')}>{label}</p>
          <p className={cn('mt-2 truncate font-sans tabular-nums tracking-tight text-2xl font-semibold', tone === 'navy' ? 'text-white' : 'text-navy-800')}>{value}</p>
          {sub && <p className={cn('mt-1 text-xs', tone === 'navy' ? 'text-navy-200' : 'text-navy-400')}>{sub}</p>}
        </div>
        {icon && <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tone === 'navy' ? 'bg-white/10 text-gold-300' : 'bg-gold-50 text-gold-600')}>{icon}</div>}
      </div>
    </Card>
  );
}

export function Money({ amount, currency, sign, className }: { amount: string | number; currency: string; sign?: boolean; className?: string }) {
  const n = Number(amount);
  return <span className={cn('tabular-nums', sign && n > 0 && 'text-success', sign && n < 0 && 'text-navy-800', className)}>{formatMoney(amount, currency, { sign })}</span>;
}

/** Currency badge (emoji flags don't render on Windows, so we use a minted-coin style mark). */
export function CurrencyFlag({ currency, className, size = 'md' }: { currency: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const meta = CURRENCY_META[currency as Currency];
  return (
    <span
      title={meta?.name ?? currency}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-navy-700 to-navy-900 font-sans tabular-nums tracking-tight font-semibold text-gold-300 ring-2 ring-gold-400/40',
        size === 'sm' && 'h-7 w-7 text-xs',
        size === 'md' && 'h-10 w-10 text-base',
        size === 'lg' && 'h-12 w-12 text-lg',
        className,
      )}
    >
      {meta?.symbol ?? currency.slice(0, 1)}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-800 text-xs font-semibold text-gold-300', className)}>{initials || '?'}</span>;
}

export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-navy-50', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-2.5 text-sm">
          <dt className="text-navy-400">{k}</dt>
          <dd className="text-right font-medium text-navy-800 [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = 'info', title, children, className, action }: { tone?: 'info' | 'warning' | 'danger' | 'success' | 'gold'; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const tones = {
    info: 'border-sky-100 bg-sky-50 text-sky-900',
    warning: 'border-amber-100 bg-amber-50 text-amber-900',
    danger: 'border-red-100 bg-red-50 text-red-900',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    gold: 'border-gold-200 bg-gold-50 text-navy-800',
  };
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between', tones[tone], className)}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('-mx-5 overflow-x-auto sm:-mx-6', className)}>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-navy-50 text-left text-[11px] uppercase tracking-wider text-navy-400">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-3 font-semibold first:pl-5 sm:px-6 sm:first:pl-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-50">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, ...rest }: { children?: ReactNode; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('whitespace-nowrap px-5 py-3.5 text-navy-700 sm:px-6', className)} {...rest}>
      {children}
    </td>
  );
}
