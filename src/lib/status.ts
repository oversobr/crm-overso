import type { Campaign, Status, StatusConteudo } from "./types";

/**
 * Cores de status do handoff (seção 3): entram em `style`, porque a cor vem
 * do DADO e o Tailwind só gera classe que encontra escrita.
 *
 * Fundo, texto e borda são variáveis do tema (styles.css): mudam no escuro.
 * Ponto e série são a cor da marca nos gráficos e ficam iguais nos dois
 * temas, menos o Convertido, que no escuro precisa clarear para aparecer.
 *
 *   fundo/texto  o selo (StatusBadge) e o chip do calendário
 *   borda        o contorno do selo: no claro é a cor do fundo, no escuro um tom acima
 *   ponto        a bolinha ao lado do rótulo
 *   serie        a cor da fatia nas barras segmentadas
 */
export type CorStatus = { fundo: string; texto: string; borda: string; ponto: string; serie: string };

export const COR_LEAD: Record<Status, CorStatus> = {
  novo: { fundo: "var(--st-azul-bg)", texto: "var(--st-azul-text)", borda: "var(--st-azul-border)", ponto: "#1A66C2", serie: "#1A66C2" },
  contato_feito: { fundo: "var(--st-laranja-bg)", texto: "var(--st-laranja-text)", borda: "var(--st-laranja-border)", ponto: "#D98A1C", serie: "#5B93D6" },
  entrou_no_grupo: { fundo: "var(--st-teal-bg)", texto: "var(--st-teal-text)", borda: "var(--st-teal-border)", ponto: "#2A8C9C", serie: "#9CC0EA" },
  convertido: { fundo: "var(--st-verde-bg)", texto: "var(--st-verde-text)", borda: "var(--st-verde-border)", ponto: "#1E6B3A", serie: "var(--grafico-convertido)" },
  perdido: { fundo: "var(--st-cinza-bg)", texto: "var(--st-cinza-text)", borda: "var(--st-cinza-border)", ponto: "#B5BEC4", serie: "#C9D2DB" },
};

/** Lead que começou o formulário e não enviou. */
export const COR_PARCIAL = { fundo: "var(--st-laranja-bg)", texto: "var(--st-laranja-text)", borda: "var(--st-laranja-border)" };

export const COR_POST: Record<StatusConteudo, CorStatus> = {
  ideia: { fundo: "var(--st-cinza-bg)", texto: "var(--st-cinza-text)", borda: "var(--st-cinza-border)", ponto: "#B5BEC4", serie: "#B5BEC4" },
  producao: { fundo: "var(--st-laranja-bg)", texto: "var(--st-laranja-text)", borda: "var(--st-laranja-border)", ponto: "#D98A1C", serie: "#D98A1C" },
  aprovacao: { fundo: "var(--st-roxo-bg)", texto: "var(--st-roxo-text)", borda: "var(--st-roxo-border)", ponto: "#8A4FC0", serie: "#8A4FC0" },
  agendado: { fundo: "var(--st-azul-bg)", texto: "var(--st-azul-text)", borda: "var(--st-azul-border)", ponto: "#1A66C2", serie: "#1A66C2" },
  publicado: { fundo: "var(--st-verde-bg)", texto: "var(--st-verde-text)", borda: "var(--st-verde-border)", ponto: "#1E6B3A", serie: "#1E6B3A" },
};

export type StatusCampanha = "ativa" | "agendada" | "encerrada";

export const STATUS_CAMPANHA_LABEL: Record<StatusCampanha, string> = {
  ativa: "Ativa",
  agendada: "Agendada",
  encerrada: "Encerrada",
};

export const COR_CAMPANHA: Record<StatusCampanha, { fundo: string; texto: string; borda: string }> = {
  ativa: { fundo: "var(--st-verde-bg)", texto: "var(--st-verde-text)", borda: "var(--st-verde-border)" },
  agendada: { fundo: "var(--st-laranja-bg)", texto: "var(--st-laranja-text)", borda: "var(--st-laranja-border)" },
  encerrada: { fundo: "var(--st-cinza-bg)", texto: "var(--st-cinza-text)", borda: "var(--st-cinza-border)" },
};

/**
 * O status da campanha não é coluna: sai do período contra o dia de hoje
 * (YYYY-MM-DD). Sem início ou sem fim, a ponta aberta vale como "sempre".
 */
export function statusDaCampanha(c: Pick<Campaign, "inicio" | "fim">, hoje: string): StatusCampanha {
  if (c.inicio && c.inicio > hoje) return "agendada";
  if (c.fim && c.fim < hoje) return "encerrada";
  return "ativa";
}

/**
 * Cor de cada campanha no seletor. O banco ainda não guarda a cor escolhida
 * (entra com a tela Nova campanha); até lá ela sai da posição na lista,
 * sempre a mesma para a mesma campanha.
 */
export const CORES_CAMPANHA = ["#1A66C2", "#2A8C9C", "#D98A1C", "#8A4FC0", "#1E6B3A", "#6B7682"];

/** O marinho de "todas as campanhas": no escuro é o marinho de fundo, mais claro. */
export const COR_TODAS_CAMPANHAS = "var(--navy)";
