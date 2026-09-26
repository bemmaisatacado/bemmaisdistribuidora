import { Plus, Equal, Warehouse, Box, Store } from "lucide-react";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

function Node({ icon: Icon, title, text, highlight }: { icon: typeof Box; title: string; text: string; highlight?: boolean }) {
  return (
    <div className={`flex-1 rounded-2xl border p-7 ${highlight ? "border-ink bg-ink text-ink-foreground" : "border-border bg-card"}`}>
      <Icon className={`h-6 w-6 ${highlight ? "text-primary" : "text-foreground"}`} />
      <h3 className="mt-6 text-lg font-bold uppercase">{title}</h3>
      <p className={`mt-2 text-sm leading-relaxed ${highlight ? "text-ink-muted" : "text-muted-foreground"}`}>{text}</p>
    </div>
  );
}

function Op({ icon: Icon }: { icon: typeof Plus }) {
  return (
    <div className="flex items-center justify-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-primary">
        <Icon className="h-4 w-4" />
      </span>
    </div>
  );
}

export function HybridInventory() {
  return (
    <Section className="bg-card">
      <Container>
        <SectionHeader
          align="center"
          eyebrow="Estoque híbrido"
          title={<>Drop e estoque próprio<br className="hidden sm:block" /> na mesma loja.</>}
          subtitle="Compre uma grade na BemMais e adicione esses produtos ao seu estoque, ou cadastre seus próprios produtos. Para o seu cliente, tudo continua em uma única loja."
        />
        <Reveal className="mt-14 flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <Node icon={Warehouse} title="Estoque BemMais" text="Produtos disponíveis através do ecossistema para operação Drop." />
          <Op icon={Plus} />
          <Node icon={Box} title="Meu estoque" text="Produtos comprados no atacado ou cadastrados pelo próprio lojista." />
          <Op icon={Equal} />
          <Node icon={Store} title="Uma única loja" text="Experiência centralizada para o consumidor, com todos os produtos juntos." highlight />
        </Reveal>
      </Container>
    </Section>
  );
}
