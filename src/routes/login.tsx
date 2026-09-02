import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/login")({ component: Login });

/** Mensagens do Supabase vêm em inglês; as comuns viram português aqui. */
function traduzir(msg: string) {
  const mapa: Record<string, string> = {
    "Invalid login credentials": "Email ou senha incorretos.",
    "Email not confirmed": "Confirme seu email antes de entrar.",
  };
  return mapa[msg] ?? msg;
}

function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setErro(traduzir(error.message));
      setCarregando(false);
      return;
    }

    // invalidate() refaz o beforeLoad do /_authed com a sessão já gravada no
    // cookie — sem isso o guard ainda enxergaria o usuário deslogado.
    await router.invalidate();
    await router.navigate({ to: "/" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-xl border border-line/60 bg-surface/70 p-7"
      >
        <h1 className="display text-2xl font-bold text-gold">Painel CRM</h1>
        <p className="mt-1 text-sm text-muted">Entre para ver seus leads.</p>

        <label className="mt-6 block text-xs font-medium uppercase tracking-wider text-muted">
          Email
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line/60 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
        />

        <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted">
          Senha
        </label>
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line/60 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
        />

        {erro && <p className="mt-4 text-sm text-rose-400">{erro}</p>}

        <button
          type="submit"
          disabled={carregando}
          className="mt-6 w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-base transition hover:bg-gold-dim disabled:opacity-60"
        >
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
