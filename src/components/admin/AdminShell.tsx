import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, LogOut, Clock, PanelLeftClose, PanelLeftOpen, HelpCircle, User, SlidersHorizontal, ShieldCheck, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/landing/primitives";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, type NavItem } from "./nav";
import { CommandSearch } from "./CommandSearch";
import { NotificationCenter } from "./NotificationCenter";

const COLLAPSE_KEY = "bm-admin-sidebar-collapsed";

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); }, []);
  const toggle = () => setCollapsed((c) => { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); return !c; });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/entrar", replace: true });
  }

  const initials = (email.split("@")[0] ?? "").slice(0, 2).toUpperCase() || "BM";
  const mini = collapsed; // desktop only; mobile drawer always expanded

  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn("admin-canvas min-h-screen lg:grid lg:transition-[grid-template-columns] lg:duration-300", mini ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[264px_1fr]")}>
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col bg-surface-dark text-ink-foreground transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full")}>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(20rem_8rem_at_20%_0%,oklch(0.67_0.2_42/0.18),transparent)]" />
          <div className={cn("relative flex h-16 items-center gap-2 px-4", mini && "lg:justify-center lg:px-2")}>
            <div className={cn("rounded-lg bg-ink-foreground px-2 py-1 shadow-card", mini && "lg:hidden")}><Logo className="h-7" /></div>
            {mini && <span className="hidden h-9 w-9 place-items-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground lg:grid">BM</span>}
            <button className="ml-auto rounded-md p-1 text-ink-muted hover:text-ink-foreground lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
          </div>

          <nav aria-label="Super Admin" className="relative flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 pb-6 pt-2 [scrollbar-width:thin]">
            {ADMIN_NAV.map((s) => (
              <div key={s.title}>
                <p className={cn("px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted/60", mini && "lg:sr-only")}>{s.title}</p>
                {mini && <div className="mx-auto mb-2 hidden h-px w-6 bg-ink-border lg:block" aria-hidden />}
                <ul className="space-y-0.5">
                  {s.items.map((it) => <li key={it.label}><NavLink it={it} mini={mini} onNav={() => setOpen(false)} /></li>)}
                </ul>
              </div>
            ))}
          </nav>

          <button onClick={toggle} className="relative hidden h-12 items-center gap-2 border-t border-ink-border px-5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink-foreground lg:flex" aria-label={mini ? "Expandir menu" : "Recolher menu"}>
            {mini ? <PanelLeftOpen className="mx-auto h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Recolher</>}
          </button>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-surface-dark/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border-subtle bg-canvas/80 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-secondary lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
              <span className="hidden shrink-0 items-center gap-2 rounded-full bg-surface-dark px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-foreground md:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Plataforma BemMais
              </span>
              <div className="flex flex-1 justify-center"><CommandSearch /></div>
              <div className="flex items-center gap-1">
                <NotificationCenter />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a href="mailto:suporte@bemmais.com.br" aria-label="Ajuda" className="hidden h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:grid"><HelpCircle className="h-[18px] w-[18px]" /></a>
                  </TooltipTrigger>
                  <TooltipContent>Ajuda</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger className="ml-1 flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-secondary">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-dark font-display text-xs font-bold text-ink-foreground">{initials}</span>
                    <span className="hidden text-left leading-tight md:block">
                      <span className="block text-xs font-semibold">Super Admin</span>
                      <span className="block max-w-[140px] truncate text-[11px] text-muted-foreground">{email}</span>
                    </span>
                    <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-float">
                    <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => navigate({ to: "/admin/$", params: { _splat: "minha-conta" } })}><User className="h-4 w-4" /> Minha conta</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate({ to: "/admin/configuracoes" })}><SlidersHorizontal className="h-4 w-4" /> Preferências</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => navigate({ to: "/admin/permissoes" })}><ShieldCheck className="h-4 w-4" /> Segurança</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={signOut} className="text-danger focus:text-danger"><LogOut className="h-4 w-4" /> Sair</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function NavLink({ it, mini, onNav }: { it: NavItem; mini: boolean; onNav: () => void }) {
  const Icon = it.icon;
  const base = cn(
    "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-ink-muted transition-all duration-200 hover:translate-x-0.5 hover:bg-surface-dark-2 hover:text-ink-foreground",
    mini && "lg:justify-center lg:px-0 lg:hover:translate-x-0",
  );
  const active = "!bg-[linear-gradient(90deg,oklch(0.67_0.2_42/0.2),oklch(1_0_0/0.04))] !text-ink-foreground font-semibold shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary [&_svg]:text-primary";
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0 transition-colors" />
      <span className={cn("flex-1 truncate", mini && "lg:hidden")}>{it.label}</span>
      {"soon" in it && <Clock className={cn("h-3 w-3 opacity-40", mini && "lg:hidden")} aria-label="Módulo futuro" />}
    </>
  );
  const link = "to" in it ? (
    <Link to={it.to} onClick={onNav} activeOptions={{ exact: true }} className={base} activeProps={{ className: active }}>{inner}</Link>
  ) : (
    <Link to="/admin/$" params={{ _splat: it.soon }} onClick={onNav} className={base} activeProps={{ className: "!bg-surface-dark-2 !text-ink-foreground" }}>{inner}</Link>
  );
  if (!mini) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" className="hidden lg:block">{it.label}{"soon" in it ? " · em breve" : ""}</TooltipContent>
    </Tooltip>
  );
}
