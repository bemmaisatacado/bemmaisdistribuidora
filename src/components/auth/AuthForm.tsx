import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/landing/primitives";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin`, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo("Conta criada. Confirme pelo link enviado ao seu e-mail para entrar.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg.includes("Invalid login") ? "E-mail ou senha incorretos." : msg);
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-soft">
        <Link to="/" aria-label="Voltar ao início"><Logo className="mx-auto h-14" /></Link>
        <h1 className="mt-5 text-center text-xl font-bold">{mode === "signin" ? "Entrar" : "Criar minha conta"}</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <input className={input} placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          )}
          <input className={input} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <input className={input} type="password" placeholder="Senha" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-muted-foreground">{info}</p>}
          <button disabled={loading} className="w-full rounded-xl bg-primary py-3 text-sm font-bold uppercase tracking-wide text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
            {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>Não tem conta? <Link to="/criar-conta" className="font-semibold text-primary">Criar conta</Link></>
          ) : (
            <>Já tem conta? <Link to="/entrar" className="font-semibold text-primary">Entrar</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
