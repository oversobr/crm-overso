import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { PainelProvider, usePainel } from "@/components/painel";
import { ShellCtx } from "@/components/shell/contexto";
import { LogoOverso } from "@/components/logo";
import { MarcaOverso } from "@/components/shell/icones-menu";
import { Sidebar } from "@/components/shell/sidebar";
import { Toaster } from "@/components/toaster";
import { useAtualizando } from "@/lib/refresh";
import { esquecerSessaoCurta, sessaoCurtaVenceu } from "@/lib/sessao";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/_authed")({
  // App estático: o guard roda no navegador. Ele existe pra UX (mandar quem
  // não entrou pro login) — quem protege o DADO é o RLS do Postgres, que não
  // devolve linha nenhuma sem uma sessão válida.
  beforeLoad: async () => {
    // Quem entrou sem "Manter conectado" e fechou o navegador desde então
    // volta para o login (lib/sessao.ts).
    if (sessaoCurtaVenceu()) {
      await getSupabaseBrowserClient().auth.signOut();
      esquecerSessaoCurta();
      throw redirect({ to: "/login" });
    }
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    const user = data.session?.user;
    if (!user?.email) throw redirect({ to: "/login" });
    return { user: { id: user.id, email: user.email } };
  },
  component: AppShell,
});

/** Preferência de menu recolhido, por navegador. */
const CHAVE_MENU = "overso:menu-recolhido";

/**
 * Moldura do portal: menu lateral + área da tela. O topo (título, busca,
 * sino, avatar) não mora aqui: no design ele faz parte de cada página
 * (components/shell/top-bar.tsx).
 */
function AppShell() {
  // Gaveta do menu no celular. No desktop (lg+) o menu é coluna fixa e este
  // estado não é usado pra nada.
  const [menuAberto, setMenuAberto] = useState(false);

  const [recolhido, setRecolhido] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MENU) === "1";
    } catch {
      return false;
    }
  });

  function alternarRecolhido() {
    setRecolhido((v) => {
      try {
        localStorage.setItem(CHAVE_MENU, v ? "0" : "1");
      } catch {
        // localStorage indisponível — vale só nesta sessão
      }
      return !v;
    });
  }

  const shell = useMemo(() => ({ abrirMenu: () => setMenuAberto(true) }), []);

  // Escolher cliente é página inteira: sem o menu lateral, que só faz
  // sentido depois de haver um cliente aberto.
  const semMoldura = useRouterState({ select: (s) => s.location.pathname === "/escolher-cliente" });

  return (
    <PainelProvider>
      <ShellCtx.Provider value={shell}>
        {/* h-dvh (não h-screen) porque no celular a barra do navegador entra e
            sai: com 100vh o rodapé do painel fica escondido atrás dela.
            overflow-hidden trava a moldura; só o <main> rola. */}
        {semMoldura ? (
          <Outlet />
        ) : (
          <div className="flex h-dvh overflow-hidden bg-gelo text-marinho">
            <Sidebar
              aberto={menuAberto}
              onFechar={() => setMenuAberto(false)}
              recolhido={recolhido}
              onAlternarRecolhido={alternarRecolhido}
            />
            <AreaDoCliente />
          </div>
        )}
        <CortinaDeTroca />
        <Toaster />
      </ShellCtx.Provider>
    </PainelProvider>
  );
}

/**
 * Conteúdo da tela. O `key` muda a cada troca de cliente e remonta a tela,
 * então os filtros da anterior (que eram do outro cliente) voltam ao padrão.
 * Fica fora do AppShell porque precisa do contexto do painel.
 */
function AreaDoCliente() {
  const { trocas } = usePainel();
  const main = useRef<HTMLElement>(null);
  const atualizando = useAtualizando();

  // A tela nova começa do topo — rolada no meio parecia continuação da antiga.
  useEffect(() => {
    if (trocas > 0) main.current?.scrollTo({ top: 0 });
  }, [trocas]);

  return (
    // min-w-0 é o que impede uma tabela larga de esticar a coluna inteira
    // e empurrar o layout — sem isso o flex-1 cresce além da tela.
    <main
      ref={main}
      data-atualizando={atualizando || undefined}
      aria-busy={atualizando}
      className="min-w-0 flex-1 overflow-y-auto px-4 pb-12 pt-[26px] sm:px-6 lg:px-8"
    >
      {/* Botão Atualizar: uma barra corre no topo da janela e os dados pulsam
          desfocados (styles.css) até a resposta chegar. */}
      {atualizando && <span aria-hidden className="barra-atualizando" />}
      <div key={trocas}>
        <Outlet />
      </div>
    </main>
  );
}

/** Quanto a cortina da troca fica cheia na tela, antes de começar a sumir. */
const TROCA_VISIVEL_MS = 1000;
const TROCA_SAIDA_MS = 250;

/**
 * Cortina da troca de cliente: cobre o portal inteiro com a identidade da
 * OVERSO e o nome do cliente, enquanto a barra enche; depois some em fade e
 * revela o Dashboard do cliente novo. É o que deixa a troca impossível de
 * passar despercebida — trocar de cliente recarrega a tela inteira.
 */
function CortinaDeTroca() {
  const { trocas, projeto } = usePainel();
  const [fase, setFase] = useState<"cheia" | "saindo" | null>(null);

  useEffect(() => {
    if (trocas === 0) return;
    setFase("cheia");
    // Trocas seguidas reiniciam a cortina em vez de empilhar timers.
    const sair = setTimeout(() => setFase("saindo"), TROCA_VISIVEL_MS);
    const fim = setTimeout(() => setFase(null), TROCA_VISIVEL_MS + TROCA_SAIDA_MS);
    return () => {
      clearTimeout(sair);
      clearTimeout(fim);
    };
  }, [trocas]);

  if (!fase) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // key: a cada troca a cortina renasce, e as animações de entrada e da
      // barra recomeçam do zero.
      key={trocas}
      className={`cortina-troca fixed inset-0 z-[90] flex items-center justify-center overflow-hidden text-white ${
        fase === "saindo" ? "cortina-saindo" : ""
      }`}
      // Degradê profundo: o mesmo dos cabeçalhos de popup e do login.
      style={{ background: "var(--degrade-profundo)" }}
    >
      <MarcaOverso
        largura={520}
        altura={470}
        className="pointer-events-none absolute -right-20 -top-16 opacity-[0.08]"
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="flex items-center gap-3">
          <LogoOverso className="h-6 w-auto" />
        </div>
        <p className="cortina-nome mt-14 text-[11px] font-bold uppercase tracking-[0.12em] text-azul-claro-2 sm:mt-16">
          Abrindo cliente
        </p>
        <p className="cortina-nome mt-2 max-w-[80vw] truncate text-[32px] font-extrabold tracking-[-0.02em] sm:text-[40px]">
          {projeto?.nome}
        </p>
        <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/15">
          <div className="cortina-progresso h-full rounded-full bg-white" />
        </div>
      </div>
    </div>
  );
}
