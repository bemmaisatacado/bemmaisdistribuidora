import { Store, Users, Megaphone, MessageCircle, Image, ClipboardList, Wallet, Boxes } from "lucide-react";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

const FEATURES = [
  { i: Store, t: "Loja virtual", d: "Sua própria loja personalizada." },
  { i: Users, t: "Gestão de clientes", d: "Organize sua base e relacionamento." },
  { i: Megaphone, t: "Marketing", d: "Ferramentas para criar novas oportunidades de venda." },
  { i: MessageCircle, t: "WhatsApp oficial", d: "Campanhas e comunicação utilizando integração oficial." },
  { i: Image, t: "Materiais de divulgação", d: "Fotos, vídeos, criativos e conteúdos disponibilizados pela BemMais." },
  { i: ClipboardList, t: "Pedidos", d: "Acompanhe suas vendas em um único ambiente." },
  { i: Wallet, t: "Financeiro", d: "Visualize vendas, valores e movimentações da sua operação." },
  { i: Boxes, t: "Estoque", d: "Gerencie produtos próprios e produtos integrados ao ecossistema." },
];

export function FeaturesGrid() {
  return (
    <Section id="recursos">
      <Container>
        <SectionHeader
          eyebrow="Recursos"
          title={<>Mais do que produtos.<br />Ferramentas para vender mais.</>}
        />
        <div className="mt-14 grid overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-card gap-px">
          {FEATURES.map(({ i: Icon, t, d }, idx) => (
            <Reveal key={t} delay={(idx % 4) * 60} className="group p-7 transition-colors hover:bg-background sm:p-8">
              <Icon className="h-5 w-5 text-primary" />
              <h3 className="mt-8 text-base font-bold uppercase tracking-wide">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
