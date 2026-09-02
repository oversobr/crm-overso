import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import { campaignsQuery, projectsQuery } from "@/lib/queries";
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

/** Título da página + seletor de campanha, como nos mockups. */
export function Cabecalho({ titulo }: { titulo: string }) {
  const { campanha, campanhas, setCampanhaId } = usePainel();

  return (
    <header className="mb-6 flex items-center gap-4">
      <h1 className="display text-2xl font-bold text-ink">{titulo}</h1>

      {campanhas.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface/70 px-3 py-2">
          <BarChart3 size={14} className="text-gold" />
          <select
            value={campanha?.id ?? ""}
            onChange={(e) => setCampanhaId(e.target.value || null)}
            className="bg-transparent text-sm text-ink outline-none"
          >
            <option value="">Todo o período</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      )}
    </header>
  );
}
