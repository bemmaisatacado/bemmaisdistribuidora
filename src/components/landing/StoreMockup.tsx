import tenis1 from "@/assets/pack-tenis1.jpg";
import tenis2 from "@/assets/pack-tenis2.jpg";
import moda from "@/assets/pack-moda.jpg";
import { Heart, Search, ShoppingBag, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export const MOCK_PRODUCTS = [
  { img: tenis1, name: "Tênis Runner Pro", price: "R$ 299,90", old: "R$ 379,90", off: "-21%", parc: "10x de R$ 29,99" },
  { img: tenis2, name: "Tênis Street Hi", price: "R$ 349,90", old: "R$ 429,90", off: "-19%", parc: "10x de R$ 34,99" },
  { img: moda, name: "Kit Camiseta + Bolsa", price: "R$ 189,90", old: "R$ 229,90", off: "-17%", parc: "6x de R$ 31,65" },
];

const CATS = ["Tênis", "Roupas", "Bolsas", "Acessórios", "Ofertas"];

/** Desktop browser mockup of a fictional Brazilian reseller store ("Pisa Nove"). */
export function BrowserStore({ className, eager }: { className?: string; eager?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-lift", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="ml-3 truncate rounded-full bg-card px-3 py-1 text-[10px] text-muted-foreground">pisanove.com.br</span>
      </div>
      <div className="flex items-center justify-center gap-2 bg-ink py-1.5 text-[9px] font-bold uppercase tracking-wider text-ink-foreground sm:text-[10px]">
        <Truck className="h-3 w-3 text-primary" /> Frete grátis para todo o Brasil · 5% off no Pix
      </div>
      <div className="px-4 pt-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-sm font-extrabold tracking-tight">PISA<span className="text-primary">NOVE</span></span>
          <div className="hidden flex-1 items-center gap-2 rounded-full border border-border px-3 py-1 text-[10px] text-muted-foreground sm:flex">
            <Search className="h-3 w-3" /> O que você procura?
          </div>
          <div className="flex gap-2 text-foreground/70"><Heart className="h-4 w-4" /><ShoppingBag className="h-4 w-4" /></div>
        </div>
        <div className="mt-2 flex gap-4 overflow-hidden text-[10px] font-semibold text-muted-foreground">
          {CATS.map((c, i) => <span key={c} className={i === 0 ? "text-primary" : ""}>{c}</span>)}
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-primary px-3 py-3 text-primary-foreground sm:px-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-90">Semana do tênis</p>
            <p className="truncate font-display text-xs font-extrabold sm:text-base">Até 30% OFF + 10x sem juros</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-card px-2.5 py-1 text-[9px] font-bold uppercase text-foreground sm:px-3">Ver ofertas</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {MOCK_PRODUCTS.map((p) => (
            <div key={p.name} className="rounded-lg border border-border p-1.5">
              <div className="relative aspect-square overflow-hidden rounded-md bg-surface">
                <img src={p.img} alt={p.name} width={896} height={896} loading={eager ? "eager" : "lazy"} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[8px] font-bold text-primary-foreground">{p.off}</span>
              </div>
              <p className="mt-1.5 truncate text-[10px] font-semibold sm:text-xs">{p.name}</p>
              <p className="text-[8px] text-muted-foreground line-through sm:text-[9px]">{p.old}</p>
              <p className="text-[11px] font-extrabold sm:text-sm">{p.price}</p>
              <p className="truncate text-[8px] text-muted-foreground sm:text-[9px]">ou {p.parc} sem juros</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PhoneStore({ className }: { className?: string }) {
  const p = MOCK_PRODUCTS[1]!;
  return (
    <div className={cn("w-32 rounded-[1.75rem] border-[6px] border-ink bg-card p-2 text-foreground shadow-lift sm:w-44", className)}>
      <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-foreground/10" />
      <p className="text-center font-display text-[10px] font-extrabold">PISA<span className="text-primary">NOVE</span></p>
      <div className="relative mt-2 aspect-square overflow-hidden rounded-xl bg-surface">
        <img src={p.img} alt="" width={896} height={896} className="h-full w-full object-cover" />
        <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1 text-[8px] font-bold text-primary-foreground">{p.off}</span>
      </div>
      <p className="mt-2 text-[10px] font-semibold">{p.name}</p>
      <p className="text-[11px] font-extrabold">{p.price}</p>
      <p className="text-[8px] text-muted-foreground">ou {p.parc} sem juros</p>
      <div className="mt-2 rounded-full bg-primary py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
        Comprar agora
      </div>
    </div>
  );
}
