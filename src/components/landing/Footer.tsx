import { Container, Logo } from "./primitives";

const COLS = [
  { t: "Ecossistema", l: [["Produtos", "#produtos"], ["Drop", "#formas-de-vender"], ["Atacado", "#formas-de-vender"], ["Sua Loja", "#sua-loja"], ["Academy", "#academy"]] },
  { t: "BemMais", l: [["Sobre", "#formas-de-vender"], ["Contato", "#contato"], ["Termos", "#"], ["Privacidade", "#"]] },
  { t: "Social", l: [["Instagram", "#"], ["WhatsApp", "#"]] },
];

export function Footer() {
  return (
    <footer id="contato" className="border-t border-border bg-card">
      <Container className="grid gap-12 py-16 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Logo className="h-11" />
          <p className="mt-6 text-sm font-bold">BemMais Distribuidora</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">O ecossistema que ajuda sua loja a vender mais.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLS.map((c) => (
            <div key={c.t}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{c.t}</p>
              <ul className="mt-5 space-y-3">
                {c.l.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-sm font-medium transition-colors hover:text-primary">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
      <Container className="border-t border-border py-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} BemMais Distribuidora. Todos os direitos reservados.
      </Container>
    </footer>
  );
}
