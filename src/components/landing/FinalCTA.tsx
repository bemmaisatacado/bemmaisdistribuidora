import { ArrowRight } from "lucide-react";
import { Button, Container, Reveal, Section } from "./primitives";

export function FinalCTA() {
  return (
    <Section>
      <Container>
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="text-[clamp(2rem,5vw,3.75rem)] font-bold uppercase leading-[1.03]">
            Seu próximo passo<br />pode começar <span className="text-primary">aqui.</span>
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
