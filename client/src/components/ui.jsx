import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Loader2, X } from 'lucide-react';

export const INPUT =
  'w-full h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-offset-0 focus:outline-accent/25 focus:border-accent disabled:bg-canvas disabled:text-ink-3 disabled:cursor-not-allowed';

export const LABEL = 'block text-sm font-medium text-ink mb-1.5';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed';

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-white hover:bg-accent-strong',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
  danger: 'bg-surface text-bad border border-line hover:bg-bad-soft',
  ghost: 'text-ink-2 hover:bg-canvas hover:text-ink',
};

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-3.5 text-sm',
  icon: 'h-8 w-8',
};

export function buttonClass(variant = 'primary', size = 'md') {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]}`;
}

export function Button({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className = '', children, ...props }) {
  return (
    <div className={`bg-surface border border-line rounded-lg ${className}`} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, description, actions }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-line">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

const STATUS = {
  unverified: ['Unverified', 'bg-warn-soft text-warn'],
  pending: ['Pending', 'bg-warn-soft text-warn'],
  verified: ['Verified', 'bg-ok-soft text-ok'],
  rejected: ['Rejected', 'bg-bad-soft text-bad'],
};

export function StatusBadge({ status, label }) {
  const [text, tone] = STATUS[status] || [status, 'bg-canvas text-ink-2'];
  return (
    <span className={`inline-flex items-center h-6 px-2 rounded text-xs font-medium ${tone}`}>
      {label || text}
    </span>
  );
}

const NOTICE_TONES = {
  error: 'border-bad/25 bg-bad-soft text-bad',
  warn: 'border-warn/25 bg-warn-soft text-warn',
  ok: 'border-ok/25 bg-ok-soft text-ok',
};

export function Notice({ tone = 'error', icon: Icon = CircleAlert, children, onDismiss, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${NOTICE_TONES[tone]} ${className}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="px-6 py-14 text-center">
      {Icon && <Icon className="w-8 h-8 text-ink-3 mx-auto mb-3" strokeWidth={1.5} />}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mt-1 text-sm text-ink-3">{children}</p>}
    </div>
  );
}

export function Loading({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-ink-3">
      <Loader2 className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5" role="tablist">
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`h-8 px-3 rounded text-sm font-medium transition-colors ${
            value === key ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ModalDialog({ title, description, onClose, footer, children }) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && previouslyFocused.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className="w-full max-w-lg rounded-lg border border-line bg-surface shadow-xl focus:outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-ink">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-ink-3">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`${buttonClass('ghost', 'icon')} -mr-2 -mt-1 shrink-0`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Modal({ open, ...props }) {
  if (!open) return null;
  return <ModalDialog {...props} />;
}
