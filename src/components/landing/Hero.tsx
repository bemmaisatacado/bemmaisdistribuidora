import { ArrowRight, BadgeCheck, Bell, Package, Truck } from "lucide-react";
import { Button, Container } from "./primitives";
import { BrowserStore, PhoneStore } from "./StoreMockup";

function Toast({ icon: Icon, title, sub, className, delay = 0 }: { icon: typeof Bell; title: string; sub: string; className?: string; delay?: number }) {
  return (
    <div
      className={`glass-dark float-y flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-ink-foreground shadow-lift ${className ?? ""}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-xs font-bold">{title}</p>
        <p className="text-[10px] text-ink-muted">{sub}</p>
      </div>
    </div>
  );
}

const STRIP = ["Tênis", "Roupas", "Bolsas", "Acessórios", "Importação da China"];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink pt-8 pb-12 text-ink-foreground sm:pt-12 lg:pt-16 lg:pb-20">
      <div className="bg-grid-dark absolute inset-0" aria-hidden />
      <div className="orb -right-24 top-10 h-[28rem] w-[28rem] bg-primary/30" aria-hidden />
      <div className="orb -left-40 bottom-0 h-80 w-80 bg-primary/15" style={{ animationDelay: "-8s" }} aria-hidden />

      <Container className="relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-ink-border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Seu negócio pode começar aqui.
          </p>
          <h1 className="mt-5 text-[clamp(2.3rem,6.2vw,5rem)] font-bold uppercase leading-[0.98]">
            Comece a vender.<br />
            Construa sua marca.<br />
            <span className="text-gradient">Cresça do seu jeito.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Produtos, loja virtual, fornecedores e ferramentas reunidos em um único ecossistema para quem quer
            começar a vender ou levar sua operação para o próximo nível.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button to="/criar-conta" size="lg" className="shadow-glow">
              Quero começar a vender <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="#ecossistema" variant="light" size="lg">Conhecer o ecossistema</Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-2 border-t border-ink-border pt-6 text-[11px] font-bold uppercase tracking-[0.15em] text-ink-muted">
            {STRIP.map((s, i) => (
              <li key={s} className="flex items-center gap-4">
                {i > 0 && <span className="text-primary" aria-hidden>•</span>}
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl pb-12 lg:max-w-none">
          <div className="absolute -inset-4 rounded-[2rem] bg-primary/20 blur-3xl" aria-hidden />
          <div className="tilt-3d scanline relative rounded-2xl">
            <BrowserStore eager />
          </div>
          <PhoneStore className="float-y absolute -bottom-2 -right-1 sm:-right-6" />
          <Toast icon={Bell} title="Novo pedido" sub="Tênis Street Hi · R$ 349,90" className="absolute -left-2 top-[8%] sm:-left-8" />
          <Toast icon={BadgeCheck} title="Venda aprovada" sub="Pagamento confirmado" className="absolute -left-2 top-[62%] hidden sm:flex lg:-left-12" delay={-2} />
          <Toast icon={Package} title="Estoque atualizado" sub="Drop + estoque próprio" className="absolute -top-5 right-10 hidden md:flex" delay={-4} />
          <Toast icon={Truck} title="Pedido enviado" sub="A caminho do cliente" className="absolute -bottom-3 left-6 hidden sm:flex" delay={-3} />
        </div>
      </Container>
    </section>
  );
}
