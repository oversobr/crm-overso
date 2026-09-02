import type { ReactNode } from "react";

import { useAtualizando } from "@/lib/refresh";

/**
 * Envolve APENAS a área de informações (cards, tabela, gráficos) — não o
 * cabeçalho. Durante o refresh manual, desfoca só os dados, deixando o título
 * e o botão Atualizar nítidos.
 */
export function DadosBlur({ children }: { children: ReactNode }) {
  const atualizando = useAtualizando();
  return (
    <div
      className={`transition-[filter,opacity] duration-200 ${
        atualizando ? "conteudo-atualizando" : ""
      }`}
    >
      {children}
    </div>
  );
}
