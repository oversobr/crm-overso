import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import styles from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Portal OVERSO" },
    ],
    links: [
      // A Montserrat vem por <link>, não por @import no CSS: o @import ficaria
      // DEPOIS das regras que o `@import "tailwindcss"` expande, o que é
      // inválido, e o bundler descartava a linha sem avisar.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: styles },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

/**
 * O cache de dados (nome e foto do usuário, clientes, permissões, posts) é
 * da conta que estava logada. Sair e entrar com outra conta sem recarregar a
 * página deixava a conta nova vendo o que ficou guardado da anterior, como se
 * o login não tivesse trocado. Toda vez que a conta muda (saiu, entrou outra,
 * a sessão curta venceu), o cache inteiro é apagado.
 */
function LimparAoTrocarDeConta({ queryClient }: { queryClient: QueryClient }) {
  const conta = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_evento: AuthChangeEvent, sessao: Session | null) => {
      const id = sessao?.user.id ?? null;
      // A primeira notícia (INITIAL_SESSION) só diz quem já estava logado.
      if (conta.current !== undefined && conta.current !== id) queryClient.clear();
      conta.current = id;
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return null;
}

/**
 * Roda no <head>, antes de a tela ser pintada: lê o tema guardado neste
 * navegador e marca o <html>. Sem isto, quem usa o escuro veria o portal
 * claro por um instante a cada carregamento. A chave é a de lib/tema.ts.
 */
const TEMA_ANTES_DE_PINTAR = `try{var t=JSON.parse(localStorage.getItem("overso:tema")||'"claro"');var e=t==="escuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=e?"escuro":"light"}catch(_){}`;

function RootDocument({ children }: { children: ReactNode }) {
  // O queryClient vem do contexto criado em createRouter(), então é o mesmo
  // que os loaders enxergam — sem isso o SSR e o cliente teriam caches
  // diferentes e a tela piscaria dados ao hidratar.
  const { queryClient } = Route.useRouteContext();

  return (
    // suppressHydrationWarning: o script abaixo troca o data-theme antes de o
    // React assumir a página, e essa diferença é de propósito.
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_ANTES_DE_PINTAR }} />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <LimparAoTrocarDeConta queryClient={queryClient} />
          {children}
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
