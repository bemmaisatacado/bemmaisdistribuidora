import { Container, Reveal, Section, SectionHeader } from "./primitives";

const STEPS = [
  { t: "Drop", d: "Comece sem precisar montar estoque." },
  { t: "Variado", d: "Monte seu primeiro mix de produtos." },
  { t: "Grade", d: "Compre melhor conforme aumenta seu volume." },
  { t: "Estoque próprio", d: "Construa sua própria operação." },
  { t: "Escala", d: "Venda utilizando diferentes estratégias dentro do mesmo ecossistema." },
];

export function GrowthJourney() {
  return (
    <Section>
      <Container>
        <SectionHeader
          eyebrow="Evolução"
          title={<>Comece no Drop.<br />Cresça no atacado.</>}
          subtitle="A BemMais acompanha cada etapa da evolução do seu negócio."
        />
        <ol className="relative mt-16 grid gap-10 lg:grid-cols-5 lg:gap-6">
          <span aria-hidden className="absolute left-[11px] top-3 bottom-3 w-px bg-border lg:left-0 lg:right-0 lg:top-[11px] lg:bottom-auto lg:h-px lg:w-auto" />
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 80} className="relative pl-10 lg:pl-0 lg:pt-12">
              <span
                className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background ${i === STEPS.length - 1 ? "border-primary" : "border-foreground/25"}`}
              >
                <span className={`h-2 w-2 rounded-full ${i === STEPS.length - 1 ? "bg-primary" : "bg-foreground/40"}`} />
              </span>
              <p className="font-display text-xs font-semibold text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-1 text-xl font-bold uppercase">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
