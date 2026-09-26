import { Play } from "lucide-react";
import { Container, Eyebrow, Reveal, Section } from "./primitives";

const TOPICS = ["WhatsApp", "Instagram", "Marketplace", "Precificação", "Atendimento", "Marketing", "Vendas", "Gestão"];
const LESSONS = [
  { t: "Precificação na prática", d: "12 min", active: true },
  { t: "Atendimento pelo WhatsApp", d: "9 min" },
  { t: "Vitrine no Instagram", d: "14 min" },
];

export function AcademySection() {
  return (
    <Section id="academy" className="bg-surface py-16 sm:py-20 lg:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>BemMais Academy</Eyebrow>
          <h2 className="mt-5 text-[clamp(1.7rem,3.4vw,2.5rem)] font-bold uppercase leading-[1.08]">
            Produto é importante.<br />Saber vender também.
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
            Tenha acesso a vídeos e materiais de estudo para desenvolver suas estratégias e melhorar sua operação.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <li key={t} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold">{t}</li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100} className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-ink">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
            </span>
            <div className="absolute inset-x-4 bottom-4 h-1 rounded-full bg-ink-border">
              <div className="h-full w-1/3 rounded-full bg-primary" />
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {LESSONS.map((l) => (
              <li key={l.t} className="flex items-center justify-between py-3 text-sm">
                <span className={`flex items-center gap-3 ${l.active ? "font-bold" : "text-muted-foreground"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${l.active ? "bg-primary" : "bg-border"}`} />
                  {l.t}
                </span>
                <span className="text-xs text-muted-foreground">{l.d}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </Section>
  );
}
