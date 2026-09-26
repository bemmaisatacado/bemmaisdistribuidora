import { ArrowRight, Factory, Gift, PackageSearch, Ship } from "lucide-react";
import { Button, Container, Eyebrow, Reveal, Section } from "./primitives";

const ITEMS = [
  { i: Factory, t: "Direto da fábrica", d: "Acesso a fornecedores selecionados na China." },
  { i: PackageSearch, t: "Curadoria de produtos", d: "Tênis, roupas, bolsas e acessórios com potencial de venda." },
  { i: Ship, t: "Importação acompanhada", d: "Orientação da BemMais em cada etapa do processo." },
];

export function ChinaImport() {
  return (
    <Section id="importacao" className="bg-surface">
      <Container>
        <Reveal className="relative overflow-hidden rounded-3xl bg-ink p-8 text-ink-foreground sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-primary-foreground">
                <Gift className="h-3.5 w-3.5" /> Bônus exclusivo
              </span>
              <Eyebrow className="mt-5 text-ink-muted">Importação</Eyebrow>
              <h2 className="mt-3 text-[clamp(1.9rem,4.4vw,3.25rem)] font-bold uppercase leading-[1.02]">
                Importe da China<br /><span className="text-primary">com a BemMais.</span>
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-ink-muted">
                Quem faz parte do ecossistema tem acesso ao caminho da importação para montar um estoque próprio com mais margem.
              </p>
              <Button to="/criar-conta" size="lg" className="mt-8">
                Quero esse bônus <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <ul className="grid gap-3">
              {ITEMS.map(({ i: Icon, t, d }) => (
                <li key={t} className="flex items-start gap-4 rounded-2xl border border-ink-border p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide">{t}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
