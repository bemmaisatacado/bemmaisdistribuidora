import calcados from "@/assets/cat-calcados.jpg";
import vestuario from "@/assets/cat-vestuario.jpg";
import acessorios from "@/assets/cat-acessorios.jpg";
import novas from "@/assets/cat-novas.jpg";
import { Container, Reveal, Section, SectionHeader } from "./primitives";

const CATS = [
  { t: "Calçados", img: calcados },
  { t: "Vestuário", img: vestuario },
  { t: "Acessórios", img: acessorios },
  { t: "Novas categorias", img: novas },
];

export function CatalogCategories() {
  return (
    <Section id="produtos">
      <Container>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeader
            eyebrow="Catálogo"
            title="Um catálogo que cresce com o seu negócio."
            subtitle="Acesse produtos selecionados para diferentes perfis de venda e encontre novas oportunidades para sua operação."
          />
          <p className="shrink-0 text-sm font-semibold text-muted-foreground">
            <span className="text-primary">+</span> Catálogo em constante expansão.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
          {CATS.map((c, i) => (
            <Reveal key={c.t} delay={i * 80} className="group">
              <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-surface">
                <img src={c.img} alt={c.t} width={896} height={1120} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
              </div>
              <h3 className="mt-4 text-sm font-bold uppercase tracking-wider sm:text-base">{c.t}</h3>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
