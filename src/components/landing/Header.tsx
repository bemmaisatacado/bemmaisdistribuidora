import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button, Container, Logo } from "./primitives";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Produtos", href: "#produtos" },
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Sua Loja", href: "#sua-loja" },
  { label: "Recursos", href: "#recursos" },
  { label: "Academy", href: "#academy" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-background/90 backdrop-blur transition-[box-shadow,border-color] duration-300",
        scrolled ? "border-b border-border shadow-soft" : "border-b border-transparent",
      )}
    >
      <Container className="flex h-18 items-center justify-between gap-6 py-3">
        <Link to="/" aria-label="BemMais Distribuidora — início">
          <Logo className="-my-3 h-14 sm:h-16" />
        </Link>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} className="text-sm font-semibold text-foreground/75 transition-colors hover:text-foreground">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button variant="ghost" to="/entrar">Entrar</Button>
          <Button to="/criar-conta">Criar minha conta</Button>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border lg:hidden"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Container>

      {open && (
        <div className="fixed inset-x-0 top-[72px] bottom-0 z-40 bg-background lg:hidden">
          <Container className="flex h-full flex-col py-8">
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex py-5 font-display text-xl font-semibold"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3">
              <Button to="/criar-conta" size="lg">Criar minha conta</Button>
              <Button to="/entrar" variant="outline" size="lg">Entrar</Button>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
