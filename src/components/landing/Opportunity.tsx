import { Store, Users, Shuffle } from "lucide-react";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

const MODELS = [
  { icon: Store, t: "Varejo", d: "Venda diretamente para o consumidor." },
  { icon: Users, t: "Atacado", d: "Venda em quantidade para outros lojistas e revendedores." },
  { icon: Shuffle, t: "Híbrido", d: "Combine varejo e atacado na mesma operação." },
];

export function Opportunity() {
  return (
    <Section className="bg-surface">
      <Container>
        <SectionHeader eyebrow="Seu modelo" title={<>Você decide<br /><span className="text-primary">como quer vender.</span></>} />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {MODELS.map((m, i) => (
            <Reveal key={m.t} delay={i * 90} className={`group rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 ${i === 2 ? "bg-ink text-ink-foreground" : "border border-border bg-card"}`}>
              <m.icon className="h-7 w-7 text-primary" />
              <h3 className="mt-10 text-[clamp(1.8rem,3vw,2.5rem)] font-bold uppercase">{m.t}</h3>
              <p className={`mt-2 text-sm leading-relaxed ${i === 2 ? "text-ink-muted" : "text-muted-foreground"}`}>{m.d}</p>
            </Reveal>
          ))}
        </div>
        <p className="mt-10 text-center font-display text-lg font-bold uppercase tracking-tight sm:text-xl">
          Do primeiro pedido à construção da sua <span className="text-primary">própria operação comercial.</span>
        </p>
      </Container>
    </Section>
  );
}
