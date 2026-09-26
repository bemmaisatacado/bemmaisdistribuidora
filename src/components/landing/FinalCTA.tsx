import { ArrowRight } from "lucide-react";
import { Button, Container, Reveal, Section } from "./primitives";

export function FinalCTA() {
  return (
    <Section className="relative overflow-hidden border-t border-ink-border bg-ink text-ink-foreground">
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_bottom,var(--primary),transparent_65%)] opacity-35" aria-hidden />
      <div className="bg-grid-dark absolute inset-0" aria-hidden />
      <Container className="relative">
        <Reveal className="mx-auto max-w-4xl py-6 text-center">
          <h2 className="text-[clamp(2.2rem,6vw,4.75rem)] font-bold uppercase leading-[0.98]">
            O seu negócio<br />não precisa ficar<br /><span className="text-gradient">só no plano.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Comece com a estrutura que faz sentido para você e descubra novas possibilidades dentro do ecossistema BemMais.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button to="/criar-conta" size="lg" className="shadow-glow">Quero começar agora <ArrowRight className="h-4 w-4" /></Button>
            <Button href="#contato" variant="light" size="lg">Falar com a BemMais</Button>
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-ink-muted">Drop • Atacado • Loja Virtual • Ferramentas • Academy</p>
        </Reveal>
      </Container>
    </Section>
  );
}
