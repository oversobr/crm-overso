import { useState } from "react";

/** Azul para as etapas medidas pelo script da landing page, marinho para as do CRM. */
export const COR_ETAPA_LP = "#1A66C2";
export const COR_ETAPA_CRM = "#1C2E45";

export type EtapaDoFunil = {
  rotulo: string;
  dica: string;
  /** Quantas pessoas chegaram até aqui. */
  n: number;
  cor: string;
  /** Título do grupo que começa nesta etapa ("LANDING PAGE", "CRM"). */
  grupo?: string;
};

export type ModoDaTaxa = "anterior" | "total";

const inteiro = (n: number) => n.toLocaleString("pt-BR");
export const porcento = (parte: number, todo: number) =>
  todo > 0 ? `${((parte / todo) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "0%";

/** A etapa em que mais gente saiu (índice de quem recebeu a queda). -1 sem queda nenhuma. */
export function maiorQueda(etapas: EtapaDoFunil[]): number {
  let pior = -1;
  let queda = 0;
  etapas.forEach((e, i) => {
    if (i === 0) return;
    const saiu = etapas[i - 1]!.n - e.n;
    if (saiu > queda) {
      queda = saiu;
      pior = i;
    }
  });
  return pior;
}

const COLUNAS = "grid grid-cols-[minmax(0,1fr)_72px] items-center gap-x-[18px] md:grid-cols-[200px_minmax(0,1fr)_110px_150px]";

/**
 * Funil em barras centralizadas: a largura de cada barra é a fatia que
 * sobrou do topo. Ao lado, a taxa (sobre a etapa anterior ou sobre o total)
 * e quantas pessoas saíram, com a maior queda em destaque. Passar o mouse,
 * ou focar a linha pelo teclado, mostra as duas taxas de uma vez.
 */
export function FunnelChart({ etapas, modo }: { etapas: EtapaDoFunil[]; modo: ModoDaTaxa }) {
  const [sobre, setSobre] = useState<number | null>(null);
  const topo = etapas[0]?.n ?? 0;
  const pior = maiorQueda(etapas);

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${COLUNAS} text-[11px] font-bold tracking-[0.1em] text-texto-3`}>
        <span>ETAPA</span>
        <span className="hidden md:block" />
        <span className="text-right">{modo === "anterior" ? "DA ANTERIOR" : "DO TOTAL"}</span>
        <span className="hidden text-right md:block">SAÍRAM</span>
      </div>

      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1]!.n : e.n;
        const saiu = anterior - e.n;
        const destaque = i === pior;
        const aberto = sobre === i;
        return (
          <div key={e.rotulo} className="flex flex-col gap-1.5">
            {e.grupo && (
              <span className={`flex items-center gap-2.5 pb-1 text-[11px] font-bold tracking-[0.1em] text-texto-2 ${i ? "pt-3.5" : ""}`}>
                {e.grupo}
                <span className="h-px flex-1 bg-gelo" />
              </span>
            )}
            <div
              tabIndex={0}
              onMouseEnter={() => setSobre(i)}
              onMouseLeave={() => setSobre((v) => (v === i ? null : v))}
              onFocus={() => setSobre(i)}
              onBlur={() => setSobre((v) => (v === i ? null : v))}
              aria-label={`${e.rotulo}: ${inteiro(e.n)} pessoas${i ? `, ${porcento(e.n, anterior)} da etapa anterior, ${porcento(e.n, topo)} do total` : ""}`}
              className={`${COLUNAS} relative min-h-[52px] rounded-[12px] py-1 outline-offset-2 transition-colors ${aberto ? "bg-azul-claro" : ""}`}
            >
              <span className="flex min-w-0 flex-col gap-0.5 pl-2">
                <span className="text-[14px] font-bold">{e.rotulo}</span>
                <span className="text-[11px] text-texto-3">{e.dica}</span>
              </span>
              <span className="order-last col-span-2 flex justify-center md:order-none md:col-span-1">
                <span
                  className="flex h-11 min-w-16 items-center justify-center rounded-[10px] text-[15px] font-extrabold text-white transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${topo > 0 ? Math.max(6, (e.n / topo) * 100) : 6}%`, background: e.cor }}
                >
                  {inteiro(e.n)}
                </span>
              </span>
              <span className="text-right text-[18px] font-extrabold">
                {i === 0 ? "100%" : porcento(e.n, modo === "anterior" ? anterior : topo)}
              </span>
              <span className="hidden justify-end md:flex">
                {i > 0 && (
                  <span
                    className={`whitespace-nowrap rounded-lg px-2.5 py-[5px] text-[12px] font-bold ${
                      destaque ? "bg-alerta-fundo text-alerta" : "bg-superficie-2 text-texto-2"
                    }`}
                  >
                    −{inteiro(saiu)}
                    {destaque ? " · maior queda" : ""}
                  </span>
                )}
              </span>

              {aberto && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-[-58px] z-[5] flex -translate-x-1/2 flex-col gap-[3px] whitespace-nowrap rounded-[12px] bg-marinho px-3.5 py-2.5 text-[12px] text-white shadow-[0_10px_24px_rgba(14,24,38,0.22)]"
                >
                  <strong className="text-[13px]">
                    {e.rotulo}: {inteiro(e.n)} pessoas
                  </strong>
                  <span className="text-[#C9D6E6]">
                    {i === 0 ? "Ponto de partida do funil" : `${porcento(e.n, anterior)} da etapa anterior · ${porcento(e.n, topo)} do total`}
                  </span>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
