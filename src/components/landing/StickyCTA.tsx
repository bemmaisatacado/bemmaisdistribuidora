import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

/** Mobile-only CTA bar that appears after the hero scrolls away. */
export function StickyCTA() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 700);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className={`fixed inset-x-3 bottom-3 z-40 transition-all duration-300 md:hidden ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}>
      <Link to="/criar-conta" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-glow">
        Quero começar a vender <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
