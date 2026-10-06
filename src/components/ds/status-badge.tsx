import type { ReactNode } from "react";

import type { StatusCampanha } from "@/lib/status";
import { COR_CAMPANHA, COR_LEAD, COR_PARCIAL, COR_POST, STATUS_CAMPANHA_LABEL } from "@/lib/status";
import type { Status, StatusConteudo } from "@/lib/types";
import { STATUS_CONTEUDO_LABEL, STATUS_LABEL } from "@/lib/types";

/**
 * Selo de status: raio 8, texto em negrito sobre o fundo claro da mesma
 * família. `md` é o das tabelas (12px); `lg` o de destaque (13px).
 */
function Selo({
  fundo,
  texto,
  tamanho = "md",
  children,
}: {
  fundo: string;
  texto: string;
  tamanho?: "md" | "lg" | undefined;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-lg font-bold ${
        tamanho === "lg" ? "px-3 py-1.5 text-[13px]" : "px-2.5 py-[5px] text-[12px]"
      }`}
      style={{ background: fundo, color: texto }}
    >
      {children}
    </span>
  );
}

type Props =
  | { tipo: "lead"; status: Status; tamanho?: "md" | "lg" }
  | { tipo: "post"; status: StatusConteudo; tamanho?: "md" | "lg" }
  | { tipo: "parcial"; tamanho?: "md" | "lg" };

/** Status de lead, de post, ou o selo de lead parcial. */
export function StatusBadge(p: Props) {
  if (p.tipo === "parcial") {
    return (
      <Selo fundo={COR_PARCIAL.fundo} texto={COR_PARCIAL.texto} tamanho={p.tamanho}>
        Parcial
      </Selo>
    );
  }
  const cor = p.tipo === "lead" ? COR_LEAD[p.status] : COR_POST[p.status];
  const rotulo = p.tipo === "lead" ? STATUS_LABEL[p.status] : STATUS_CONTEUDO_LABEL[p.status];
  return (
    <Selo fundo={cor.fundo} texto={cor.texto} tamanho={p.tamanho}>
      {rotulo}
    </Selo>
  );
}

/** Status de campanha: pílula pequena (Ativa, Agendada, Encerrada). */
export function CampanhaBadge({ status }: { status: StatusCampanha }) {
  const cor = COR_CAMPANHA[status];
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-bold"
      style={{ background: cor.fundo, color: cor.texto }}
    >
      {STATUS_CAMPANHA_LABEL[status]}
    </span>
  );
}
