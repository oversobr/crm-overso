import type { Campaign, Status, StatusConteudo } from "./types";

/**
 * Cores de status do handoff (seção 3), como hex: entram em `style`, porque
 * a cor vem do DADO e o Tailwind só gera classe que encontra escrita.
 *
 *   fundo/texto  o selo (StatusBadge) e o chip do calendário
 *   ponto        a bolinha ao lado do rótulo
 *   serie        a cor da fatia nas barras segmentadas
 */
export type CorStatus = { fundo: string; texto: string; ponto: string; serie: string };

export const COR_LEAD: Record<Status, CorStatus> = {
  novo: { fundo: "#E3EEFA", texto: "#1A57A6", ponto: "#1A66C2", serie: "#1A66C2" },
  contato_feito: { fundo: "#FDF0DD", texto: "#8A4B08", ponto: "#D98A1C", serie: "#5B93D6" },
  entrou_no_grupo: { fundo: "#E3F1F3", texto: "#1F5F6B", ponto: "#2A8C9C", serie: "#9CC0EA" },
  convertido: { fundo: "#E2F3E8", texto: "#1E6B3A", ponto: "#1E6B3A", serie: "#1C2E45" },
  perdido: { fundo: "#ECEEF1", texto: "#4A5868", ponto: "#B5BEC4", serie: "#C9D2DB" },
};

/** Lead que começou o formulário e não enviou. */
export const COR_PARCIAL = { fundo: "#FDF0DD", texto: "#8A4B08" };

export const COR_POST: Record<StatusConteudo, CorStatus> = {
  ideia: { fundo: "#ECEEF1", texto: "#4A5868", ponto: "#B5BEC4", serie: "#B5BEC4" },
  producao: { fundo: "#FDF0DD", texto: "#8A4B08", ponto: "#D98A1C", serie: "#D98A1C" },
  aprovacao: { fundo: "#F3E8FB", texto: "#6B3696", ponto: "#8A4FC0", serie: "#8A4FC0" },
  agendado: { fundo: "#E3EEFA", texto: "#1A57A6", ponto: "#1A66C2", serie: "#1A66C2" },
  publicado: { fundo: "#E2F3E8", texto: "#1E6B3A", ponto: "#1E6B3A", serie: "#1E6B3A" },
};

export type StatusCampanha = "ativa" | "agendada" | "encerrada";

export const STATUS_CAMPANHA_LABEL: Record<StatusCampanha, string> = {
  ativa: "Ativa",
  agendada: "Agendada",
  encerrada: "Encerrada",
};

export const COR_CAMPANHA: Record<StatusCampanha, { fundo: string; texto: string }> = {
  ativa: { fundo: "#E2F3E8", texto: "#1E6B3A" },
  agendada: { fundo: "#FDF0DD", texto: "#8A4B08" },
  encerrada: { fundo: "#ECEEF1", texto: "#4A5868" },
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

export const COR_TODAS_CAMPANHAS = "#1C2E45";
