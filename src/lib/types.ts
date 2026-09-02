export type Status = "novo" | "contato_feito" | "entrou_no_grupo" | "convertido" | "perdido";

export const STATUS_LABEL: Record<Status, string> = {
  novo: "Novo",
  contato_feito: "Contato Feito",
  entrou_no_grupo: "Entrou no Grupo",
  convertido: "Convertido",
  perdido: "Perdido",
};

export type Lead = {
  id: string;
  project_id: string;
  campaign_id: string | null;
  session_id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string | null;
  /** Formulário livre: cada LP manda o que quiser. */
  respostas: Record<string, unknown>;
  utms: Record<string, string>;
  origem: string | null;
  status: Status;
  completo: boolean;
  criado_em: string;
  completado_em: string | null;
};

export type Project = { id: string; nome: string; slug: string; ingest_key: string };

export type Campaign = {
  id: string;
  project_id: string;
  nome: string;
  inicio: string | null;
  fim: string | null;
  meta_leads: number | null;
};

export type Funil = {
  project_id: string;
  campaign_id: string | null;
  aberturas: number;
  iniciaram: number;
  parciais: number;
  completos: number;
  tx_engajamento: number | null;
  tx_conclusao: number | null;
  tx_conversao: number | null;
};
