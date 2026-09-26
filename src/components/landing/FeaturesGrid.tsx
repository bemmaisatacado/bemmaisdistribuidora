import { Store, Users, Megaphone, MessageCircle, ClipboardList, Boxes, GraduationCap, Wallet } from "lucide-react";
import lifePedidos from "@/assets/life-pedidos.jpg";
import { Container, Eyebrow, Reveal, Section } from "./primitives";

const FEATURES = [
  { i: Store, t: "Sua loja online", d: "Tenha seu próprio espaço para vender." },
  { i: MessageCircle, t: "WhatsApp oficial", d: "Transforme sua base em novas oportunidades de venda." },
  { i: Megaphone, t: "Marketing", d: "Materiais e ferramentas para divulgar seus produtos." },
  { i: Users, t: "Clientes", d: "Organize quem já comprou de você." },
  { i: Boxes, t: "Estoque", d: "Venda produtos BemMais e produtos próprios." },
  { i: ClipboardList, t: "Pedidos", d: "Acompanhe sua operação em um só lugar." },
  { i: Wallet, t: "Financeiro", d: "Veja suas vendas e movimentações com clareza." },
  { i: GraduationCap, t: "Academy", d: "Aprenda estratégias para desenvolver suas vendas." },
];

export function FeaturesGrid() {
  return (
    <Section id="recursos" className="bg-ink text-ink-foreground">
      <Container>
        <div className="grid items-end gap-8 lg:grid-cols-2">
          <Reveal>
            <Eyebrow className="text-ink-muted">Ferramentas</Eyebrow>
            <h2 className="mt-5 text-[clamp(2rem,4.6vw,3.5rem)] font-bold uppercase leading-[1.02]">
              Mais do que produtos.<br /><span className="text-primary">Ferramentas para vender mais.</span>
            </h2>
          </Reveal>
          <Reveal delay={100} className="relative overflow-hidden rounded-3xl">
            <img src={lifePedidos} alt="Empreendedor embalando pedidos para envio" width={1280} height={960} loading="lazy" className="aspect-[16/9] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
          </Reveal>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ i: Icon, t, d }, idx) => (
            <Reveal key={t} delay={(idx % 4) * 60} className="group rounded-2xl border border-ink-border bg-ink-foreground/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-6 text-base font-bold uppercase tracking-wide">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{d}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
