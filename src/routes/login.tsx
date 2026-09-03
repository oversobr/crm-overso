import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock, Mail, Moon, Sun } from "lucide-react";
import type { ComponentType, InputHTMLAttributes, ReactNode } from "react";
import { useState } from "react";

import { LogoOverso } from "@/components/logo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { trocarTema, useTema } from "@/lib/theme";

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
  const [verSenha, setVerSenha] = useState(false);
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
    <main className="flex min-h-screen">
      <PainelMarca />

      {/* Lado do formulário — este segue o tema escolhido (claro ou escuro). */}
      <section className="relative flex flex-1 items-center justify-center bg-base px-6 py-12">
        <BotaoTema />

        <div className="w-full max-w-md">
          {/* No mobile o painel da marca some, então o logo aparece aqui. */}
          <div className="mb-8 flex justify-center text-[#012b43] lg:hidden dark:text-ink">
            <LogoOverso className="h-6 w-auto" />
          </div>

          <div className="rounded-2xl border border-line/60 bg-surface p-9 shadow-sm shadow-black/5">
            <h1 className="display text-2xl font-bold tracking-tight text-ink">
              Bem-vindo de volta
            </h1>
            <p className="mt-1.5 text-sm text-muted">Entre para acompanhar seus leads.</p>

            <form onSubmit={entrar} className="mt-8">
              <Campo
                id="email"
                rotulo="Email"
                Icone={Mail}
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={setEmail}
              />

              <div className="mt-6">
                <Campo
                  id="senha"
                  rotulo="Senha"
                  Icone={Lock}
                  type={verSenha ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={setSenha}
                  acao={
                    <button
                      type="button"
                      onClick={() => setVerSenha((v) => !v)}
                      aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink"
                    >
                      {verSenha ? (
                        <EyeOff size={16} strokeWidth={1.75} />
                      ) : (
                        <Eye size={16} strokeWidth={1.75} />
                      )}
                    </button>
                  }
                />
              </div>

              {/* aria-live: leitor de tela anuncia o erro sem precisar navegar até ele. */}
              <div aria-live="polite">
                {erro && (
                  <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-700 dark:text-rose-300">
                    {erro}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-4 text-sm font-semibold text-white shadow-sm shadow-gold/25 transition hover:bg-gold-dim disabled:opacity-60"
              >
                {carregando && <Loader2 size={16} className="animate-spin" />}
                {carregando ? "Entrando…" : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Painel da marca. É navy nos DOIS temas (não usa os tokens semânticos): no
 * claro ele vira o contraste da tela, e a identidade não muda com a preferência
 * do usuário. Some abaixo de lg pra sobrar largura pro formulário no celular.
 */
function PainelMarca() {
  return (
    <section className="relative hidden w-[46%] max-w-[42rem] shrink-0 flex-col justify-between overflow-hidden bg-brand-950 p-12 lg:flex">
      {/* Brilhos e grade: profundidade sem imagem — nada pra carregar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 -top-28 h-[26rem] w-[26rem] rounded-full bg-brand-500/25 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-brand-700/40 blur-[130px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.0125]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative text-brand-100">
        <LogoOverso className="h-6 w-auto" />
      </div>

      <div className="relative max-w-md">
        <h2 className="display text-5xl font-bold leading-[1.08] tracking-tight text-brand-100">
          Seus leads,
          <br />
          <span className="text-brand-400">sob controle.</span>
        </h2>
        <p className="mt-6 text-[15px] leading-relaxed text-brand-300">
          Todas as suas landing pages em um painel só. Acompanhe cada lead do primeiro clique à
          conversão e veja de onde vem o resultado.
        </p>
      </div>

      <p className="relative text-xs text-brand-300/60">© {new Date().getFullYear()} OVERSO</p>
    </section>
  );
}

/** Campo com rótulo, ícone à esquerda e espaço opcional pra uma ação à direita. */
function Campo({
  id,
  rotulo,
  Icone,
  value,
  onChange,
  acao,
  ...props
}: {
  id: string;
  rotulo: string;
  Icone: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  value: string;
  onChange: (v: string) => void;
  acao?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "id">) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {rotulo}
      </label>
      <div className="relative mt-2.5">
        <Icone
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          id={id}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl border border-line/70 bg-surface-2 py-4 pl-12 text-[15px] text-ink outline-none transition placeholder:text-muted/60 focus:border-gold/60 focus:ring-2 focus:ring-gold/20 ${
            acao ? "pr-12" : "pr-4"
          }`}
          {...props}
        />
        {acao}
      </div>
    </div>
  );
}

/** Troca de tema também no login — a preferência vale antes de entrar. */
function BotaoTema() {
  const escuro = useTema() === "dark";
  return (
    <button
      onClick={() => trocarTema()}
      aria-label={escuro ? "Tema claro" : "Tema escuro"}
      className="absolute right-6 top-6 rounded-xl border border-line/60 bg-surface p-2.5 text-muted transition hover:text-ink"
    >
      {escuro ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  );
}
