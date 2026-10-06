import { createFileRoute } from "@tanstack/react-router";

import { CalendarioTela, validarBuscaCalendario } from "@/components/calendario-tela";

export const Route = createFileRoute("/_authed/calendario")({
  validateSearch: validarBuscaCalendario,
  component: Calendario,
});

function Calendario() {
  return <CalendarioTela titulo="Calendário" rota="/calendario" busca={Route.useSearch()} resumoDePosts={false} criaNaGrade="tarefa" />;
}
