import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Package, Store, Search, Barcode, CornerDownLeft } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_NAV } from "./nav";

/** Global Ctrl/Cmd+K search. Only real entities available today: empresas, lojas, produtos, SKUs + navegação. */
export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim();
  const { data, isFetching } = useQuery({
    queryKey: ["cmd-search", term],
    enabled: open && term.length >= 2,
    staleTime: 15_000,
    queryFn: async () => {
      const like = `%${term.replace(/[%_,()]/g, " ")}%`;
      const [orgs, stores, products, skus] = await Promise.all([
        supabase.from("organizations").select("id,name,status").ilike("name", like).limit(5),
        supabase.from("stores").select("id,name").ilike("name", like).limit(5),
        supabase.from("products").select("id,name").ilike("name", like).limit(5),
        supabase.from("product_variants").select("id,sku").ilike("sku", like).limit(5),
      ]);
      return { orgs: orgs.data ?? [], stores: stores.data ?? [], products: products.data ?? [], skus: skus.data ?? [] };
    },
  });

  const go = (fn: () => void) => { setOpen(false); setQ(""); fn(); };
  const pages = ADMIN_NAV.flatMap((s) => s.items.filter((i) => "to" in i).map((i) => ({ ...i, section: s.title })));

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-border-subtle bg-surface-elevated px-3 text-sm text-muted-foreground shadow-card transition-all hover:border-primary/30 hover:text-foreground">
        <Search className="h-4 w-4 transition-colors group-hover:text-primary" />
        <span className="flex-1 truncate text-left">Buscar na BemMais...</span>
        <kbd className="hidden rounded-md border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-semibold sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar empresa, loja, produto, SKU ou página..." value={q} onValueChange={setQ} />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>{isFetching ? "Buscando..." : term.length < 2 ? "Digite ao menos 2 letras." : "Nada encontrado."}</CommandEmpty>
          {!!data?.orgs.length && (
            <CommandGroup heading="Empresas">
              {data.orgs.map((o) => (
                <CommandItem key={o.id} value={`org-${o.id}-${o.name}`} onSelect={() => go(() => navigate({ to: "/admin/empresas" }))}>
                  <Building2 className="h-4 w-4" /> {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.stores.length && (
            <CommandGroup heading="Lojas">
              {data.stores.map((s) => (
                <CommandItem key={s.id} value={`store-${s.id}-${s.name}`} onSelect={() => go(() => navigate({ to: "/admin/lojas" }))}>
                  <Store className="h-4 w-4" /> {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.products.length && (
            <CommandGroup heading="Produtos">
              {data.products.map((p) => (
                <CommandItem key={p.id} value={`prod-${p.id}-${p.name}`} onSelect={() => go(() => navigate({ to: "/admin/produtos" }))}>
                  <Package className="h-4 w-4" /> {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!data?.skus.length && (
            <CommandGroup heading="SKUs">
              {data.skus.map((v) => (
                <CommandItem key={v.id} value={`sku-${v.id}-${v.sku}`} onSelect={() => go(() => navigate({ to: "/admin/estoque" }))}>
                  <Barcode className="h-4 w-4" /> {v.sku}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Ir para">
            {pages.map((p) => {
              const Icon = p.icon;
              return (
                <CommandItem key={p.label + p.section} value={`${p.section} ${p.label}`} onSelect={() => go(() => navigate({ to: p.to }))}>
                  <Icon className="h-4 w-4" /> <span className="flex-1">{p.label}</span>
                  <span className="text-[11px] text-muted-foreground">{p.section}</span>
                  <CornerDownLeft className="h-3 w-3 opacity-40" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
