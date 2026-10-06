import { useQuery } from "@tanstack/react-query";

import { podeConectarQuery, podeGerenciarQuery } from "./queries";

/**
 * Os três níveis do portal (HANDOFF, seção 2):
 *
 *   membro  vê e trabalha leads e conteúdo do cliente
 *   admin   + apaga lead, edita a ficha, gerencia acessos daquele cliente
 *   super   equipe OVERSO: vê todos os clientes, cadastra, liga módulos
 *
 * Isto só decide o que a TELA mostra. Quem protege o dado é a RLS do
 * Postgres: esconder um botão aqui não é o que impede a ação.
 */
export type Nivel = "membro" | "admin" | "super";

export function useAcesso(projectId: string | undefined) {
  const { data: superAdmin } = useQuery(podeConectarQuery());
  const { data: gerencia } = useQuery(podeGerenciarQuery(projectId));

  // Enquanto a resposta não chega vale o nível mais baixo: melhor um item
  // aparecer um instante depois do que piscar para quem não pode usá-lo.
  const nivel: Nivel = superAdmin ? "super" : gerencia ? "admin" : "membro";
  return { nivel, superAdmin: superAdmin === true, podeGerenciar: nivel !== "membro" };
}
