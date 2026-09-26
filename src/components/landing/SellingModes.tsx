import { Check } from "lucide-react";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

const MODES = [
  {
    n: "01", tag: "Drop", title: "Venda sem precisar ter estoque.",
    text: "Escolha produtos do catálogo BemMais, defina sua margem e comece a vender.",
    items: ["Comece a partir de 1 produto", "Estoque integrado", "Envio direto ao cliente"],
  },
  {
    n: "02", tag: "Atacado variado", title: "Mais liberdade para montar seu estoque.",
    text: "Escolha diferentes modelos, tamanhos e produtos conforme as condições disponíveis.",
    items: ["Mix de produtos", "Condições de atacado", "Mais flexibilidade"],
  },
  {
    n: "03", tag: "Grade fechada", title: "Mais volume. Melhor condição de compra.",
    text: "Compre grades fechadas e aumente sua margem conforme sua operação cresce.",
    items: ["Compra em volume", "Condições diferenciadas", "Ideal para lojistas"],
  },
];

export function SellingModes() {
  return (
    <Section id="formas-de-vender" className="bg-card">
      <Container>
        <SectionHeader
          eyebrow="Formas de vender"
          title="Uma estrutura. Várias formas de vender."
          subtitle="Comece da forma que fizer sentido para você e evolua sua operação dentro da BemMais."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {MODES.map((m, i) => (
            <Reveal key={m.n} delay={i * 90} className="group flex flex-col rounded-2xl border border-border bg-background p-7 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-lift sm:p-8">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{m.tag}</span>
                <span className="font-display text-sm font-semibold text-muted-foreground">{m.n}</span>
              </div>
              <h3 className="mt-8 text-2xl font-bold leading-tight">{m.title}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">{m.text}</p>
              <ul className="mt-8 space-y-3 border-t border-border pt-6">
                {m.items.map((it) => (
                  <li key={it} className="flex items-center gap-3 text-sm font-medium">
                    <Check className="h-4 w-4 shrink-0 text-primary" /> {it}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Uma única conta. Use Drop, Variado e Grade ao mesmo tempo.
        </p>
      </Container>
    </Section>
  );
}
