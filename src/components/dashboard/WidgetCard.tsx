/**
 * WidgetCard — shared shell for dashboard widgets (RSC-compatible).
 *
 * Wraps widget content in the common card chrome:
 *   rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden
 *
 * Accepts an optional className to add layout-specific classes at the
 * call site (e.g. grid column spans) without duplicating the shell.
 */

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function WidgetCard({ children, className }: Props) {
  const base = 'rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden';
  return (
    <div className={className ? `${base} ${className}` : base}>
      {children}
    </div>
  );
}
