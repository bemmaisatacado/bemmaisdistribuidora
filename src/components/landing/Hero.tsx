import { ArrowRight, Package, ShoppingBag, Boxes, TrendingUp } from "lucide-react";
import { Button, Container, Eyebrow } from "./primitives";
import { BrowserStore, PhoneStore } from "./StoreMockup";

function MiniCard({ icon: Icon, label, value, className }: { icon: typeof Package; label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-soft ${className ?? ""}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-display text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-10 pb-20 sm:pt-16 lg:pt-20 lg:pb-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <Eyebrow>Ecossistema BemMais</Eyebrow>
          <h1 className="mt-6 text-[clamp(2.2rem,5.4vw,4.25rem)] font-bold uppercase leading-[1.02]">
            Produtos, tecnologia e estrutura para você{" "}
            <span className="text-primary">vender mais.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Encontre produtos para revenda, venda sem estoque, compre no atacado e tenha ferramentas
            para construir e desenvolver o seu negócio.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button to="/criar-conta" size="lg">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="#formas-de-vender" variant="outline" size="lg">Conhecer a BemMais</Button>
          </div>
          <p className="mt-9 text-sm font-medium text-muted-foreground">
            Calçados <span className="px-1.5 text-primary">•</span> Vestuário{" "}
            <span className="px-1.5 text-primary">•</span> Acessórios{" "}
            <span className="px-1.5 text-primary">•</span> Novas categorias
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-xl pb-10 lg:max-w-none">
          <BrowserStore eager />
          <PhoneStore className="absolute -bottom-2 -right-1 sm:-right-6" />
          <MiniCard icon={ShoppingBag} label="Pedidos hoje" value="12" className="absolute -left-3 top-[58%] hidden sm:flex lg:-left-10" />
          <MiniCard icon={TrendingUp} label="Vendas" value="+18%" className="absolute -top-5 right-10 hidden sm:flex" />
          <div className="mt-4 flex gap-3 sm:hidden">
            <MiniCard icon={Boxes} label="Estoque" value="Integrado" />
          </div>
          <MiniCard icon={Package} label="Produtos" value="Drop + Próprio" className="absolute -bottom-2 left-10 hidden sm:flex" />
        </div>
      </Container>
    </section>
  );
}
