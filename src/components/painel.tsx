import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartColumn, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { Dropdown } from "@/components/dropdown";
import { TopBar } from "@/components/shell/top-bar";
import { registrarAcesso, sincronizarConta } from "@/lib/conta";
import { acessosPorCliente, primeiraTela, ultimoCliente } from "@/lib/guardado";
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
  /** Só seleciona o cliente, sem transição — é o que a tela Conectar usa. */
  setProjetoId: (id: string) => void;
  /**
   * Troca de cliente "de verdade" (seletor da sidebar): além de selecionar,
   * avisa, dispara a transição com loading e volta pro Dashboard.
   */
  trocarCliente: (id: string) => void;
  /**
   * Quantas trocas completas houve. Serve de `key` pra reanimar a tela a cada
   * troca — e começa em 0 pra carga inicial não animar à toa.
   */
  trocas: number;
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
  // Quem escolheu "Último cliente usado" em Configurações volta direto nele;
  // sem isso (ou se aquele cliente não existir mais), vale o primeiro da lista.
  const [projetoId, setProjetoId] = useState<string | null>(() =>
    primeiraTela.ler() === "ultimo" ? ultimoCliente.ler() : null,
  );
  const [campanhaId, setCampanhaId] = useState<string | null>(null);

  const { data: projetos = [] } = useQuery(projectsQuery());
  // Sem projeto escolhido, assume o primeiro — o caso comum é ter só um.
  const projeto = projetos.find((p) => p.id === projetoId) ?? projetos[0];
  const { data: campanhas = [] } = useQuery(campaignsQuery(projeto?.id));
  const campanha = campanhas.find((c) => c.id === campanhaId) ?? null;
  const [trocas, setTrocas] = useState(0);

  // Uma vez por sessão: o que a conta guardou em outro aparelho (lidas,
  // avisos desligados, últimos acessos) entra neste navegador.
  useEffect(() => {
    void sincronizarConta().catch(() => {});
  }, []);

  const valor = useMemo<Painel>(() => {
    function selecionar(id: string) {
      setProjetoId(id);
      ultimoCliente.gravar(id);
      acessosPorCliente.gravar({ ...acessosPorCliente.ler(), [id]: new Date().toISOString() });
      registrarAcesso(id);
      // A campanha é do cliente anterior; levá-la adiante filtraria por nada.
      if (id !== projeto?.id) setCampanhaId(null);
    }
    function trocarCliente(id: string) {
      // Escolher o mesmo cliente de novo não é troca: nada de cortina.
      if (id === projeto?.id) return;
      selecionar(id);
      // O aviso da troca é a CortinaDeTroca (routes/_authed.tsx), que já
      // mostra o nome — um toast junto só repetiria por cima dela.
      setTrocas((n) => n + 1);
    }
    return { projeto, projetos, setProjetoId: selecionar, trocarCliente, trocas, campanha, campanhas, setCampanhaId };
  }, [projeto, projetos, trocas, campanha, campanhas]);

  return <PainelCtx.Provider value={valor}>{children}</PainelCtx.Provider>;
}

/**
 * Topo das telas que ainda não foram refeitas no design novo: o TopBar
 * (título, busca, sino, avatar) e, embaixo, a faixa com o que cada tela já
 * tinha: recorte de campanha, botão de atualizar e as ações próprias.
 * As telas novas usam o <TopBar> direto.
 */
export function Cabecalho({
  titulo,
  subtitulo,
  atualizavel = false,
  oQueAtualiza = "Leads",
  comCampanha = true,
  children,
}: {
  titulo: string;
  /** Linha de contexto abaixo do título. */
  subtitulo?: string;
  atualizavel?: boolean;
  /** Complemento do botão e do aviso ("Atualizar Leads"); "" deixa só "Atualizar". */
  oQueAtualiza?: string;
  /** Campanha é recorte de leads; telas como o Calendário não usam. */
  comCampanha?: boolean;
  /** Ações próprias da tela, alinhadas à direita. */
  children?: ReactNode;
}) {
  const { campanha, campanhas, setCampanhaId } = usePainel();
  const qc = useQueryClient();
  // >0 enquanto qualquer query está buscando: anima o ícone e a barra.
  const buscando = useIsFetching() > 0;

  async function atualizar() {
    // Liga o blur no conteúdo enquanto busca; invalidateQueries resolve só
    // quando os refetches terminam, então o aviso sai no momento certo.
    setAtualizando(true);
    try {
      await qc.invalidateQueries();
      toast(`${oQueAtualiza || "Dados"} atualizados com as informações mais recentes.`, "success");
    } finally {
      setAtualizando(false);
    }
  }

  const temCampanha = comCampanha && campanhas.length > 0;

  return (
    <div className="mb-5 flex flex-col gap-4">
      <TopBar titulo={titulo} subtitulo={subtitulo} />

      {(temCampanha || atualizavel || children) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {temCampanha && (
            <Dropdown
              value={campanha?.id ?? ""}
              onChange={(v) => setCampanhaId(v || null)}
              options={[
                { value: "", label: "Todo o período" },
                ...campanhas.map((c) => ({ value: c.id, label: c.nome })),
              ]}
              leading={<ChartColumn size={14} strokeWidth={1.8} className="shrink-0 text-azul" />}
              triggerClassName="btn btn-secundario btn-40"
            />
          )}

          {atualizavel && (
            <button
              onClick={atualizar}
              disabled={buscando}
              title="Busca os dados mais recentes do servidor, sem recarregar a página"
              className="btn btn-secundario btn-40"
            >
              <RefreshCw size={14} strokeWidth={1.8} className={buscando ? "animate-spin" : ""} />
              {buscando ? "Atualizando…" : oQueAtualiza ? `Atualizar ${oQueAtualiza}` : "Atualizar"}
            </button>
          )}

          {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
        </div>
      )}

      {/* Barra indeterminada: sinaliza que os dados estão sendo atualizados. */}
      {atualizavel && (
        <div className="h-0.5 overflow-hidden rounded-full bg-transparent">
          {buscando && <div className="bar-loading h-full w-1/4 rounded-full bg-azul" />}
        </div>
      )}
    </div>
  );
}
