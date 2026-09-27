import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Inbox, Search, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, STATUS_LABEL, brl } from "@/lib/admin/format";

/* ---------------------------------------------------------------- Headers */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="admin-in mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden /> {eyebrow}
          </p>
        )}
        <h1 className="mt-2 font-display text-[clamp(1.5rem,2.4vw,2rem)] font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
export const AdminPageHeader = PageHeader;

export function EntityAvatar({ name, src, size = "md", className }: { name: string; src?: string | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const s = size === "sm" ? "h-8 w-8 text-[11px] rounded-lg" : size === "lg" ? "h-16 w-16 text-lg rounded-2xl" : "h-10 w-10 text-xs rounded-xl";
  return src ? (
    <img src={src} alt="" className={cn(s, "shrink-0 object-cover ring-1 ring-border-subtle", className)} />
  ) : (
    <span aria-hidden className={cn(s, "grid shrink-0 place-items-center bg-surface-dark font-display font-bold text-ink-foreground ring-1 ring-border-subtle", className)}>{initials}</span>
  );
}

export function EntityHeader({ name, src, status, meta, actions, children }: {
  name: string; src?: string | null; status?: string; meta?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <section className="admin-card admin-in mb-6 overflow-hidden">
      <div className="h-16 bg-[radial-gradient(40rem_8rem_at_90%_0%,var(--primary-soft),transparent)]" aria-hidden />
      <div className="-mt-8 flex flex-wrap items-end justify-between gap-4 px-5 pb-5">
        <div className="flex min-w-0 items-end gap-4">
          <EntityAvatar name={name} src={src} size="lg" className="ring-4 ring-surface-elevated" />
          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-xl font-bold tracking-tight">{name}</h1>
              {status && <Badge value={status} />}
            </div>
            {meta && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Surfaces */

export function Panel({ title, children, className, actions, description }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode; description?: string }) {
  return (
    <section className={cn("admin-card admin-in overflow-hidden", className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
export const SectionCard = Panel;

export function DarkPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("surface-dark admin-in relative overflow-hidden", className)}>{children}</section>;
}

/* ---------------------------------------------------------------- Metrics */

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string | undefined; icon?: LucideIcon }) {
  return (
    <div className="admin-card group p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-float">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />}
      </div>
      <p className="metric mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MetricCard({ label, value, hint, icon: Icon, size = "md", locked, spark, tone = "default" }: {
  label: string; value: ReactNode; hint?: string | undefined; icon?: LucideIcon; size?: "md" | "lg";
  locked?: string; spark?: number[] | undefined; tone?: "default" | "brand";
}) {
  return (
    <div className={cn("admin-card group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-float", size === "lg" ? "p-5" : "p-4")}>
      {tone === "brand" && <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />}
      <div className="relative flex items-center gap-2.5">
        {Icon && (
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg transition-colors",
            tone === "brand" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground group-hover:bg-primary-soft group-hover:text-primary")}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      </div>
      {locked ? (
        <div className="relative mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" /> {locked}
        </div>
      ) : (
        <>
          <p className={cn("metric relative mt-3 font-bold", size === "lg" ? "text-[clamp(1.6rem,2.4vw,2.1rem)]" : "text-2xl")}>{value}</p>
          {hint && <p className="relative mt-1 text-[11px] text-muted-foreground">{hint}</p>}
          {spark && spark.length > 1 && <Spark values={spark} />}
        </>
      )}
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-3 h-8 w-full text-primary" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("admin-card grid divide-y divide-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4", className)}>{children}</div>;
}
export function StatCell({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="metric mt-1.5 text-xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MoneyValue({ value, className }: { value: number | null | undefined; className?: string }) {
  const [int, dec] = brl(value ?? 0).split(",");
  return <span className={cn("metric whitespace-nowrap", className)}>{int}<span className="text-[0.7em] opacity-60">,{dec}</span></span>;
}

/* ---------------------------------------------------------------- Status */

type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "brand";
const TONE_CLS: Record<Tone, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  bad: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-secondary text-muted-foreground",
  brand: "bg-primary-soft text-primary",
};
export function toneFor(value: string): Tone {
  if (["active", "approved", "paid", "settled", "published", "available", "completed", "enabled"].includes(value)) return "ok";
  if (["pending", "pending_review", "processing", "scheduled", "in_review"].includes(value)) return "warn";
  if (["rejected", "failed", "suspended", "chargeback", "blocked", "overdue", "canceled", "cancelled", "refunded"].includes(value)) return "bad";
  if (["draft", "paused", "disabled", "archived", "inactive"].includes(value)) return "neutral";
  return "info";
}
export function Badge({ value, tone, label }: { value: string; tone?: Tone | undefined; label?: string }) {
  const t = tone ?? toneFor(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", TONE_CLS[t])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label ?? STATUS_LABEL[value] ?? value}
    </span>
  );
}
export const StatusBadge = Badge;

/* ---------------------------------------------------------------- Tables */

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; className?: string };

export function DataTable<T>({ columns, rows, loading, empty, rowKey }: {
  columns: Column<T>[]; rows: T[] | undefined; loading?: boolean; empty?: string; rowKey: (r: T) => string;
}) {
  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {columns.map((c) => <th key={c.key} className={cn("px-3 py-3 font-semibold first:pl-4", c.className)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>{columns.map((c) => <td key={c.key} className="px-3 py-3"><div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" /></td>)}</tr>
            ))
          ) : !rows?.length ? (
            <tr><td colSpan={columns.length}><Empty text={empty ?? "Nenhum registro ainda."} /></td></tr>
          ) : rows.map((r) => (
            <tr key={rowKey(r)} className="group transition-colors [&>td]:border-t [&>td]:border-border-subtle hover:bg-secondary/60">
              {columns.map((c) => <td key={c.key} className={cn("px-3 py-3 align-middle first:rounded-l-xl first:pl-4 last:rounded-r-xl", c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ text, icon: Icon = Inbox, action }: { text: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-muted-foreground">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-foreground/60"><Icon className="h-5 w-5" /></span>
      <span className="max-w-xs">{text}</span>
      {action}
    </div>
  );
}
export const EmptyState = Empty;

export function Pager({ page, setPage, total }: { page: number; setPage: (p: number) => void; total: number | null | undefined }) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
  const btn = "grid h-8 w-8 place-items-center rounded-lg bg-secondary transition-colors hover:bg-primary-soft hover:text-primary disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground">
      <span><b className="text-foreground">{total ?? 0}</b> registro(s)</span>
      <div className="flex items-center gap-2">
        <button className={btn} disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
        <span className="metric min-w-12 text-center font-semibold text-foreground">{page + 1} / {pages}</span>
        <button className={btn} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Filters */

export function FilterBar({ children, active, onClear }: { children: ReactNode; active?: number; onClear?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-4">
      {children}
      {!!active && onClear && (
        <button onClick={onClear} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-primary-soft">
          <X className="h-3.5 w-3.5" /> Limpar filtros ({active})
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Actions */

export function Btn({ variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" | "dark" }) {
  return (
    <button {...p} className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
      variant === "primary" && "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_var(--primary)] hover:bg-primary-hover",
      variant === "outline" && "border border-border-subtle bg-surface-elevated shadow-card hover:border-primary/40 hover:text-primary",
      variant === "ghost" && "hover:bg-secondary",
      variant === "dark" && "bg-surface-dark text-ink-foreground hover:bg-surface-dark-2", className)} />
  );
}

export function QuickAction({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children?: ReactNode }) {
  return (
    <span className="group flex items-center gap-3 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm font-semibold transition-all hover:bg-primary-soft hover:text-primary">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-elevated shadow-card transition-transform group-hover:scale-105"><Icon className="h-4 w-4" /></span>
      <span className="flex-1">{label}</span>{children}
      <ChevronRight className="h-4 w-4 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
    </span>
  );
}

export function AlertCard({ level, title, count, children }: { level: "critical" | "attention" | "pending" | "normal"; title: string; count?: ReactNode; children?: ReactNode }) {
  const tone = { critical: "bg-danger", attention: "bg-warning", pending: "bg-info", normal: "bg-success" }[level];
  return (
    <div className="admin-card relative overflow-hidden p-4 pl-5">
      <span className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", tone)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        {count !== undefined && <span className="metric text-xl font-bold">{count}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Timeline */

export function Timeline({ items }: { items: { id: string; title: ReactNode; time: string }[] }) {
  return (
    <ol className="relative px-5 pb-4 pt-1">
      <span className="absolute bottom-6 left-[27px] top-4 w-px bg-border" aria-hidden />
      {items.map((it) => (
        <li key={it.id} className="relative flex items-start gap-3 py-2">
          <span className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface-elevated bg-primary ring-1 ring-primary/30" />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="min-w-0">{it.title}</span>
            <span className="text-xs text-muted-foreground">{it.time}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- Forms */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground/80">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-xl bg-secondary/40 p-4">
      <legend className="float-left mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</legend>
      <div className="clear-both grid gap-3">{children}</div>
    </fieldset>
  );
}
const inputCls = "h-10 w-full rounded-lg border border-border bg-surface-elevated px-3 text-sm shadow-[inset_0_1px_2px_var(--border-subtle)] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15";
export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(inputCls, p.className)} />;
export const SelectInput = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(inputCls, "pr-8", p.className)} />;

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Buscar..."} className="pl-9" />
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error instanceof Error ? error.message : String((error as { message?: string }).message ?? error)}</p>;
}
