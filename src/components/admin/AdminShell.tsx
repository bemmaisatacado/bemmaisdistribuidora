import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, LogOut, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/landing/primitives";
import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "./nav";

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/entrar", replace: true });
  }

  const linkCls = "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-foreground";

  return (
    <div className="min-h-screen bg-secondary/50 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-[248px] overflow-y-auto bg-ink text-ink-foreground transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="rounded-md bg-ink-foreground px-2 py-1"><Logo className="h-8" /></div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
        </div>
        <nav aria-label="Super Admin" className="space-y-4 px-3 pb-8">
          {ADMIN_NAV.map((s) => (
            <div key={s.title}>
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted/70">{s.title}</p>
              <ul>
                {s.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.label}>
                      {"to" in it ? (
                        <Link to={it.to} onClick={() => setOpen(false)} activeOptions={{ exact: true }}
                          className={linkCls} activeProps={{ className: "!bg-primary/15 !text-ink-foreground font-semibold" }}>
                          <Icon className="h-4 w-4 shrink-0" /> {it.label}
                        </Link>
                      ) : (
                        <Link to="/admin/$" params={{ _splat: it.soon }} onClick={() => setOpen(false)}
                          className={linkCls} activeProps={{ className: "!bg-white/5 !text-ink-foreground" }}>
                          <Icon className="h-4 w-4 shrink-0" /> <span className="flex-1">{it.label}</span>
                          <Clock className="h-3 w-3 opacity-50" aria-label="Módulo futuro" />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Super Admin</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{email}</span>
            <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
