import { Link } from "@tanstack/react-router";
import { Button, Container, Logo } from "./primitives";

export function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Container className="py-6">
        <Link to="/" aria-label="Voltar ao início"><Logo className="h-14" /></Link>
      </Container>
      <Container className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <h1 className="text-[clamp(1.8rem,4vw,2.75rem)] font-bold uppercase">{title}</h1>
        <p className="mt-4 max-w-md text-muted-foreground">{text}</p>
        <div className="mt-8"><Button to="/" variant="outline">Voltar ao início</Button></div>
      </Container>
    </div>
  );
}
