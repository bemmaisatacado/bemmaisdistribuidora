import { Container, Eyebrow, Reveal, Section } from "./primitives";

const STEPS = [
  ["Venda sem estoque", "Drop: comece com zero investimento em produto."],
  ["Monte seu mix", "Atacado variado para testar o que funciona."],
  ["Compre melhor", "Grade fechada com condições de volume."],
  ["Crie seu estoque", "Venda produtos BemMais e produtos próprios."],
  ["Expanda sua operação", "Mais canais, mais clientes, mais estrutura."],
];

export function GrowthJourney() {
  return (
    <Section id="jornada" className="relative overflow-hidden bg-ink text-ink-foreground">
      <div className="bg-grid-dark absolute inset-0" aria-hidden />
      <div className="orb left-1/2 top-0 h-80 w-80 -translate-x-1/2 bg-primary/20" aria-hidden />
      <Container className="relative">
        <Reveal className="max-w-3xl">
          <Eyebrow className="text-ink-muted">Sua jornada</Eyebrow>
          <h2 className="mt-5 text-[clamp(2.2rem,5.5vw,4.25rem)] font-bold uppercase leading-[0.98]">
            Comece pequeno.<br /><span className="text-gradient">Pense grande.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Você pode começar vendendo sem estoque e evoluir conforme suas vendas e sua operação crescem.
          </p>
        </Reveal>

        <ol className="relative mt-14 grid gap-4 lg:grid-cols-5 lg:gap-3">
          <div className="absolute left-5 top-0 h-full w-px bg-gradient-to-b from-primary/10 via-primary to-primary/10 lg:left-0 lg:top-5 lg:h-px lg:w-full lg:bg-gradient-to-r" aria-hidden />
          {STEPS.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 90} className="relative pl-14 lg:pl-0 lg:pt-14">
              <span
                className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-primary bg-ink font-display text-xs font-bold text-primary"
                style={{ boxShadow: `0 0 0 ${4 + i * 2}px oklch(0.67 0.2 42 / ${0.05 + i * 0.03})` }}
              >
                0{i + 1}
              </span>
              <div className="rounded-2xl border border-ink-border p-5 transition-colors hover:border-primary/50" style={{ backgroundColor: `oklch(${0.22 + i * 0.012} 0.006 60)` }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Step 0{i + 1}</p>
                <h3 className="mt-2 text-base font-bold uppercase leading-tight">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{d}</p>
              </div>
            </Reveal>
          ))}
        </ol>
        <p className="mt-10 text-sm font-bold uppercase tracking-[0.2em] text-ink-muted">
          A BemMais acompanha <span className="text-ink-foreground">toda a jornada.</span>
        </p>
      </Container>
    </Section>
  );
}
