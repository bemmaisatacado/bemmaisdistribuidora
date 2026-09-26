import { Check } from "lucide-react";
import { Container, Reveal, Section, SectionHeader } from "./primitives";
import { BrowserStore } from "./StoreMockup";

const CAN = [
  "Colocar sua própria logo", "Escolher suas cores", "Escolher produtos do catálogo",
  "Definir sua margem e seus preços", "Trabalhar com Drop e estoque próprio",
  "Cadastrar produtos próprios", "Vender no varejo e no atacado",
];

const SWATCHES = ["bg-ink", "bg-primary", "bg-muted-foreground", "bg-border"];

export function WhiteLabelStore() {
  return (
    <Section id="sua-loja" className="bg-surface">
      <Container className="grid items-center gap-16 lg:grid-cols-2">
        <div>
          <SectionHeader
            eyebrow="Sua loja"
            title={<>Sua marca.<br />Sua loja.<br />Seus preços.</>}
            subtitle="Tenha sua própria loja virtual conectada ao ecossistema BemMais — com catálogo, estoque e pedidos no mesmo lugar."
          />
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {CAN.map((c) => (
              <li key={c} className="flex items-start gap-3 text-sm font-medium">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {c}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap gap-2">
            {["Varejo", "Atacado", "Híbrido"].map((b) => (
              <span key={b} className="rounded-full border border-foreground/15 bg-card px-4 py-2 text-xs font-bold uppercase tracking-widest">
                {b}
              </span>
            ))}
          </div>
        </div>

        <Reveal className="relative">
          <BrowserStore />
          <div className="relative mt-5 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:absolute sm:-bottom-10 sm:-left-8 sm:mt-0 sm:w-72">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Personalizar</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Logo</span>
              <span className="font-display text-xs font-bold tracking-[0.2em]">ATELIER NOVE</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cor da marca</span>
              <span className="flex gap-1.5">
                {SWATCHES.map((s, i) => (
                  <span key={s} className={`h-5 w-5 rounded-full ${s} ${i === 0 ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`} />
                ))}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">Custo</span><span className="font-semibold">R$ 239,90</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Margem</span>
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary">+62%</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Preço final</span><span className="font-display font-bold">R$ 389,90</span>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
