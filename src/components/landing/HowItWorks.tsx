import { UserPlus, Route as RouteIcon, ShoppingBag, Palette, Rocket } from "lucide-react";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

const STEPS = [
  { i: UserPlus, t: "Crie sua conta" },
  { i: RouteIcon, t: "Escolha como quer vender" },
  { i: ShoppingBag, t: "Escolha seus produtos" },
  { i: Palette, t: "Personalize sua loja" },
  { i: Rocket, t: "Comece a vender" },
];

export function HowItWorks() {
  return (
    <Section id="como-funciona" className="bg-card">
      <Container>
        <SectionHeader align="center" eyebrow="Como funciona" title="Da ideia à primeira venda." />
        <ol className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(({ i: Icon, t }, idx) => (
            <Reveal as="li" key={t} delay={idx * 80} className="flex flex-col rounded-2xl border border-border bg-background p-6 sm:p-7">
              <span className="font-display text-4xl font-bold text-foreground/10">0{idx + 1}</span>
              <Icon className={`mt-6 h-6 w-6 ${idx === STEPS.length - 1 ? "text-primary" : "text-foreground"}`} />
              <h3 className="mt-4 text-base font-bold uppercase leading-snug">{t}</h3>
            </Reveal>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
