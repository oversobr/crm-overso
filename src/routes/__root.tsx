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
      { title: "Portal OVERSO" },
    ],
    links: [
      // A Inter vem por <link>, não por @import no CSS. O @import ficava
      // DEPOIS das regras que o `@import "tailwindcss"` expande, e @import
      // fora do topo é inválido: o bundler descartava a linha e o portal
      // caía na fonte do sistema sem avisar. Por <link> também carrega em
      // paralelo com o CSS, em vez de esperar ele ser baixado e analisado.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      { rel: "stylesheet", href: styles },
    ],
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
