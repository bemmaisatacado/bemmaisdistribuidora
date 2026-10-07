import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  CirclePlay,
  MessageCircle,
  PackageCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  OPPORTUNITY_ATTRIBUTION_STORAGE_KEY,
  OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS,
  OPPORTUNITY_LINKS,
  OPPORTUNITY_VIDEO_SOURCE,
  isOpportunityVideoConfigured,
  mergeOpportunityAttribution,
  readOpportunityAttribution,
  shouldRevealOpportunityCtas,
  withOpportunityAttribution,
  type OpportunityAttribution,
} from "@/lib/opportunity/landing";
import { trackOpportunityEvent } from "@/lib/opportunity/events";

const configuredVideoSource =
  import.meta.env.VITE_OPPORTUNITY_VIDEO_URL || OPPORTUNITY_VIDEO_SOURCE;
const configuredVideoPoster = import.meta.env.VITE_OPPORTUNITY_VIDEO_POSTER_URL;

const benefits = [
  [
    PackageCheck,
    "Fornecedores selecionados",
    "Acesso a fornecedores e oportunidades organizadas pela BemMais.",
  ],
  [Sparkles, "Preço para revenda", "Produtos e condições pensadas para quem quer revender."],
  [
    UsersRound,
    "Diferentes formas de começar",
    "Atacado, Grade e Drop conforme cada fornecedor e produto.",
  ],
  [ArrowUpRight, "Novidades", "Acompanhamento de novos produtos e oportunidades."],
  [MessageCircle, "Suporte real", "Uma operação feita para ajudar lojistas e revendedores."],
  [
    Check,
    "Conteúdo para vender mais",
    "Além do produto, a BemMais quer ajudar o parceiro a evoluir suas vendas.",
  ],
] as const;

function loadAttribution(): OpportunityAttribution {
  if (typeof window === "undefined") return {};

  const current = readOpportunityAttribution(new URLSearchParams(window.location.search));
  try {
    const stored = window.localStorage.getItem(OPPORTUNITY_ATTRIBUTION_STORAGE_KEY);
    const saved = stored ? (JSON.parse(stored) as OpportunityAttribution) : {};
    const merged = mergeOpportunityAttribution(saved, current);
    window.localStorage.setItem(OPPORTUNITY_ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return current;
  }
}

function OpportunityCta({
  href,
  title,
  description,
  event,
  accent = "orange",
}: {
  href: string;
  title: string;
  description: string;
  event: "click_atacado" | "click_drop";
  accent?: "orange" | "dark";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => trackOpportunityEvent(event)}
      className={`group flex min-h-24 w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition duration-200 motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        accent === "orange"
          ? "bg-primary text-primary-foreground shadow-[0_18px_48px_-20px_oklch(0.67_0.2_42_/_0.85)] hover:bg-primary/90"
          : "bg-[#171513] text-white shadow-[0_18px_48px_-20px_oklch(0.15_0.01_40_/_0.8)] hover:bg-[#29231e]"
      }`}
    >
      <span>
        <span className="block text-base font-extrabold tracking-tight">{title}</span>
        <span
          className={`mt-1 block text-sm leading-snug ${accent === "orange" ? "text-primary-foreground/80" : "text-white/70"}`}
        >
          {description}
        </span>
      </span>
      <ArrowUpRight
        className="size-6 shrink-0 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
        aria-hidden
      />
    </a>
  );
}

export function OpportunityLanding() {
  const [attribution, setAttribution] = useState<OpportunityAttribution>({});
  const [ctasRevealed, setCtasRevealed] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [videoReachedTenSeconds, setVideoReachedTenSeconds] = useState(false);
  const startedAt = useRef<number | null>(null);
  const hasVideo = isOpportunityVideoConfigured(configuredVideoSource);

  const ctaLinks = useMemo(
    () => ({
      dropVariado: withOpportunityAttribution(OPPORTUNITY_LINKS.dropVariado, attribution),
      gradeFechada: withOpportunityAttribution(OPPORTUNITY_LINKS.gradeFechada, attribution),
      support: withOpportunityAttribution(OPPORTUNITY_LINKS.support, attribution),
    }),
    [attribution],
  );

  useEffect(() => {
    setAttribution(loadAttribution());
    trackOpportunityEvent("landing_view");
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (ctasRevealed) return;
    const timer = window.setTimeout(() => {
      if (!ctasRevealed) {
        setCtasRevealed(true);
        trackOpportunityEvent("cta_revealed", { reveal_source: "timer" });
      }
    }, OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [ctasRevealed]);

  const revealCtas = (source: "timer" | "video") => {
    if (ctasRevealed) return;
    setCtasRevealed(true);
    trackOpportunityEvent("cta_revealed", { reveal_source: source });
  };

  const onVideoPlay = () => {
    if (videoStarted) return;
    setVideoStarted(true);
    trackOpportunityEvent("video_started");
  };

  const onVideoTimeUpdate = (currentTime: number) => {
    const elapsedSeconds = startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0;
    if (!shouldRevealOpportunityCtas({ elapsedSeconds, videoProgressSeconds: currentTime })) return;
    if (!videoReachedTenSeconds && currentTime >= OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS) {
      setVideoReachedTenSeconds(true);
      trackOpportunityEvent("video_10_seconds");
    }
    revealCtas("video");
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-[#121110] font-sans text-white">
      <header className="relative z-20 border-b border-black/10 bg-[#f6f1ea] text-[#171513]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8 sm:py-4">
          <a
            href="/"
            aria-label="BemMais Distribuidora, página inicial"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              src="/campaign/bemmais-logo.png"
              alt="BemMais Distribuidora"
              width={2172}
              height={724}
              className="h-9 w-auto object-contain sm:h-10"
            />
          </a>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#171513]/65 sm:text-xs">
            Comunidade BemMais
          </span>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden px-5 py-12 sm:px-8 sm:py-18">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_80%_10%,oklch(0.67_0.2_42_/_0.32),transparent_30%),radial-gradient(circle_at_15%_45%,oklch(0.3_0.02_40_/_0.9),transparent_45%)]" />
          <div
            className="absolute -bottom-20 -right-20 -z-10 size-76 rounded-full border border-primary/25 sm:size-112"
            aria-hidden
          />
          <div
            className="absolute bottom-8 right-8 -z-10 h-px w-44 rotate-[-30deg] bg-primary/40"
            aria-hidden
          />
          <div className="mx-auto grid w-full max-w-6xl gap-9 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-15">
            <div className="max-w-xl">
              <p className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-primary">
                <span className="size-2 rounded-full bg-primary" aria-hidden /> Oportunidade para
                revender
              </p>
              <h1 className="max-w-[11ch] text-[clamp(2.25rem,10.5vw,5.9rem)] font-extrabold uppercase leading-[0.94] tracking-[-0.055em] text-balance">
                Quer vender calçados ou já tem sua loja?
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-white/72 sm:text-lg">
                Conheça a BemMais e descubra uma nova forma de comprar, revender e aumentar suas
                oportunidades de venda.
              </p>
              <div className="mt-7 flex items-center gap-3 text-sm font-semibold text-white/60">
                <span className="flex size-7 items-center justify-center rounded-full bg-white/8 text-primary">
                  <ArrowDown className="size-4" aria-hidden />
                </span>
                Assista antes de escolher seu caminho.
              </div>
            </div>

            <div className="relative">
              <div
                className="absolute -inset-3 -z-10 rounded-[2rem] bg-primary/20 blur-2xl"
                aria-hidden
              />
              <div className="mx-auto w-full max-w-[25rem] overflow-hidden rounded-[1.6rem] border border-white/15 bg-[#1b1917] shadow-2xl lg:max-w-[24rem]">
                <div className="aspect-[9/16] w-full bg-black">
                  {hasVideo ? (
                    <video
                      className="block size-full object-cover"
                      autoPlay
                      muted
                      controls
                      playsInline
                      preload="metadata"
                      poster={
                        isOpportunityVideoConfigured(configuredVideoPoster)
                          ? configuredVideoPoster
                          : undefined
                      }
                      onPlay={onVideoPlay}
                      onTimeUpdate={(event) => onVideoTimeUpdate(event.currentTarget.currentTime)}
                    >
                      <source src={configuredVideoSource} />
                      Seu navegador não suporta a reprodução de vídeo.
                    </video>
                  ) : (
                    <div className="relative flex min-h-96 flex-col justify-end overflow-hidden bg-[linear-gradient(125deg,#26211d_0%,#151412_48%,#bc5715_180%)] p-6 sm:p-9">
                      <div
                        className="absolute right-[-2rem] top-[-3rem] size-48 rounded-full border-[18px] border-primary/35"
                        aria-hidden
                      />
                      <CirclePlay className="mb-auto size-12 text-primary sm:size-15" aria-hidden />
                      <p className="relative text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
                        Vídeo oficial da campanha
                      </p>
                      <p className="relative mt-2 max-w-sm text-xl font-bold leading-tight sm:text-2xl">
                        O conteúdo será exibido aqui assim que o vídeo oficial for configurado.
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-xs text-white/55">
                  <span>{hasVideo ? "Assista e conheça a oportunidade." : "Campanha BemMais"}</span>
                  <span className="font-semibold text-primary">BemMais Distribuidora</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-live="polite"
          className="bg-[#f6f1ea] px-5 py-12 text-[#171513] sm:px-8 sm:py-18"
        >
          <div className="mx-auto max-w-4xl">
            {ctasRevealed ? (
              <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 motion-reduce:animate-none">
                <p className="text-center text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
                  Agora é com você
                </p>
                <h2 className="mx-auto mt-3 max-w-2xl text-center text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.055em] sm:text-6xl">
                  Escolha como você quer começar <span aria-hidden>👇</span>
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-center text-base leading-relaxed text-[#5e554d] sm:text-lg">
                  Entre na comunidade certa para o seu momento e acompanhe as oportunidades da
                  BemMais.
                </p>
                <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
                  <OpportunityCta
                    href={ctaLinks.dropVariado}
                    title="🔥 QUERO DROP + ATACADO VARIADO"
                    description="Para quem quer começar com menos estoque ou aproveitar oportunidades de Drop e Atacado Variado."
                    event="click_drop"
                  />
                  <OpportunityCta
                    href={ctaLinks.gradeFechada}
                    title="🚀 QUERO COMPRAR EM GRADE FECHADA"
                    description="Para lojistas e revendedores que buscam oportunidades de Grade Fechada."
                    event="click_atacado"
                    accent="dark"
                  />
                </div>
              </div>
            ) : (
              <p className="text-center text-sm font-semibold text-[#5e554d]">
                A área para escolher sua comunidade aparece após os primeiros 10 segundos da
                campanha.
              </p>
            )}
          </div>
        </section>

        <section className="bg-[#171513] px-5 py-16 sm:px-8 sm:py-22">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
              Por que entrar para a BemMais?
            </p>
            <div className="mt-5 grid gap-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
              <h2 className="max-w-md text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                Mais estrutura para transformar oportunidade em venda.
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
                Uma comunidade feita para quem já vende, quer começar ou está pronto para enxergar
                novos caminhos no varejo.
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/12 bg-white/12 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map(([Icon, title, description]) => (
                <article key={title} className="min-h-49 bg-[#171513] p-6 sm:p-7">
                  <Icon className="size-6 text-primary" aria-hidden />
                  <h3 className="mt-9 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-primary px-5 py-18 text-primary-foreground sm:px-8 sm:py-28">
          <div
            className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(135deg,transparent_0%,oklch(0.3_0.05_40_/_0.22)_100%)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary-foreground/65">
              BemMais Distribuidora
            </p>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.15rem,7vw,6.5rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.055em] text-balance">
              Não é só sobre comprar produto.
              <br className="hidden sm:block" /> É sobre ter um ecossistema para ajudar você a
              vender mais.
            </h2>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-primary-foreground/80">
              A BemMais conecta produtos, fornecedores, oportunidades, suporte e ferramentas para
              quem quer começar ou crescer no mercado.
            </p>
            <p className="mt-10 text-xl font-bold tracking-tight">
              BemMais — O ecossistema que ajuda sua loja a vender mais.
            </p>
          </div>
        </section>

        <section className="bg-[#f6f1ea] px-5 py-16 text-[#171513] sm:px-8 sm:py-22">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
              Comunidade BemMais
            </p>
            <h2 className="mt-4 text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.055em] sm:text-6xl">
              Pronto para começar?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#5e554d] sm:text-lg">
              Escolha a modalidade que mais combina com o seu momento e entre para a comunidade
              BemMais.
            </p>
            {ctasRevealed && (
              <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
                <OpportunityCta
                  href={ctaLinks.dropVariado}
                  title="QUERO DROP + ATACADO VARIADO"
                  description="Oportunidades para começar com mais flexibilidade."
                  event="click_drop"
                />
                <OpportunityCta
                  href={ctaLinks.gradeFechada}
                  title="QUERO COMPRAR EM GRADE FECHADA"
                  description="Oportunidades para lojistas e revendedores."
                  event="click_atacado"
                  accent="dark"
                />
              </div>
            )}
            <a
              href={ctaLinks.support}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackOpportunityEvent("click_whatsapp_support")}
              className="mt-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#5e554d] underline decoration-primary decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MessageCircle className="size-4 text-primary" aria-hidden /> Precisa falar com a
              BemMais?
            </a>
          </div>
        </section>
      </main>

      <footer className="bg-[#121110] px-5 py-8 text-center text-xs text-white/45 sm:px-8">
        <p>
          © {new Date().getFullYear()} BemMais Distribuidora. O ecossistema que ajuda sua loja a
          vender mais.
        </p>
      </footer>
    </div>
  );
}
