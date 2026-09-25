import { createFileRoute, redirect } from "@tanstack/react-router";

// A antiga tela "Conectar Cliente" virou "Clientes" (com módulos por
// cliente). O endereço velho continua valendo pra quem tinha salvo.
export const Route = createFileRoute("/_authed/conectar")({
  beforeLoad: () => {
    throw redirect({ to: "/clientes" });
  },
});
