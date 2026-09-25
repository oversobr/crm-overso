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

export type Project = {
  id: string;
  nome: string;
  slug: string;
  /** Módulos contratados (20_modulos_cliente.sql). Ausente = banco antigo = ligado. */
  usa_crm?: boolean | undefined;
  usa_conteudo?: boolean | undefined;
  /** 24_eventos.sql. Diferente dos outros, nasce DESLIGADO. */
  usa_eventos?: boolean | undefined;
};

export type Modulo = "crm" | "conteudo" | "eventos";

export const MODULO_LABEL: Record<Modulo, string> = { crm: "CRM", conteudo: "Conteúdo", eventos: "Eventos" };

/**
 * Quais módulos o cliente usa. Só `false` desliga: sem a coluna (banco antes
 * do 20) ou sem cliente carregado, tudo aparece ligado, como sempre foi.
 */
export function modulosDe(p: Project | undefined): Record<Modulo, boolean> {
  // Eventos é o contrário: só liga com true explícito (nasce desligado, e
  // sem a coluna — banco antes do 24 — não há tabela pra mostrar).
  return { crm: p?.usa_crm !== false, conteudo: p?.usa_conteudo !== false, eventos: p?.usa_eventos === true };
}

/**
 * Página que o usuário ADMINISTRA. Só esta carrega a ingest_key — o banco
 * (16_conectar_admin.sql) fechou a coluna pro select comum, e ela só volta
 * pela função projetos_gerenciaveis().
 */
export type ProjetoGerenciavel = Project & { ingest_key: string };

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

/* ── Calendário de conteúdo (18_calendario.sql) ─────────────────────
   As listas espelham os CHECKs da tabela: um valor fora delas o banco
   recusa, então mudar aqui exige mudar lá também. */

export type Formato = "post" | "carrossel" | "story" | "reels" | "youtube" | "shorts" | "tiktok" | "outro";

export const FORMATO_LABEL: Record<Formato, string> = {
  post: "Post",
  carrossel: "Carrossel",
  story: "Story",
  reels: "Reels",
  youtube: "Vídeo YouTube",
  shorts: "Shorts",
  tiktok: "TikTok",
  outro: "Outro",
};

export type Rede = "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "x" | "pinterest" | "outro";

export const REDE_LABEL: Record<Rede, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  pinterest: "Pinterest",
  outro: "Outra",
};

export type StatusConteudo = "ideia" | "producao" | "aprovacao" | "agendado" | "publicado";

export const STATUS_CONTEUDO_LABEL: Record<StatusConteudo, string> = {
  ideia: "Ideia",
  producao: "Em produção",
  aprovacao: "Em aprovação",
  agendado: "Agendado",
  publicado: "Publicado",
};

export type Conteudo = {
  id: string;
  project_id: string;
  titulo: string;
  formato: Formato;
  redes: Rede[];
  /** YYYY-MM-DD, dia no calendário (sem fuso). */
  data: string;
  /** HH:MM:SS ou null quando o horário ainda não foi definido. */
  hora: string | null;
  status: StatusConteudo;
  legenda: string | null;
  link: string | null;
  observacoes: string | null;
  /** Caminhos no bucket "conteudos" (19_calendario_midias.sql), na ordem do carrossel. */
  midias: string[];
  /** Evento cuja divulgação este post faz (24_eventos.sql). */
  evento_id?: string | null;
  /** Quem criou (23_conteudo_autor.sql). Nulo em conteúdos antigos sem autor gravado. */
  criado_por?: string | null;
  criado_por_nome?: string | null;
  criado_por_email?: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** O que o formulário manda: o resto o banco preenche. */
export type ConteudoEntrada = Pick<
  Conteudo,
  "titulo" | "formato" | "redes" | "data" | "hora" | "status" | "legenda" | "link" | "observacoes" | "midias" | "evento_id"
>;

/** Comentário da conversa de um conteúdo (22_comentarios_conteudo.sql). */
export type Comentario = {
  id: string;
  conteudo_id: string;
  autor_id: string | null;
  autor_nome: string;
  autor_email: string;
  texto: string;
  criado_em: string;
};

/* ── Eventos (24_eventos.sql) ─────────────────────────────────────── */

export type StatusEvento = "planejamento" | "confirmado" | "realizado" | "cancelado";

export const STATUS_EVENTO_LABEL: Record<StatusEvento, string> = {
  planejamento: "Em planejamento",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export type Evento = {
  id: string;
  project_id: string;
  nome: string;
  /** YYYY-MM-DD */
  data_inicio: string;
  data_fim: string | null;
  local: string | null;
  descricao: string | null;
  status: StatusEvento;
  criado_por_nome: string | null;
  criado_em: string;
};

export type EventoEntrada = Pick<Evento, "nome" | "data_inicio" | "data_fim" | "local" | "descricao" | "status">;

export type StatusDemanda = "a_fazer" | "fazendo" | "revisao" | "concluido";

/** Também é a ordem das colunas do Kanban. */
export const STATUS_DEMANDA_LABEL: Record<StatusDemanda, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  revisao: "Em revisão",
  concluido: "Concluído",
};

export type Demanda = {
  id: string;
  evento_id: string;
  titulo: string;
  descricao: string | null;
  status: StatusDemanda;
  responsavel: string | null;
  prazo: string | null;
  ordem: number;
  criado_por_nome: string | null;
  criado_em: string;
};

export type DemandaEntrada = Pick<Demanda, "titulo" | "descricao" | "status" | "responsavel" | "prazo">;

export type CategoriaMaterial = "artes" | "contratos" | "roteiro" | "fornecedores" | "fotos_videos" | "outros";

export const CATEGORIA_MATERIAL_LABEL: Record<CategoriaMaterial, string> = {
  artes: "Artes",
  contratos: "Contratos",
  roteiro: "Roteiro",
  fornecedores: "Fornecedores",
  fotos_videos: "Fotos e vídeos",
  outros: "Outros",
};

export type Material = {
  id: string;
  evento_id: string;
  categoria: CategoriaMaterial;
  tipo: "arquivo" | "link";
  nome: string;
  /** arquivo: caminho no bucket "eventos"; link: a URL. */
  endereco: string;
  tamanho: number | null;
  mime: string | null;
  criado_por_nome: string | null;
  criado_em: string;
};

/* ── Tarefas avulsas do Calendário (26_tarefas.sql) ───────────────── */

export type StatusTarefa = "a_fazer" | "fazendo" | "concluido";

export const STATUS_TAREFA_LABEL: Record<StatusTarefa, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  concluido: "Concluída",
};

export type Tarefa = {
  id: string;
  project_id: string;
  titulo: string;
  descricao: string | null;
  /** YYYY-MM-DD */
  data: string;
  hora: string | null;
  status: StatusTarefa;
  responsavel: string | null;
  criado_por_nome: string | null;
  criado_em: string;
};

export type TarefaEntrada = Pick<Tarefa, "titulo" | "descricao" | "data" | "hora" | "status" | "responsavel">;
