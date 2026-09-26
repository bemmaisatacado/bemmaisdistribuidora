import { Container, Eyebrow, Reveal, Section } from "./primitives";

const NODES = ["Produtos", "Drop", "Atacado", "Loja", "Estoque", "Clientes", "Marketing", "Academy", "Pedidos"];

export function Ecosystem() {
  return (
    <Section className="bg-ink text-ink-foreground">
      <Container>
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow className="text-ink-muted">Ecossistema</Eyebrow>
          <h2 className="mt-5 text-[clamp(1.9rem,4.2vw,3.25rem)] font-bold uppercase leading-[1.05]">
            Tudo conectado.<br />Em um único ecossistema.
          </h2>
        </Reveal>

        {/* Desktop orbit */}
        <Reveal className="relative mx-auto mt-16 hidden aspect-square w-full max-w-[560px] md:block">
          <div className="absolute inset-[12%] rounded-full border border-ink-border" />
          <div className="absolute inset-[30%] rounded-full border border-ink-border" />
          <div className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-ink-foreground text-ink">
            <span className="font-display text-lg font-bold tracking-tight">BEM<span className="text-primary">MAIS</span></span>
            <span className="text-[9px] font-bold tracking-[0.3em] text-muted-foreground">ECOSSISTEMA</span>
          </div>
          {NODES.map((n, i) => {
            const a = (i / NODES.length) * Math.PI * 2 - Math.PI / 2;
            const r = 38;
            return (
              <span
                key={n}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-ink-border bg-ink px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors hover:border-primary hover:text-primary"
                style={{ left: `${50 + r * Math.cos(a)}%`, top: `${50 + r * Math.sin(a)}%` }}
              >
                {n}
              </span>
            );
          })}
        </Reveal>

        {/* Mobile grid */}
        <div className="mt-12 md:hidden">
          <div className="mx-auto flex h-28 w-28 flex-col items-center justify-center rounded-full bg-ink-foreground text-ink">
            <span className="font-display text-base font-bold">BEM<span className="text-primary">MAIS</span></span>
          </div>
          <ul className="mt-8 grid grid-cols-3 gap-2">
            {NODES.map((n) => (
              <li key={n} className="rounded-full border border-ink-border py-2.5 text-center text-[11px] font-bold uppercase tracking-wider">{n}</li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
