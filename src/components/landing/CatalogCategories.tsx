import { ArrowUpRight } from "lucide-react";
import calcados from "@/assets/cat-calcados.jpg";
import vestuario from "@/assets/cat-vestuario.jpg";
import acessorios from "@/assets/cat-acessorios.jpg";
import novas from "@/assets/cat-novas.jpg";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

const CATS = [
  { t: "Calçados", s: "Tênis, casuais e lançamentos", img: calcados, cls: "col-span-2 row-span-2 lg:col-span-2" },
  { t: "Vestuário", s: "Moda feminina e masculina", img: vestuario, cls: "" },
  { t: "Acessórios", s: "Bolsas, bonés e mais", img: acessorios, cls: "" },
  { t: "Novas categorias", s: "Em constante expansão", img: novas, cls: "col-span-2" },
];

export function CatalogCategories() {
  return (
    <Section id="produtos">
      <Container>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeader
            eyebrow="Catálogo"
            title={<>Produtos que dão<br /><span className="text-primary">vontade de vender.</span></>}
            subtitle="Um catálogo que cresce com o seu negócio — selecionado para quem quer vender moda com estilo."
          />
          <p className="shrink-0 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            <span className="text-primary">+</span> Catálogo em constante expansão
          </p>
        </div>
        <div className="mt-10 grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[220px] lg:grid-cols-4 lg:gap-4">
          {CATS.map((c, i) => (
            <Reveal key={c.t} delay={i * 80} className={`group relative overflow-hidden rounded-3xl bg-ink ${c.cls}`}>
              <img src={c.img} alt={c.t} width={896} height={1120} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" />
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2 text-ink-foreground sm:inset-x-5 sm:bottom-5">
                <div className="min-w-0">
                  <h3 className="text-base font-bold uppercase sm:text-xl">{c.t}</h3>
                  <p className="hidden text-xs text-ink-muted sm:block">{c.s}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:rotate-45">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
