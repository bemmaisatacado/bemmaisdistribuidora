import { ArrowRight } from "lucide-react";
import { Button, Container, Reveal, Section } from "./primitives";

export function FinalCTA() {
  return (
    <Section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div className="orb left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 bg-primary/20" aria-hidden />
      <Container className="relative">
        <Reveal className="glass mx-auto max-w-4xl rounded-[2rem] px-6 py-16 text-center sm:px-12">
          <h2 className="text-[clamp(2rem,5vw,3.75rem)] font-bold uppercase leading-[1.03]">
            Seu próximo passo<br />pode começar <span className="text-gradient">aqui.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Entre para o ecossistema BemMais e encontre produtos, estrutura e ferramentas para desenvolver sua operação.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button to="/criar-conta" size="lg">Criar minha conta <ArrowRight className="h-4 w-4" /></Button>
            <Button href="#contato" variant="outline" size="lg">Falar com a BemMais</Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Cadastro simples • Acesso ao ecossistema BemMais</p>
        </Reveal>
      </Container>
    </Section>
  );
}
