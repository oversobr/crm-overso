import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

import styles from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Painel CRM — OVERSO" },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument({ children }: { children: ReactNode }) {
  // O queryClient vem do contexto criado em createRouter(), então é o mesmo
  // que os loaders enxergam — sem isso o SSR e o cliente teriam caches
  // diferentes e a tela piscaria dados ao hidratar.
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        {/* Aplica o tema salvo ANTES da tela pintar, senão pisca escuro→claro. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('overso:tema');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}",
          }}
        />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
