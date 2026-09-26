import { ArrowRight, Plus } from "lucide-react";
import { Button, Container, Eyebrow, Reveal, Section } from "./primitives";
import { BrowserStore, PhoneStore } from "./StoreMockup";

const YOURS = ["Sua logo", "Suas cores", "Seus preços", "Sua margem", "Seus clientes"];
const SOURCES = ["Produtos BemMais", "Seu próprio estoque", "Seus próprios produtos"];

export function WhiteLabelStore() {
  return (
    <Section id="sua-loja" className="relative overflow-hidden bg-ink text-ink-foreground">
      <div className="bg-grid-dark absolute inset-0" aria-hidden />
      <div className="orb -left-20 top-1/3 h-96 w-96 bg-primary/25" aria-hidden />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal>
          <Eyebrow className="text-ink-muted">Sua loja</Eyebrow>
          <h2 className="mt-5 text-[clamp(2.4rem,6vw,4.75rem)] font-bold uppercase leading-[0.96]">
            Uma loja com<br /><span className="text-gradient">a sua cara.</span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted sm:text-lg">
            Sua marca na frente. A estrutura BemMais trabalhando por trás.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {YOURS.map((y) => (
              <li key={y} className="rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink-foreground">
                {y}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm font-semibold">
            {SOURCES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <Plus className="h-4 w-4 text-primary" />}
                <span className="rounded-xl border border-ink-border px-3 py-2">{s}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink-muted">Tudo na mesma vitrine · Varejo · Atacado · Híbrido</p>
          <Button to="/criar-conta" size="lg" className="mt-9 shadow-glow">
            Quero minha loja <ArrowRight className="h-4 w-4" />
          </Button>
        </Reveal>

        <Reveal delay={120} className="relative pb-10">
          <div className="absolute -inset-6 rounded-[2rem] bg-primary/15 blur-3xl" aria-hidden />
          <BrowserStore className="relative" />
          <PhoneStore className="float-y absolute -bottom-2 -left-2 sm:-left-8" />
        </Reveal>
      </Container>
    </Section>
  );
}
