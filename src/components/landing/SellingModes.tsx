import { ArrowRight, Boxes, PackageOpen, Rocket } from "lucide-react";
import lifeLoja from "@/assets/life-loja.jpg";
import { Button, Container, Eyebrow, Reveal, Section } from "./primitives";

const PATHS = [
  { icon: Rocket, kicker: "Começar sem estoque", tag: "Drop", text: "Escolha produtos do catálogo, defina sua margem e venda. A BemMais envia para o seu cliente." },
  { icon: PackageOpen, kicker: "Começar com poucos produtos", tag: "Atacado variado", text: "Monte seu mix com modelos e tamanhos diferentes e teste o que vende mais." },
  { icon: Boxes, kicker: "Abastecer minha loja", tag: "Grade fechada", text: "Compre em volume, com melhores condições, e fortaleça sua margem." },
];

export function SellingModes() {
  return (
    <Section id="formas-de-vender" className="bg-background">
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal>
            <Eyebrow>Por onde começar</Eyebrow>
            <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.5rem)] font-bold uppercase leading-[1.02]">
              E se a sua próxima venda <span className="text-primary">começasse hoje?</span>
            </h2>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Você não precisa começar com uma grande estrutura. Na BemMais, você encontra diferentes caminhos para
              entrar no mercado, testar produtos e desenvolver sua operação.
            </p>
            <Button to="/criar-conta" size="lg" className="mt-8">
              Escolher como começar <ArrowRight className="h-4 w-4" />
            </Button>
          </Reveal>
          <Reveal delay={100} className="relative">
            <img src={lifeLoja} alt="Empreendedora gerenciando vendas pelo celular em sua loja" width={1280} height={960} loading="lazy" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lift" />
            <div className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-ink-foreground shadow-lift">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-xs font-bold uppercase tracking-wider">Sua loja, seu ritmo</span>
            </div>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {PATHS.map((p, i) => (
            <Reveal key={p.tag} delay={i * 90} className="group relative overflow-hidden rounded-3xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift">
              <span className="absolute right-6 top-6 font-display text-5xl font-bold text-foreground/5">0{i + 1}</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-6 text-xl font-bold uppercase leading-tight">{p.kicker}</h3>
              <p className="mt-1 text-sm font-bold uppercase tracking-[0.18em] text-primary">{p.tag}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
