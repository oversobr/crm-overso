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

function RootDocument({ children }: { children: ReactNode }) {
  // O queryClient vem do contexto criado em createRouter(), então é o mesmo
  // que os loaders enxergam — sem isso o SSR e o cliente teriam caches
  // diferentes e a tela piscaria dados ao hidratar.
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="pt-BR" data-theme="light">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
