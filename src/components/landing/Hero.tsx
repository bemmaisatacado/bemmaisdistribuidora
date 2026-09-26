import { ArrowRight, Package, ShoppingBag, TrendingUp, Sparkles } from "lucide-react";
import { Button, Container } from "./primitives";
import { BrowserStore, PhoneStore } from "./StoreMockup";

function MiniCard({ icon: Icon, label, value, className }: { icon: typeof Package; label: string; value: string; className?: string }) {
  return (
    <div className={`glass float-y flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ${className ?? ""}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-display text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

const TICKER = ["São Paulo", "Recife", "Porto Alegre", "Manaus", "Belo Horizonte", "Drop sem estoque", "Atacado", "Grade fechada", "Loja white-label", "Estoque híbrido", "BemMais Academy", "Pedidos integrados"];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-8 pb-10 sm:pt-12 lg:pt-14">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div className="orb -left-32 top-10 h-96 w-96 bg-primary/25" aria-hidden />
      <div className="orb right-0 top-20 h-80 w-80 bg-brasil-yellow/30" style={{ animationDelay: "-6s" }} aria-hidden />
      <div className="orb bottom-0 left-1/3 h-72 w-72 bg-brasil-green/20" style={{ animationDelay: "-12s" }} aria-hidden />

      <Container className="relative grid items-center gap-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.2em]">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Feito no Brasil · Para quem vende no Brasil
          </span>
          <h1 className="mt-5 text-[clamp(2.4rem,6.4vw,5.25rem)] font-bold uppercase leading-[0.98]">
            O futuro do varejo{" "}
            <span className="text-gradient">é brasileiro.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Produtos, tecnologia e estrutura em uma só plataforma. Revenda, venda sem estoque, compre no atacado
            e lance sua própria loja — de Norte a Sul, em minutos.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button to="/criar-conta" size="lg" className="shadow-glow">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="#formas-de-vender" variant="outline" size="lg" className="glass">Explorar o ecossistema</Button>
          </div>
          <dl className="mt-8 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-6">
            {[["4", "Formas de vender"], ["1", "Painel único"], ["27", "Estados atendidos"]].map(([v, l]) => (
              <div key={l}>
                <dt className="font-display text-2xl font-bold">{v}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-xl pb-10 lg:max-w-none">
          <div className="absolute -inset-6 rounded-[2rem] bg-primary/10 blur-3xl" aria-hidden />
          <div className="tilt-3d scanline relative rounded-2xl">
            <BrowserStore eager />
          </div>
          <PhoneStore className="float-y absolute -bottom-2 -right-1 sm:-right-6" />
          <MiniCard icon={ShoppingBag} label="Pedidos hoje" value="12" className="absolute -left-3 top-[58%] hidden sm:flex lg:-left-10" />
          <MiniCard icon={TrendingUp} label="Vendas" value="+18%" className="absolute -top-5 right-10 hidden sm:flex" />
          <MiniCard icon={Package} label="Produtos" value="Drop + Próprio" className="absolute -bottom-2 left-10 hidden sm:flex" />
        </div>
      </Container>

      <div className="relative mt-12 overflow-hidden border-y border-border bg-ink py-4" aria-hidden>
        <div className="marquee flex w-max gap-10 whitespace-nowrap">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="flex items-center gap-10 font-display text-sm font-bold uppercase tracking-[0.25em] text-ink-foreground">
              {t} <span className={["text-primary","text-brasil-yellow","text-brasil-green"][i%3]}>✦</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
