import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import { usePainel } from "@/components/painel";
import { atualizarModulos, podeConectarQuery, type ModulosSalvos } from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Modulo, Project } from "@/lib/types";
import { MODULO_LABEL } from "@/lib/types";

/**
 * Aplica na tela, na hora, os módulos que o banco devolveu — no seletor de
 * clientes (menu, telas, Dashboard) e na lista da tela Clientes — e só
 * depois recarrega do servidor. Assim a mudança aparece mesmo antes do
 * refetch terminar.
 */
export function useAplicarModulos() {
  const qc = useQueryClient();
  return async (salvo: ModulosSalvos) => {
    const mescla = <T extends Project>(lista: T[] | undefined) =>
      lista?.map((p) =>
        p.id === salvo.id
          ? {
              ...p,
              usa_crm: salvo.usa_crm,
              usa_conteudo: salvo.usa_conteudo,
              ...(salvo.usa_eventos !== undefined ? { usa_eventos: salvo.usa_eventos } : {}),
            }
          : p,
      );
    qc.setQueryData<Project[]>(["projects"], mescla);
    qc.setQueryData<Project[]>(["projetos-gerenciaveis"], mescla);
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
  };
}

/** Coluna de cada módulo na tabela projects. */
export const CAMPO_MODULO = { crm: "usa_crm", conteudo: "usa_conteudo", eventos: "usa_eventos" } as const;

const O_QUE_FAZ: Record<Modulo, string> = {
  crm: "Leads das landing pages, funil de conversão e fontes de tráfego.",
  conteudo: "Calendário de posts, stories, reels e vídeos, com status e artes.",
  eventos: "Eventos do cliente com demandas em quadro Kanban, materiais e divulgação.",
};

/**
 * O que aparece no lugar de uma tela (ou área da Dashboard) cujo módulo o
 * cliente não usa. Quem administra os clientes já pode ligar dali mesmo;
 * os demais veem só o aviso.
 *
 * `compacto`: versão de uma linha, pra áreas da Dashboard.
 */
export function ModuloDesativado({ modulo, compacto = false }: { modulo: Modulo; compacto?: boolean }) {
  const { projeto } = usePainel();
  const aplicar = useAplicarModulos();
  const { data: podeAtivar } = useQuery(podeConectarQuery());

  const ativar = useMutation({
    mutationFn: () =>
      atualizarModulos(projeto!.id, { [CAMPO_MODULO[modulo]]: true }),
    onSuccess: async (salvo) => {
      await aplicar(salvo);
      toast(`${MODULO_LABEL[modulo]} ativado para ${projeto?.nome}.`);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const botao = podeAtivar && projeto && (
    <button
      onClick={() => ativar.mutate()}
      disabled={ativar.isPending}
      className="shrink-0 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
    >
      {ativar.isPending ? "Ativando…" : `Ativar ${MODULO_LABEL[modulo]}`}
    </button>
  );

  if (compacto) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-4">
        <Lock size={16} className="shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-sm text-muted">
          <span className="font-medium text-ink">{MODULO_LABEL[modulo]} não está ativado</span> para este cliente.
        </p>
        {botao}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Lock size={20} />
      </div>
      <h2 className="display mt-4 text-lg font-semibold text-ink">
        {MODULO_LABEL[modulo]} não está ativado para {projeto?.nome ?? "este cliente"}
      </h2>
      <p className="mt-1.5 max-w-md text-sm text-muted">{O_QUE_FAZ[modulo]}</p>
      <div className="mt-5">
        {botao || (
          <p className="text-xs text-muted">Fale com a equipe OVERSO para ativar este módulo.</p>
        )}
      </div>
    </div>
  );
}
