import calcados from "@/assets/cat-calcados.jpg";
import vestuario from "@/assets/cat-vestuario.jpg";
import acessorios from "@/assets/cat-acessorios.jpg";
import { cn } from "@/lib/utils";

export const MOCK_PRODUCTS = [
  { img: calcados, name: "Tênis Couro Essential", price: "R$ 389,90" },
  { img: vestuario, name: "Overshirt Sarja", price: "R$ 279,90" },
  { img: acessorios, name: "Bolsa Estruturada", price: "R$ 459,90" },
];

/** Desktop browser mockup of a reseller's white‑label store (fictional brand "Atelier Nove"). */
export function BrowserStore({ className, eager }: { className?: string; eager?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-lift", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="ml-3 truncate rounded-full bg-card px-3 py-1 text-[10px] text-muted-foreground">
          ateliernove.com.br
        </span>
      </div>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="font-display text-sm font-bold tracking-[0.25em]">ATELIER NOVE</span>
          <div className="hidden gap-4 text-[10px] font-semibold text-muted-foreground sm:flex">
            <span>Calçados</span><span>Vestuário</span><span>Acessórios</span>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface px-4 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nova coleção</p>
          <p className="mt-1 font-display text-base font-bold sm:text-lg">Essenciais da estação</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {MOCK_PRODUCTS.map((p) => (
            <div key={p.name}>
              <div className="aspect-[4/5] overflow-hidden rounded-lg bg-surface">
                <img src={p.img} alt={p.name} width={896} height={1120} loading={eager ? "eager" : "lazy"} className="h-full w-full object-cover" />
              </div>
              <p className="mt-2 truncate text-[10px] font-semibold sm:text-xs">{p.name}</p>
              <p className="text-[10px] text-muted-foreground sm:text-xs">{p.price}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PhoneStore({ className }: { className?: string }) {
  const p = MOCK_PRODUCTS[0]!;
  return (
    <div className={cn("w-32 rounded-[1.75rem] border-[6px] border-ink bg-card p-2 shadow-lift sm:w-44", className)}>
      <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-foreground/10" />
      <p className="text-center font-display text-[9px] font-bold tracking-[0.25em]">ATELIER NOVE</p>
      <div className="mt-2 aspect-[4/5] overflow-hidden rounded-xl bg-surface">
        <img src={p.img} alt="" width={896} height={1120} className="h-full w-full object-cover" />
      </div>
      <p className="mt-2 text-[10px] font-semibold">{p.name}</p>
      <p className="text-[10px] text-muted-foreground">{p.price}</p>
      <div className="mt-2 rounded-full bg-ink py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-ink-foreground">
        Comprar
      </div>
    </div>
  );
}
