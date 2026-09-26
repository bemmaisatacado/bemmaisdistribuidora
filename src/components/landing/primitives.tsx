import { useEffect, useRef, type ReactNode, type ElementType } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/bemmais-logo.png.asset.json";

export const LOGO_URL = logoAsset.url;

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_URL}
      alt="BemMais Distribuidora"
      width={2172}
      height={724}
      className={cn("h-10 w-auto object-contain", className)}
    />
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-5 sm:px-8", className)}>{children}</div>;
}

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("py-14 sm:py-18 lg:py-20", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      {children}
    </p>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow className="mb-5">{eyebrow}</Eyebrow>}
      <h2 className="text-[clamp(1.9rem,4.2vw,3.25rem)] font-bold uppercase leading-[1.05]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">{subtitle}</p>
      )}
    </Reveal>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost" | "light";
  size?: "md" | "lg";
  className?: string;
  to?: "/" | "/entrar" | "/criar-conta";
  href?: string;
};

export function Button({ children, variant = "primary", size = "md", className, to, href }: ButtonProps) {
  const cls = cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-bold uppercase tracking-wide transition-all duration-300",
    size === "md" ? "px-5 text-xs" : "px-7 py-4 text-sm",
    variant === "primary" &&
      "bg-primary text-primary-foreground hover:-translate-y-0.5 hover:shadow-lift",
    variant === "outline" &&
      "border border-foreground/15 bg-card text-foreground hover:border-foreground/40",
    variant === "ghost" && "text-foreground hover:text-primary",
    variant === "light" &&
      "border border-ink-border text-ink-foreground hover:border-ink-foreground/40",
    className,
  );
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <a href={href} className={cls}>{children}</a>;
}

export function Reveal({
  children,
  className,
  as: Tag = "div",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}
