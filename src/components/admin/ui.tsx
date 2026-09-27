import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, STATUS_LABEL } from "@/lib/admin/format";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Badge({ value, tone }: { value: string; tone?: "ok" | "warn" | "bad" | "neutral" }) {
  const t = tone ?? (["active", "approved", "paid", "settled"].includes(value) ? "ok"
    : ["pending", "pending_review", "draft", "processing"].includes(value) ? "warn"
    : ["rejected", "failed", "suspended", "chargeback", "disabled"].includes(value) ? "bad" : "neutral");
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
      t === "ok" && "bg-primary-soft text-primary",
      t === "warn" && "bg-secondary text-foreground",
      t === "bad" && "bg-destructive/10 text-destructive",
      t === "neutral" && "bg-muted text-muted-foreground")}>
      {STATUS_LABEL[value] ?? value}
    </span>
  );
}

export type Column<T> = { key: string; label: string; render: (row: T) => ReactNode; className?: string };

export function DataTable<T>({ columns, rows, loading, empty, rowKey }: {
  columns: Column<T>[]; rows: T[] | undefined; loading?: boolean; empty?: string; rowKey: (r: T) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => <th key={c.key} className={cn("px-4 py-2.5 font-semibold", c.className)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">Carregando...</td></tr>
          ) : !rows?.length ? (
            <tr><td colSpan={columns.length}><Empty text={empty ?? "Nenhum registro ainda."} /></td></tr>
          ) : rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-border last:border-0 hover:bg-secondary/40">
              {columns.map((c) => <td key={c.key} className={cn("px-4 py-2.5 align-middle", c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" /> {text}
    </div>
  );
}

export function Pager({ page, setPage, total }: { page: number; setPage: (p: number) => void; total: number | null | undefined }) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
      <span>{total ?? 0} registro(s)</span>
      <div className="flex items-center gap-2">
        <button className="rounded-md border border-border p-1 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
        <span>{page + 1} / {pages}</span>
        <button className="rounded-md border border-border p-1 disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function Btn({ variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }) {
  return (
    <button {...p} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50",
      variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
      variant === "outline" && "border border-border bg-card hover:bg-secondary",
      variant === "ghost" && "hover:bg-secondary", className)} />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm"><span className="text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}
const inputCls = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(inputCls, p.className)} />;
export const SelectInput = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(inputCls, p.className)} />;

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Buscar..."} className="max-w-xs" />;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error instanceof Error ? error.message : String((error as { message?: string }).message ?? error)}</p>;
}
