import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import { Dropdown } from "@/components/dropdown";
import { campaignsQuery, projectsQuery } from "@/lib/queries";
import { setAtualizando } from "@/lib/refresh";
import { toast } from "@/lib/toast";
import type { Campaign, Project } from "@/lib/types";

/**
 * Este módulo existe separado de `routes/_authed.tsx` de propósito.
 *
 * Arquivos de rota são code-splitted pelo plugin do TanStack Router, e um
 * módulo dividido em mais de um chunk cria DUAS instâncias do createContext:
 * o Provider fica numa e o consumidor na outra, então o hook não enxerga o
 * Provider mesmo estando dentro dele. Contexto compartilhado precisa morar
 * fora de arquivo de rota.
 */

type Painel = {
  projeto: Project | undefined;
  projetos: Project[];
  setProjetoId: (id: string) => void;
  campanha: Campaign | null;
  campanhas: Campaign[];
  setCampanhaId: (id: string | null) => void;
};

const PainelCtx = createContext<Painel | null>(null);

export function usePainel() {
  const ctx = useContext(PainelCtx);
  if (!ctx) throw new Error("usePainel precisa estar dentro de <PainelProvider>");
  return ctx;
}

export function PainelProvider({ children }: { children: ReactNode }) {
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [campanhaId, setCampanhaId] = useState<string | null>(null);

  const { data: projetos = [] } = useQuery(projectsQuery());
  // Sem projeto escolhido, assume o primeiro — o caso comum é ter só um.
  const projeto = projetos.find((p) => p.id === projetoId) ?? projetos[0];
  const { data: campanhas = [] } = useQuery(campaignsQuery(projeto?.id));
  const campanha = campanhas.find((c) => c.id === campanhaId) ?? null;

  const valor = useMemo<Painel>(
    () => ({ projeto, projetos, setProjetoId, campanha, campanhas, setCampanhaId }),
    [projeto, projetos, campanha, campanhas],
  );

  return <PainelCtx.Provider value={valor}>{children}</PainelCtx.Provider>;
}

/**
 * Título da página + seletor de campanha. `atualizavel` liga o botão de
 * buscar leads novos — só nas telas de dados (Dashboard, Leads, Funil).
 */
export function Cabecalho({ titulo, atualizavel = false }: { titulo: string; atualizavel?: boolean }) {
  const { campanha, campanhas, setCampanhaId } = usePainel();
  const qc = useQueryClient();
  // >0 enquanto qualquer query está buscando — anima o ícone e a barra.
  const buscando = useIsFetching() > 0;

  async function atualizar() {
    // Liga o blur no conteúdo enquanto busca; invalidateQueries resolve só
    // quando os refetches terminam, então o aviso sai no momento certo.
    setAtualizando(true);
    try {
      await qc.invalidateQueries();
      toast("Leads atualizados com os dados mais recentes.", "success");
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="mb-6">
      <header className="flex h-10 items-center gap-4">
        <h1 className="display text-2xl font-bold text-ink">{titulo}</h1>

        {campanhas.length > 0 && (
          <Dropdown
            value={campanha?.id ?? ""}
            onChange={(v) => setCampanhaId(v || null)}
            options={[
              { value: "", label: "Todo o período" },
              ...campanhas.map((c) => ({ value: c.id, label: c.nome })),
            ]}
            leading={<BarChart3 size={14} className="shrink-0 text-gold" />}
            triggerClassName="rounded-full border border-line/70 bg-surface px-3 py-2 text-sm text-ink hover:border-gold/40"
          />
        )}

        {atualizavel && (
          <button
            onClick={atualizar}
            disabled={buscando}
            title="Busca os leads mais recentes do servidor, sem recarregar a página"
            className="ml-auto flex items-center gap-2 rounded-full border border-line/70 bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-gold/50 disabled:opacity-70"
          >
            <RefreshCw size={14} className={buscando ? "animate-spin" : ""} />
            {buscando ? "Atualizando…" : "Atualizar Leads"}
          </button>
        )}
      </header>

      {/* Barra indeterminada: sinaliza que os dados estão sendo atualizados. */}
      {atualizavel && (
        <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-transparent">
          {buscando && <div className="bar-loading h-full w-1/4 rounded-full bg-gold" />}
        </div>
      )}
    </div>
  );
}
