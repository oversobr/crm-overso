import { createFileRoute } from "@tanstack/react-router";

import { CalendarioTela, validarBuscaCalendario } from "@/components/calendario-tela";
import { ModuloDesativado } from "@/components/modulo";
import { usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { modulosDe } from "@/lib/types";

/**
 * Programação de post: a mesma tela do Calendário, no item do módulo
 * Conteúdo do menu. `?abrir=<id>` abre direto aquele post: é assim que o
 * Dashboard e a página do evento mandam o clique num post pra cá.
 */
export const Route = createFileRoute("/_authed/postagens")({
  validateSearch: validarBuscaCalendario,
  component: Programacao,
});

function Programacao() {
  const { projeto } = usePainel();
  const busca = Route.useSearch();

  // Portão do módulo: se o cliente não usa Conteúdo, a tela mostra o aviso
  // (e o botão de ativar) em vez de um calendário de posts que ele não tem.
  if (projeto && !modulosDe(projeto).conteudo) {
    return (
      <div className="flex flex-col gap-5">
        <TopBar titulo="Programação de post" />
        <ModuloDesativado modulo="conteudo" />
      </div>
    );
  }
  return <CalendarioTela titulo="Programação de post" rota="/postagens" busca={busca} resumoDePosts criaNaGrade="post" />;
}
