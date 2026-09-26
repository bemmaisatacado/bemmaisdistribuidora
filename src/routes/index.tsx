import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { SellingModes } from "@/components/landing/SellingModes";
import { GrowthJourney } from "@/components/landing/GrowthJourney";
import { WhiteLabelStore } from "@/components/landing/WhiteLabelStore";
import { CatalogCategories } from "@/components/landing/CatalogCategories";
import { HybridInventory } from "@/components/landing/HybridInventory";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { AcademySection } from "@/components/landing/AcademySection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Ecosystem } from "@/components/landing/Ecosystem";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";

const TITLE = "BemMais Distribuidora — O ecossistema que ajuda sua loja a vender mais";
const DESC =
  "Produtos, tecnologia e estrutura para você vender mais: Drop, atacado, grade fechada e sua própria loja white-label.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <SellingModes />
        <GrowthJourney />
        <WhiteLabelStore />
        <CatalogCategories />
        <HybridInventory />
        <FeaturesGrid />
        <AcademySection />
        <HowItWorks />
        <Ecosystem />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
