import React from 'react';

/**
 * Shared presentational atoms for the surveyor drill-down UI.
 * Styling follows the site-wide dark glassmorphism + cyan/blue accent language.
 */

type BadgeVariant = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'neutral';

const BADGE_STYLES: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  accent: { bg: 'rgba(56,189,248,0.12)', text: '#38bdf8', border: 'rgba(56,189,248,0.35)' },
  success: { bg: 'rgba(16,185,129,0.12)', text: '#34d399', border: 'rgba(16,185,129,0.35)' },
  warning: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', border: 'rgba(245,158,11,0.35)' },
  danger: { bg: 'rgba(239,68,68,0.12)', text: '#f87171', border: 'rgba(239,68,68,0.35)' },
  muted: { bg: 'rgba(100,116,139,0.12)', text: '#64748b', border: 'rgba(100,116,139,0.35)' },
  neutral: { bg: 'rgba(255,255,255,0.06)', text: '#cbd5e1', border: 'rgba(255,255,255,0.14)' },
};

export function Badge({
  variant = 'neutral',
  dot,
  children,
  style,
}: {
  variant?: BadgeVariant;
  dot?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const v = BADGE_STYLES[variant];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: v.bg, color: v.text, border: `1px solid ${v.border}`,
        borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        backdropFilter: 'blur(14px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const BUTTON_BASE: React.CSSProperties = {
  border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
  fontSize: 12.5, letterSpacing: '0.02em', whiteSpace: 'nowrap',
  transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
};

export function PrimaryButton({
  children,
  onClick,
  disabled,
  busy,
  id,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        ...BUTTON_BASE,
        background: busy ? 'rgba(14,165,233,0.6)' : 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
        color: '#04121a', padding: '8px 16px', opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {busy ? '…' : children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  busy,
  id,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        ...BUTTON_BASE,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: '#94a3b8', padding: '7px 14px', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {busy ? '…' : children}
    </button>
  );
}

export function AccentGhostButton({
  children,
  onClick,
  disabled,
  busy,
  id,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        ...BUTTON_BASE,
        background: 'rgba(56,189,248,0.08)',
        border: '1px solid rgba(56,189,248,0.35)',
        color: '#38bdf8', padding: '7px 14px', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {busy ? '…' : children}
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
  disabled,
  busy,
  id,
  title,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  id?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      id={id}
      title={title}
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        ...BUTTON_BASE,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.35)',
        color: '#f87171', padding: '7px 12px', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {busy ? '…' : children}
    </button>
  );
}

export function IconButton({
  children,
  onClick,
  disabled,
  title,
  accent,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  accent?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: accent ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.05)',
        border: accent ? '1px solid rgba(56,189,248,0.35)' : '1px solid rgba(255,255,255,0.12)',
        color: accent ? '#38bdf8' : '#94a3b8',
        borderRadius: 7, padding: '6px 10px', cursor: 'pointer', fontSize: 12,
        display: 'inline-flex', alignItems: 'center', gap: 5, opacity: disabled ? 0.45 : 1,
        transition: 'all 0.15s', ...style,
      }}
    >
      {children}
    </button>
  );
}

export function InlineInput({
  value,
  onChange,
  placeholder,
  width,
  type = 'text',
  id,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
  type?: 'text' | 'number';
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(2,8,23,0.6)',
        border: '1px solid rgba(56,189,248,0.3)',
        borderRadius: 7, color: '#e2e8f0', padding: '6px 10px', fontSize: 12.5,
        outline: 'none', width: width ?? 150, fontFamily: 'inherit',
        ...style,
      }}
    />
  );
}

export function InlineSelect({
  value,
  onChange,
  options,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  width?: number;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(2,8,23,0.6)',
        border: '1px solid rgba(56,189,248,0.3)',
        borderRadius: 7, color: '#e2e8f0', padding: '6px 8px', fontSize: 12.5,
        outline: 'none', width: width ?? 140, fontFamily: 'inherit',
      }}
    >
      {options.map((o) => (
        <option key={o} value={o} style={{ background: '#0a1628' }}>{o}</option>
      ))}
    </select>
  );
}

export function TextAreaInput({
  value,
  onChange,
  placeholder,
  rows = 3,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(2,8,23,0.6)',
        border: '1px solid rgba(56,189,248,0.3)',
        borderRadius: 7, color: '#e2e8f0', padding: '6px 10px', fontSize: 12.5,
        outline: 'none', width: '100%', fontFamily: 'inherit', resize: 'vertical',
        ...style,
      }}
    />
  );
}

export function InlineError({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex', gap: 6, alignItems: 'flex-start',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.35)',
        color: '#fca5a5', borderRadius: 7, padding: '6px 10px',
        fontSize: 12, lineHeight: 1.5,
        ...style,
      }}
    >
      <span style={{ flexShrink: 0 }}>⚠</span>
      <span>{children}</span>
    </div>
  );
}

export function SuccessNote({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex', gap: 6, alignItems: 'center',
        background: 'rgba(16,185,129,0.1)',
        border: '1px solid rgba(16,185,129,0.35)',
        color: '#6ee7b7', borderRadius: 7, padding: '6px 10px',
        fontSize: 12, lineHeight: 1.5,
        ...style,
      }}
    >
      <span style={{ flexShrink: 0 }}>✓</span>
      <span>{children}</span>
    </div>
  );
}

export function UlpinCode({ code }: { code: string }) {
  return (
    <code
      style={{
        fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.03em',
        background: 'rgba(56,189,248,0.08)', color: '#7dd3fc',
        border: '1px solid rgba(56,189,248,0.25)',
        borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
      }}
    >
      {code}
    </code>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 20px', justifyContent: 'center' }}>
      <div
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid rgba(56,189,248,0.2)', borderTop: '3px solid #38bdf8',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{label}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        textAlign: 'center', padding: '28px 20px',
        color: '#64748b', fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
      {children}
    </div>
  );
}

export interface CrumbSegment {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

export function Breadcrumbs({ segments }: { segments: CrumbSegment[] }) {
  return (
    <nav
      style={{
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        fontSize: 13, marginBottom: 18,
      }}
      aria-label="Surveyor drill-down breadcrumb"
    >
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: '#334155' }}>›</span>}
          {seg.onClick ? (
            <button
              onClick={seg.onClick}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#38bdf8', fontSize: 13, padding: '2px 4px',
                fontFamily: 'inherit', fontWeight: 500,
              }}
            >
              {seg.label}
            </button>
          ) : (
            <span
              style={{
                color: seg.active ? '#e2e8f0' : '#94a3b8',
                fontWeight: seg.active ? 600 : 400, padding: '2px 4px',
              }}
            >
              {seg.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}