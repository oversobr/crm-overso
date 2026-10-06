import { queryOptions } from "@tanstack/react-query";

import { getSupabaseBrowserClient } from "./supabase/client";
import { modulosDe } from "./types";
import { urlSegura } from "./url";
import type {
  Campaign,
  CategoriaMaterial,
  Comentario,
  Conteudo,
  ConteudoEntrada,
  Demanda,
  DemandaEntrada,
  Evento,
  EventoEntrada,
  Material,
  StatusDemanda,
  Tarefa,
  TarefaEntrada,
  Funil,
  Lead,
  Project,
  ProjetoGerenciavel,
  PerfilCliente,
  PerfilClienteEntrada,
} from "./types";

export const projectsQuery = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const sb = getSupabaseBrowserClient();
      // Do mais novo pro mais antigo: se o banco ainda não tem uma coluna
      // (migration não rodada), tenta sem ela. Sem este recuo o seletor de
      // clientes quebraria inteiro — assim ele segue funcionando.
      //   24_eventos → usa_eventos · 20_modulos_cliente → usa_crm/usa_conteudo
      const tentativas = [
        "id, nome, slug, usa_crm, usa_conteudo, usa_eventos",
        "id, nome, slug, usa_crm, usa_conteudo",
        "id, nome, slug",
      ];
      for (const colunas of tentativas) {
        const { data, error } = await sb.from("projects").select(colunas).order("nome");
        if (!error) return (data ?? []) as unknown as Project[];
        if (!colunaInexistente(error) || colunas === tentativas.at(-1)) throw error;
      }
      return [];
    },
  });


/**
 * Se o usuário pode abrir a aba "Conectar Cliente" — ou seja, cadastrar um
 * cliente novo no CRM.
 *
 * A regra é super-admin, e só. Cadastrar cliente é operação da OVERSO, não do
 * cliente: quem é `admin` de uma página administra AQUELA página (equipe,
 * leads), não o CRM inteiro. Quem entra na lista é decidido em
 * Configuração → Acesso global (tabela super_admins, 12/13_*.sql).
 *
 * `is_super_admin()` existe desde o 12_equipe, então isto não depende de
 * migration nenhuma — a aba nunca some por causa de SQL não aplicado.
 */
export const podeConectarQuery = () =>
  queryOptions({
    queryKey: ["pode-conectar"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabaseBrowserClient().rpc("is_super_admin");
      if (error) throw error;
      return Boolean(data);
    },
  });

/** Coluna que o banco realmente não tem (antes do 20). */
function colunaInexistente(erro: { code?: string; message?: string } | null) {
  return erro?.code === "42703" || erro?.code === "PGRST204" || /column .* does not exist/i.test(erro?.message ?? "");
}

/** Coluna que o banco ainda não tem (ou que o grant por coluna não libera). */
function colunaAusente(erro: { code?: string; message?: string } | null) {
  return (
    erro?.code === "42703" ||
    erro?.code === "42501" ||
    erro?.code === "PGRST204" ||
    /column .* does not exist|permission denied/i.test(erro?.message ?? "")
  );
}

/** Erro de "função não existe" do PostgREST — o banco ainda sem a migration 16. */
function funcaoAusente(erro: { code?: string; message?: string } | null) {
  return (
    erro?.code === "PGRST202" ||
    /does not exist|schema cache/i.test(erro?.message ?? "")
  );
}

/**
 * As páginas que o usuário administra, com a chave de captura de cada uma.
 *
 * Caminho preferido: a função `projetos_gerenciaveis()` do 16_conectar_admin,
 * que é a única forma de ler a `ingest_key` depois que a coluna é fechada.
 * Enquanto essa migration não roda, cai no caminho antigo — a coluna ainda
 * está aberta, e o filtro de quem é admin é feito aqui. O trecho de
 * compatibilidade pode sair assim que o 16 estiver aplicado em produção.
 */
export const projetosGerenciaveisQuery = () =>
  queryOptions({
    queryKey: ["projetos-gerenciaveis"],
    queryFn: async (): Promise<ProjetoGerenciavel[]> => {
      const sb = getSupabaseBrowserClient();

      const { data, error } = await sb.rpc("projetos_gerenciaveis");
      if (!error) return (data ?? []) as ProjetoGerenciavel[];
      if (!funcaoAusente(error)) throw error;

      // ── compatibilidade: banco sem a migration 16 ──
      // A coluna ingest_key ainda está aberta no select comum, então dá pra
      // ler direto. Só super-admin chega até aqui (o portão da tela), e
      // super-admin enxerga todas as páginas — daí não ter filtro.
      const { data: linhas, error: e2 } = await sb
        .from("projects")
        .select("id, nome, slug, ingest_key")
        .order("nome");
      if (e2) throw e2;
      return (linhas ?? []) as ProjetoGerenciavel[];
    },
  });

const CAMPANHA_BASICO = "id, project_id, nome, inicio, fim, meta_leads";
/** Colunas que o popup "Nova campanha" grava e o banco pode ainda não ter. */
const CAMPANHA_EXTRAS = ["cor", "investimento", "regra", "utm_campaign", "landing_pages"] as const;

export const campaignsQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["campaigns", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Campaign[]> => {
      const sb = getSupabaseBrowserClient();
      // Tenta com os campos do popup "Nova campanha" (cor, investimento,
      // regra, UTM, landing pages); num banco que ainda não tem essas
      // colunas, recua para o básico. Mesmo esquema do projectsQuery.
      const tentativas = [`${CAMPANHA_BASICO}, ${CAMPANHA_EXTRAS.join(", ")}`, CAMPANHA_BASICO];
      for (const colunas of tentativas) {
        const { data, error } = await sb
          .from("campaigns")
          .select(colunas)
          .eq("project_id", projectId!)
          .order("inicio", { ascending: false });
        if (!error) return (data ?? []) as unknown as Campaign[];
        if (!colunaAusente(error) || colunas === CAMPANHA_BASICO) throw error;
      }
      return [];
    },
  });

export type FiltroLeads = {
  projectId: string | undefined;
  campaignId: string | null;
  busca: string;
  status: string;
  /** "" = todos, "completo" = enviados, "parcial" = abandonados */
  tipo: string;
  /** "" = todas; senão o utm_source, com "direto" para quem chegou sem UTM. */
  origem: string;
  pagina: number;
  /** Recorte por dia de chegada (YYYY-MM-DD, Brasília). Ausente = sem limite. */
  de?: string | null;
  ate?: string | null;
};

export const POR_PAGINA = 15;

export const leadsQuery = (f: FiltroLeads) =>
  queryOptions({
    queryKey: ["leads", f],
    enabled: Boolean(f.projectId),
    queryFn: async (): Promise<{ linhas: Lead[]; total: number }> => {
      // A busca também olha dentro das respostas do formulário, numa coluna
      // que o banco mantém (30_portal_novo.sql). Sem ela, a busca recua para
      // nome, email e WhatsApp.
      const primeira = await buscarLeads(f, true);
      const { data, error, count } = primeira.error && f.busca.trim() && colunaAusente(primeira.error) ? await buscarLeads(f, false) : primeira;
      if (error) throw error;
      return { linhas: (data ?? []) as Lead[], total: count ?? 0 };
    },
  });

function buscarLeads(f: FiltroLeads, nasRespostas: boolean) {
      let q = getSupabaseBrowserClient()
        .from("leads")
        .select("*", { count: "exact" })
        .eq("project_id", f.projectId!);

      if (f.campaignId) q = q.eq("campaign_id", f.campaignId);
      if (f.status) q = q.eq("status", f.status);
      if (f.tipo === "completo") q = q.eq("completo", true);
      if (f.tipo === "parcial") q = q.eq("completo", false);

      if (f.de) q = q.gte("criado_em", `${f.de}T00:00:00-03:00`);
      if (f.ate) q = q.lte("criado_em", `${f.ate}T23:59:59.999-03:00`);

      // "direto" não existe no banco: é o rótulo que a view leads_por_fonte
      // dá a utm_source vazio ou ausente, então o filtro repete essa regra.
      if (f.origem === "direto") {
        q = q.or('utms->>utm_source.is.null,utms->>utm_source.eq.""');
      } else if (f.origem) {
        q = q.eq("utms->>utm_source", f.origem);
      }

      // Busca em nome/email/whatsapp de uma vez. As aspas evitam que uma
      // vírgula digitada pelo usuário quebre a sintaxe do filtro `or`.
      if (f.busca.trim()) {
        const t = f.busca.trim().replace(/[,"()]/g, "");
        const campos = ["nome", "email", "whatsapp", ...(nasRespostas ? ["respostas_texto"] : [])];
        q = q.or(campos.map((c) => `${c}.ilike."%${t}%"`).join(","));
      }

      const de = f.pagina * POR_PAGINA;
      return q.order("criado_em", { ascending: false }).range(de, de + POR_PAGINA - 1);
}

export const funilQuery = (projectId: string | undefined, campaignId: string | null) =>
  queryOptions({
    queryKey: ['funil', projectId, campaignId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Funil> => {
      let q = getSupabaseBrowserClient().from('funil').select('*').eq('project_id', projectId!);
      // Sem campanha escolhida a visão é do projeto inteiro, então somamos
      // todas as linhas em vez de filtrar por campaign_id nulo — que traria
      // só os leads órfãos de campanha.
      if (campaignId) q = q.eq('campaign_id', campaignId);

      const { data, error } = await q;
      if (error) throw error;

      const linhas = (data ?? []) as Funil[];
      const soma = (campo: keyof Funil) =>
        linhas.reduce((t, l) => t + (Number(l[campo]) || 0), 0);

      const aberturas = soma('aberturas');
      const iniciaram = soma('iniciaram');
      const completos = soma('completos');
      const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);

      return {
        project_id: projectId!,
        campaign_id: campaignId,
        aberturas,
        iniciaram,
        parciais: soma('parciais'),
        completos,
        tx_engajamento: pct(iniciaram, aberturas),
        tx_conclusao: pct(completos, iniciaram),
        tx_conversao: pct(completos, aberturas),
      };
    },
  });

export const fonteQuery = (projectId: string | undefined, campaignId: string | null) =>
  queryOptions({
    queryKey: ['fonte', projectId, campaignId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<{ fonte: string; total: number }[]> => {
      let q = getSupabaseBrowserClient()
        .from('leads_por_fonte')
        .select('fonte, total')
        .eq('project_id', projectId!);
      if (campaignId) q = q.eq('campaign_id', campaignId);
      const { data, error } = await q;
      if (error) throw error;

      // A view devolve uma linha por campanha; agrupamos por fonte aqui.
      const mapa = new Map<string, number>();
      for (const r of data ?? []) {
        const f = String(r.fonte);
        mapa.set(f, (mapa.get(f) ?? 0) + Number(r.total));
      }
      return [...mapa].map(([fonte, total]) => ({ fonte, total })).sort((a, b) => b.total - a.total);
    },
  });

export type PontoSerie = { dia: string; total: number; completos: number; parciais: number };

/** Data no formato YYYY-MM-DD no fuso de Brasília (bate com as views do banco). */
function diaBrasilia(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export const serieQuery = (
  projectId: string | undefined,
  campaignId: string | null,
  dias = 7,
) =>
  queryOptions({
    queryKey: ["serie", projectId, campaignId, dias],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<PontoSerie[]> => {
      const desde = diaBrasilia(new Date(Date.now() - (dias - 1) * 864e5));
      let q = getSupabaseBrowserClient()
        .from("leads_por_dia")
        .select("dia, total, completos")
        .eq("project_id", projectId!)
        .gte("dia", desde);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q.order("dia");
      if (error) throw error;

      // Preenche os dias sem lead, senão o gráfico "pula" datas.
      const linhas = (data ?? []) as { dia: string; total: number; completos: number }[];
      const mapa = new Map(linhas.map((r) => [r.dia, r]));
      return Array.from({ length: dias }, (_, i) => {
        const d = diaBrasilia(new Date(Date.now() - (dias - 1 - i) * 864e5));
        const r = mapa.get(d);
        const total = Number(r?.total ?? 0);
        const completos = Number(r?.completos ?? 0);
        return { dia: d, total, completos, parciais: Math.max(0, total - completos) };
      });
    },
  });

export type CampanhaInput = {
  nome: string;
  inicio: string | null;
  fim: string | null;
  meta_leads: number | null;
};

/** O que o popup "Nova campanha" tem a mais que o cadastro básico. */
export type CampanhaExtras = Pick<Campaign, (typeof CAMPANHA_EXTRAS)[number]>;

/**
 * CRUD de campanha — a RLS de membro já autoriza escrita direta, sem RPC.
 *
 * `extras` (cor, investimento, regra, UTM, landing pages) são gravados quando
 * o banco tem as colunas. Se ainda não tem, a campanha é criada só com o
 * básico e a função devolve `extrasGravados: false`, pra tela poder avisar
 * em vez de fingir que guardou.
 */
export async function criarCampanha(
  projectId: string,
  dados: CampanhaInput,
  extras?: CampanhaExtras,
): Promise<{ id: string | null; extrasGravados: boolean }> {
  const sb = getSupabaseBrowserClient();
  const idDe = (linhas: unknown) => (linhas as { id: string }[] | null)?.[0]?.id ?? null;
  if (extras) {
    const completo = await sb.from("campaigns").insert({ project_id: projectId, ...dados, ...extras }).select("id");
    if (!completo.error) return { id: idDe(completo.data), extrasGravados: true };
    if (!colunaAusente(completo.error)) throw new Error(completo.error.message);
  }
  const { data, error } = await sb.from("campaigns").insert({ project_id: projectId, ...dados }).select("id");
  if (error) throw new Error(error.message);
  return { id: idDe(data), extrasGravados: !extras };
}

/**
 * As landing pages de onde já chegou lead deste cliente, da mais usada para
 * a menos: é a lista de escolha do popup de campanha. O banco não tem um
 * cadastro de páginas, então elas saem dos endereços de origem dos leads
 * mais recentes, sem a parte de UTMs.
 */
export const paginasDoClienteQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["paginas-do-cliente", projectId],
    enabled: Boolean(projectId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ endereco: string; total: number }[]> => {
      // Banco com o 30: as páginas do último ano já vêm contadas.
      const pronto = await getSupabaseBrowserClient().rpc("landing_pages_do_cliente", { p_project: projectId!, p_dias: 365 });
      if (!pronto.error) {
        return ((pronto.data ?? []) as { endereco: string; leads: number }[]).map((p) => ({ endereco: p.endereco, total: Number(p.leads) }));
      }
      if (!funcaoAusente(pronto.error)) throw pronto.error;

      const { data, error } = await getSupabaseBrowserClient()
        .from("leads")
        .select("origem")
        .eq("project_id", projectId!)
        .not("origem", "is", null)
        .order("criado_em", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const contagem = new Map<string, number>();
      for (const l of (data ?? []) as { origem: string | null }[]) {
        if (!l.origem) continue;
        let endereco = l.origem;
        try {
          const u = new URL(l.origem);
          endereco = u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
        } catch {
          // origem que não é URL fica como veio
        }
        contagem.set(endereco, (contagem.get(endereco) ?? 0) + 1);
      }
      return [...contagem].map(([endereco, total]) => ({ endereco, total })).sort((a, b) => b.total - a.total);
    },
  });

export async function atualizarCampanha(id: string, dados: CampanhaInput) {
  const { error } = await getSupabaseBrowserClient().from("campaigns").update(dados).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function excluirCampanha(id: string) {
  // Leads da campanha não somem: o schema usa `on delete set null`.
  const { error } = await getSupabaseBrowserClient().from("campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Quantos leads um projeto tem — usado pra avisar antes de remover o cliente. */
export const contarLeadsQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["contar-leads", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await getSupabaseBrowserClient()
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

/**
 * Escrita barrada por RLS NÃO devolve erro: a policy simplesmente tira a linha
 * do alcance, o comando casa com zero linhas e volta como sucesso. Por isso
 * todas as escritas daqui pedem as linhas de volta (`.select("id")`) e conferem
 * quantas vieram — sem isso o painel comemora uma exclusão que não aconteceu,
 * que foi exatamente o sintoma do bug corrigido no 17_super_admin_escrita.sql.
 */
const RECUSADO = "O banco recusou: sua conta não tem permissão sobre os leads desta página.";

export async function atualizarStatus(leadId: string, status: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .update({ status })
    .eq("id", leadId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO);
}

/**
 * Exclui um lead. Só admin do projeto (ou super-admin) consegue — a policy
 * leads_delete garante; o botão no painel é só a interface.
 */
export async function excluirLead(leadId: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .delete()
    .eq("id", leadId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO);
}

/** Quantas linhas a operação realmente pegou, contra quantas foram pedidas. */
export type ResultadoMassa = { feitos: number; pedidos: number };

/**
 * Ações em massa. Devolvem a contagem em vez de lançar quando o número não
 * bate: numa seleção grande é normal a permissão valer para umas linhas e não
 * para outras, e a tela precisa poder dizer "12 de 15" em vez de "falhou".
 */
export async function atualizarStatusEmMassa(
  ids: string[],
  status: string,
): Promise<ResultadoMassa> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .update({ status })
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { feitos: data?.length ?? 0, pedidos: ids.length };
}

export async function excluirLeadsEmMassa(ids: string[]): Promise<ResultadoMassa> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("leads")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return { feitos: data?.length ?? 0, pedidos: ids.length };
}

/* ── Calendário de conteúdo ─────────────────────────────────────────── */

/**
 * A tabela vem do 18_calendario.sql. Enquanto ele não roda no banco, o
 * PostgREST responde que não conhece `conteudos` — a tela usa isto pra dizer
 * o que falta em vez de mostrar o erro cru.
 */
export function faltaTabelaConteudos(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: string; message?: string };
  const msg = message ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (/conteudos/.test(msg) && /schema cache|does not exist/.test(msg))
  );
}

/** Conteúdos de um cliente entre dois dias (inclusive), já em ordem de agenda. */
export const conteudosQuery = (projectId: string | undefined, de: string, ate: string) =>
  queryOptions({
    queryKey: ["conteudos", projectId, de, ate],
    enabled: Boolean(projectId),
    // Sem retry: se a tabela não existe, repetir só atrasa o aviso.
    retry: false,
    queryFn: async (): Promise<Conteudo[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("conteudos")
        .select("*")
        .eq("project_id", projectId!)
        .gte("data", de)
        .lte("data", ate)
        .order("data")
        // Sem horário vai pro fim do dia: é o "ainda não definido".
        .order("hora", { nullsFirst: false })
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as Conteudo[];
    },
  });

const RECUSADO_CONTEUDO = "O banco recusou: sua conta não tem permissão sobre o calendário deste cliente.";

/** Um conteúdo pelo id (null se não existe ou a conta não enxerga). */
export async function buscarConteudo(id: string): Promise<Conteudo | null> {
  const { data, error } = await getSupabaseBrowserClient().from("conteudos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Conteudo | null) ?? null;
}

/** Cria o conteúdo e devolve o id (os comentários feitos antes de salvar precisam dele). */
export async function criarConteudo(projectId: string, c: ConteudoEntrada): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("conteudos")
    .insert({ ...c, project_id: projectId })
    .select("id");
  if (error) throw error;
  const id = (data?.[0] as { id: string } | undefined)?.id;
  if (!id) throw new Error(RECUSADO_CONTEUDO);
  return id;
}

/** Serve tanto pra edição completa quanto pra só remarcar o dia (arrastar). */
export async function atualizarConteudo(id: string, c: Partial<ConteudoEntrada>) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("conteudos")
    .update(c)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_CONTEUDO);
}

/** Exclui o conteúdo e, depois, as imagens dele — sem a linha elas ficariam órfãs no bucket. */
export async function excluirConteudo(id: string, midias: string[] = []) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("conteudos")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_CONTEUDO);
  await removerMidias(midias);
}

/* ── Imagens do calendário (19_calendario_midias.sql) ─────────────── */

const BUCKET_MIDIAS = "conteudos";
export const TIPOS_MIDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_MIDIA_MB = 10;

/**
 * Sobe uma imagem e devolve o caminho no bucket. A 1ª pasta é o cliente:
 * é ela que a policy do Storage confere, então o caminho não é enfeite.
 */
export async function enviarMidia(projectId: string, arquivo: File): Promise<string> {
  if (!TIPOS_MIDIA.includes(arquivo.type)) {
    throw new Error(`"${arquivo.name}" não é JPG, PNG, WebP ou GIF.`);
  }
  if (arquivo.size > MAX_MIDIA_MB * 1024 * 1024) {
    throw new Error(`"${arquivo.name}" passa de ${MAX_MIDIA_MB} MB.`);
  }
  const ext = arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const caminho = `${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabaseBrowserClient()
    .storage.from(BUCKET_MIDIAS)
    .upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: "3600" });
  if (error) {
    // Bucket ausente = o 19 ainda não rodou; o erro cru do Storage não diz isso.
    if (/bucket not found/i.test(error.message)) {
      throw new Error("O envio de imagens ainda não foi ativado: rode o supabase/19_calendario_midias.sql.");
    }
    throw error;
  }
  return caminho;
}

/** Remoção em lote. Falha aqui não desfaz nada: no pior caso sobra arquivo solto no bucket. */
export async function removerMidias(caminhos: string[]) {
  if (!caminhos.length) return;
  await getSupabaseBrowserClient().storage.from(BUCKET_MIDIAS).remove(caminhos);
}

/**
 * Links assinados (válidos por 1h) para mostrar as imagens do bucket privado.
 * O cache de 50 min renova antes de o link expirar numa tela que ficou aberta.
 */
export const urlsMidiaQuery = (caminhos: string[]) =>
  queryOptions({
    queryKey: ["midias", caminhos],
    enabled: caminhos.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await getSupabaseBrowserClient()
        .storage.from(BUCKET_MIDIAS)
        .createSignedUrls(caminhos, 60 * 60);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
      return mapa;
    },
  });

/**
 * Duplica um conteúdo com cópia própria das imagens. Reaproveitar os mesmos
 * arquivos faria excluir uma das peças apagar a arte da outra. Se algo falhar
 * no meio, as cópias já feitas são removidas pra não sobrar arquivo solto.
 */
export async function duplicarConteudo(c: Conteudo) {
  const storage = getSupabaseBrowserClient().storage.from(BUCKET_MIDIAS);
  const copias: string[] = [];
  try {
    for (const original of c.midias ?? []) {
      const ext = original.split(".").pop() || "jpg";
      const destino = `${c.project_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await storage.copy(original, destino);
      if (error) throw error;
      copias.push(destino);
    }
    const { titulo, formato, redes, data, hora, status, legenda, link, observacoes } = c;
    await criarConteudo(c.project_id, {
      titulo: `${titulo} (cópia)`,
      formato,
      redes,
      data,
      hora,
      status,
      legenda,
      link,
      observacoes,
      // Sem imagem, não manda a coluna: funciona mesmo antes do 19_*.sql.
      ...(copias.length ? { midias: copias } : {}),
      // A cópia continua sendo divulgação do mesmo evento.
      ...(c.evento_id ? { evento_id: c.evento_id } : {}),
    } as ConteudoEntrada);
  } catch (e) {
    await removerMidias(copias);
    throw e;
  }
}

/* ── Clientes e módulos (20_modulos_cliente.sql) ─────────────────── */

export type NovoCliente = { id: string; nome: string; slug: string; ingest_key: string };

/**
 * Cria o cliente já com os módulos escolhidos. Se o banco ainda não tem o 20,
 * a função antiga (só nome) não conhece os parâmetros novos: aí o cliente é
 * criado do jeito antigo — com tudo ligado — e o aviso diz o que falta.
 */
export async function criarCliente(
  nome: string,
  crm: boolean,
  conteudo: boolean,
  eventos: boolean,
): Promise<NovoCliente> {
  const sb = getSupabaseBrowserClient();
  // Banco com o 24: a função conhece p_eventos.
  const novo = await sb.rpc("criar_projeto", { p_nome: nome, p_crm: crm, p_conteudo: conteudo, p_eventos: eventos });
  if (!novo.error) return novo.data as NovoCliente;
  if (!funcaoAusente(novo.error)) throw new Error(novo.error.message);
  if (eventos && !crm && !conteudo) {
    throw new Error("O módulo Eventos ainda não foi ativado no banco: rode o supabase/24_eventos.sql.");
  }
  // Banco só com o 20: sem eventos.
  const { data, error } = await sb.rpc("criar_projeto", { p_nome: nome, p_crm: crm, p_conteudo: conteudo });
  if (!error) return data as NovoCliente;
  if (!funcaoAusente(error)) throw new Error(error.message);
  const antigo = await sb.rpc("criar_projeto", { p_nome: nome });
  if (antigo.error) throw new Error(antigo.error.message);
  throw Object.assign(new Error("MODULOS_INDISPONIVEIS"), { cliente: antigo.data as NovoCliente });
}

export type ModulosSalvos = { id: string; usa_crm: boolean; usa_conteudo: boolean; usa_eventos?: boolean };

/**
 * Liga/desliga módulos e devolve o que o banco REALMENTE gravou. Pedir só o
 * id de volta provava que a linha foi alcançada, não que o valor mudou — e
 * o aviso de sucesso saía mesmo quando a tela não acompanhava. Agora a
 * resposta traz os módulos salvos, é conferida contra o pedido e alimenta a
 * tela direto.
 */
export async function atualizarModulos(
  id: string,
  m: { usa_crm?: boolean; usa_conteudo?: boolean; usa_eventos?: boolean },
): Promise<ModulosSalvos> {
  // Caminho principal: a função do 21_definir_modulos.sql, que grava como
  // dona da tabela depois de checar quem chamou. O UPDATE direto (abaixo)
  // fica só pra banco que ainda não tem a função.
  const sb = getSupabaseBrowserClient();
  const rpc = await sb.rpc("definir_modulos", {
    p_project: id,
    p_crm: m.usa_crm ?? null,
    p_conteudo: m.usa_conteudo ?? null,
    // Só manda p_eventos quando mexe em eventos: a função antiga (21, sem
    // esse parâmetro) continua atendendo CRM e Conteúdo.
    ...(m.usa_eventos !== undefined ? { p_eventos: m.usa_eventos } : {}),
  });
  let data = rpc.data as ModulosSalvos[] | null;
  let error = rpc.error;
  if (error && funcaoAusente(error) && m.usa_eventos !== undefined) {
    // Mostra o que o banco disse: o aviso genérico escondia a causa real.
    console.error("definir_modulos falhou:", error);
    throw new Error(`Não consegui ligar Eventos. Resposta do banco: ${error.message} [${error.code ?? "sem código"}]`);
  }
  if (error && funcaoAusente(error)) {
    const direto = await sb.from("projects").update(m).eq("id", id).select("id, usa_crm, usa_conteudo");
    data = direto.data as ModulosSalvos[] | null;
    error = direto.error;
  }
  if (error) {
    if (colunaAusente(error) && !/pode|OVERSO/.test(error.message)) {
      throw new Error("Os módulos ainda não foram ativados no banco: rode o supabase/20_modulos_cliente.sql.");
    }
    if (/projects_algum_modulo/.test(error.message)) {
      throw new Error("O cliente precisa ter ao menos um módulo ligado.");
    }
    throw new Error(error.message);
  }
  const salvo = data?.[0] as ModulosSalvos | undefined;
  if (!salvo) throw new Error("O banco recusou: sua conta não pode alterar este cliente.");
  if (
    (m.usa_crm !== undefined && salvo.usa_crm !== m.usa_crm) ||
    (m.usa_conteudo !== undefined && salvo.usa_conteudo !== m.usa_conteudo) ||
    (m.usa_eventos !== undefined && salvo.usa_eventos !== m.usa_eventos)
  ) {
    throw new Error("O banco não gravou a mudança do módulo. Rode o supabase/21_definir_modulos.sql e tente de novo.");
  }
  return salvo;
}

/* ── Comentários dos conteúdos (22_comentarios_conteudo.sql) ─────── */

/** Tabela ainda não criada: a conversa mostra o que falta em vez de erro cru. */
export function faltaTabelaComentarios(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: string; message?: string };
  return code === "PGRST205" || code === "42P01" || /conteudo_comentarios/.test(message ?? "");
}

export const comentariosQuery = (conteudoId: string | undefined) =>
  queryOptions({
    queryKey: ["comentarios", conteudoId],
    enabled: Boolean(conteudoId),
    retry: false,
    // Sem tempo real: enquanto a conversa está aberta, busca novidades de
    // tempos em tempos pra aparecer o que outra pessoa comentou.
    refetchInterval: 30_000,
    queryFn: async (): Promise<Comentario[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("conteudo_comentarios")
        .select("*")
        .eq("conteudo_id", conteudoId!)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as Comentario[];
    },
  });

/** Só manda o texto: autor, cliente e horário o banco preenche pela sessão. */
export async function comentar(conteudoId: string, texto: string): Promise<Comentario> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("conteudo_comentarios")
    .insert({ conteudo_id: conteudoId, texto })
    .select("*")
    .single();
  if (error) throw error;
  return data as Comentario;
}

export async function apagarComentario(id: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("conteudo_comentarios")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Só quem escreveu pode apagar o comentário.");
}

/* ── Eventos (24_eventos.sql) ──────────────────────────────────────── */

/** Tabelas de eventos ainda não criadas: a tela diz o que falta em vez de erro cru. */
export function faltaTabelaEventos(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: string; message?: string };
  const msg = message ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (/eventos|evento_/.test(msg) && /schema cache|does not exist/.test(msg))
  );
}

const RECUSADO_EVENTO = "O banco recusou: sua conta não tem permissão sobre os eventos deste cliente.";

export const eventosQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["eventos", projectId],
    enabled: Boolean(projectId),
    retry: false,
    queryFn: async (): Promise<Evento[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("eventos")
        .select("*")
        .eq("project_id", projectId!)
        .order("data_inicio");
      if (error) throw error;
      return (data ?? []) as Evento[];
    },
  });

export const eventoQuery = (id: string) =>
  queryOptions({
    queryKey: ["evento", id],
    retry: false,
    queryFn: async (): Promise<Evento | null> => {
      const { data, error } = await getSupabaseBrowserClient().from("eventos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Evento | null) ?? null;
    },
  });

export async function criarEvento(projectId: string, e: EventoEntrada): Promise<Evento> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("eventos")
    .insert({ ...e, project_id: projectId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Evento;
}

export async function atualizarEvento(id: string, e: Partial<EventoEntrada>) {
  const { data, error } = await getSupabaseBrowserClient().from("eventos").update(e).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_EVENTO);
}

/** Exclui o evento e, depois, os arquivos dele no bucket (as linhas saem em cascata). */
export async function excluirEvento(id: string) {
  const sb = getSupabaseBrowserClient();
  const { data: arquivos } = await sb
    .from("evento_materiais")
    .select("endereco")
    .eq("evento_id", id)
    .eq("tipo", "arquivo");
  const { data, error } = await sb.from("eventos").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_EVENTO);
  const caminhos = (arquivos ?? []).map((a: { endereco: string }) => a.endereco);
  if (caminhos.length) await sb.storage.from(BUCKET_EVENTOS).remove(caminhos);
}

export type ResumoDemanda = { evento_id: string; status: StatusDemanda; prazo: string | null };

/** Demandas de todos os eventos do cliente — só o necessário pro progresso dos cards. */
export const resumoDemandasQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["demandas-resumo", projectId],
    enabled: Boolean(projectId),
    retry: false,
    queryFn: async (): Promise<ResumoDemanda[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("evento_demandas")
        .select("evento_id, status, prazo")
        .eq("project_id", projectId!);
      if (error) throw error;
      return (data ?? []) as ResumoDemanda[];
    },
  });

export const demandasQuery = (eventoId: string) =>
  queryOptions({
    queryKey: ["demandas", eventoId],
    retry: false,
    queryFn: async (): Promise<Demanda[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("evento_demandas")
        .select("*")
        .eq("evento_id", eventoId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Demanda[];
    },
  });

export async function criarDemanda(eventoId: string, d: DemandaEntrada & { ordem?: number }): Promise<Demanda> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("evento_demandas")
    .insert({ ...d, evento_id: eventoId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Demanda;
}

export async function atualizarDemanda(id: string, d: Partial<DemandaEntrada> & { ordem?: number }) {
  const { data, error } = await getSupabaseBrowserClient().from("evento_demandas").update(d).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_EVENTO);
}

export async function excluirDemanda(id: string) {
  const { data, error } = await getSupabaseBrowserClient().from("evento_demandas").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_EVENTO);
}

const BUCKET_EVENTOS = "eventos";
export const MAX_MATERIAL_MB = 50;

export const materiaisQuery = (eventoId: string) =>
  queryOptions({
    queryKey: ["materiais", eventoId],
    retry: false,
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("evento_materiais")
        .select("*")
        .eq("evento_id", eventoId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });

/**
 * Sobe o arquivo e registra o material. A 1ª pasta do caminho é o cliente —
 * é ela que a policy do bucket confere. Se o registro falhar, o arquivo que
 * acabou de subir sai do bucket pra não ficar solto.
 */
export async function enviarMaterial(
  projectId: string,
  eventoId: string,
  arquivo: File,
  categoria: CategoriaMaterial,
) {
  if (arquivo.size > MAX_MATERIAL_MB * 1024 * 1024) {
    throw new Error(`"${arquivo.name}" passa de ${MAX_MATERIAL_MB} MB.`);
  }
  const sb = getSupabaseBrowserClient();
  const ext = arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const caminho = `${projectId}/${eventoId}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from(BUCKET_EVENTOS).upload(caminho, arquivo, {
    contentType: arquivo.type || "application/octet-stream",
  });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message)) {
      throw new Error("O envio de arquivos de eventos ainda não foi ativado: rode o supabase/24_eventos.sql.");
    }
    throw up.error;
  }
  const { error } = await sb.from("evento_materiais").insert({
    evento_id: eventoId,
    categoria,
    tipo: "arquivo",
    nome: arquivo.name,
    endereco: caminho,
    tamanho: arquivo.size,
    mime: arquivo.type || null,
  });
  if (error) {
    await sb.storage.from(BUCKET_EVENTOS).remove([caminho]);
    throw error;
  }
}

export async function adicionarLinkMaterial(eventoId: string, categoria: CategoriaMaterial, nome: string, url: string) {
  const endereco = urlSegura(url);
  if (!endereco) throw new Error("Use um endereço que comece com http:// ou https://.");
  const { error } = await getSupabaseBrowserClient().from("evento_materiais").insert({
    evento_id: eventoId,
    categoria,
    tipo: "link",
    nome,
    endereco,
  });
  if (error) throw error;
}

export async function excluirMaterial(m: Material) {
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.from("evento_materiais").delete().eq("id", m.id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_EVENTO);
  if (m.tipo === "arquivo") await sb.storage.from(BUCKET_EVENTOS).remove([m.endereco]);
}

/** Link temporário (10 min) pra abrir ou baixar um arquivo do bucket privado. */
export async function urlDoMaterial(m: Material, baixar = false): Promise<string> {
  // O endereço é aberto numa janela do próprio portal: um "javascript:..."
  // gravado por outro membro rodaria com a sessão de quem clicou.
  if (m.tipo === "link") {
    const endereco = urlSegura(m.endereco);
    if (!endereco) throw new Error("Este link não é um endereço http ou https e não foi aberto.");
    return endereco;
  }
  const { data, error } = await getSupabaseBrowserClient()
    .storage.from(BUCKET_EVENTOS)
    .createSignedUrl(m.endereco, 600, baixar ? { download: m.nome } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

/** Posts do Calendário ligados à divulgação do evento. */
export const postsDoEventoQuery = (eventoId: string) =>
  queryOptions({
    queryKey: ["posts-evento", eventoId],
    retry: false,
    queryFn: async (): Promise<Conteudo[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("conteudos")
        .select("*")
        .eq("evento_id", eventoId)
        .order("data")
        .order("hora", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Conteudo[];
    },
  });

/* ── Tarefas avulsas do Calendário (26_tarefas.sql) ───────────────── */

export function faltaTabelaTarefas(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: string; message?: string };
  const msg = message ?? "";
  return code === "PGRST205" || code === "42P01" || (/tarefas/.test(msg) && /schema cache|does not exist/.test(msg));
}

export const tarefasQuery = (projectId: string | undefined, de: string, ate: string) =>
  queryOptions({
    queryKey: ["tarefas", projectId, de, ate],
    enabled: Boolean(projectId),
    retry: false,
    queryFn: async (): Promise<Tarefa[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("tarefas")
        .select("*")
        .eq("project_id", projectId!)
        .gte("data", de)
        .lte("data", ate)
        .order("data")
        .order("hora", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
  });

const RECUSADO_TAREFA = "O banco recusou: sua conta não tem permissão sobre as tarefas deste cliente.";

export async function criarTarefa(projectId: string, t: TarefaEntrada) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("tarefas")
    .insert({ ...t, project_id: projectId })
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_TAREFA);
}

export async function atualizarTarefa(id: string, t: Partial<TarefaEntrada>) {
  const { data, error } = await getSupabaseBrowserClient().from("tarefas").update(t).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_TAREFA);
}

export async function excluirTarefa(id: string) {
  const { data, error } = await getSupabaseBrowserClient().from("tarefas").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO_TAREFA);
}

/* ── Ficha de trabalho do cliente (28_perfil_cliente.sql) ───────────
   Toda consulta daqui é presa ao id do cliente — nenhuma lê a tabela
   inteira e filtra depois. Somado à RLS, é o que garante que a ficha de
   um cliente nunca mostre dado de outro. */

export const perfilClienteQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["perfil-cliente", projectId],
    enabled: Boolean(projectId),
    // Sem retry: num banco sem a migration 28 o erro é de coluna, e repetir
    // só atrasa o aviso na tela.
    retry: false,
    queryFn: async (): Promise<PerfilCliente> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("projects")
        .select(
          "id, nome, slug, criado_em, contato_nome, contato_email, contato_telefone, observacoes, links, atualizado_em, logo_url, logo_caminho",
        )
        .eq("id", projectId!)
        // single(): um id devolve uma linha ou nenhuma. Se vier diferente
        // disso, algo está muito errado e é melhor falhar que exibir.
        .single();
      if (error) throw error;
      // Segmento e "quem editou" são do 30_portal_novo.sql. Vão numa leitura
      // à parte para a ficha abrir igual num banco que ainda não os tem.
      const extras = await getSupabaseBrowserClient()
        .from("projects")
        .select("segmento, atualizado_por_nome")
        .eq("id", projectId!)
        .maybeSingle();
      return { ...(data as PerfilCliente), ...(extras.error ? {} : (extras.data ?? {})) };
    },
  });

/** Quem edita é admin do projeto ou super-admin — o banco confere de novo. */
export async function salvarPerfilCliente(projectId: string, dados: PerfilClienteEntrada) {
  const gravar = (d: PerfilClienteEntrada) => getSupabaseBrowserClient().from("projects").update(d).eq("id", projectId).select("id");
  let { data, error } = await gravar(dados);
  // Banco sem o 30: o segmento ainda não tem coluna. O resto da ficha é gravado.
  if (error && "segmento" in dados && colunaAusente(error)) {
    const { segmento: _semColuna, ...semSegmento } = dados;
    ({ data, error } = await gravar(semSegmento));
  }
  if (error) throw new Error(error.message);
  // Mesma lição do 17: a policy barra sem devolver erro. Zero linha aqui
  // significa "você não tem permissão", não "deu certo".
  if (!data?.length) {
    throw new Error("Só um admin deste cliente pode alterar a ficha.");
  }
}

/** Se o usuário pode editar a ficha deste cliente. */
export const podeGerenciarQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["pode-gerenciar", projectId],
    enabled: Boolean(projectId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabaseBrowserClient().rpc("pode_gerenciar", {
        p_project: projectId!,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });

/**
 * Grava o endereço do logo. Separado de `salvarPerfilCliente` porque o
 * logo vale assim que sobe — não espera o botão Salvar da ficha.
 */
export async function salvarLogoCliente(
  projectId: string,
  logo: { logo_url: string | null; logo_caminho: string | null },
) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("projects")
    .update(logo)
    .eq("id", projectId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Só um admin deste cliente pode trocar o logo.");
}

/* ── Resumo do período (Dashboard) ──────────────────────────────────
   As views `funil` e `leads_por_fonte` somam a vida inteira da campanha
   e não aceitam recorte de datas. Para "últimos 30 dias" a conta é feita
   aqui, com contagens (`head: true` não traz linha nenhuma, só o número).
   Toda contagem é presa ao id do cliente, e a RLS confere de novo. */

/** Hoje em Brasília, YYYY-MM-DD: o mesmo "dia" que as views do banco usam. */
export const hojeBrasilia = () => diaBrasilia(new Date());

/** Um dia de calendário de Brasília como instante, nas duas pontas. */
const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`;
const fimDoDia = (dia: string) => `${dia}T23:59:59.999-03:00`;

const STATUS_LEAD = ["novo", "contato_feito", "entrou_no_grupo", "convertido", "perdido"] as const;

export type ResumoPeriodo = {
  /** Quem abriu o formulário. */
  aberturas: number;
  /** Quem começou a preencher (enviou ou não). */
  iniciaram: number;
  /** Quem enviou. É a soma de `porStatus`. */
  enviaram: number;
  /** Só os leads enviados, por etapa do CRM. */
  porStatus: Record<(typeof STATUS_LEAD)[number], number>;
};

/**
 * Funil do formulário e leads por status entre dois dias (inclusive).
 * `de` ou `ate` nulos deixam a ponta aberta (campanha sem início ou sem fim).
 */
export const resumoPeriodoQuery = (projectId: string | undefined, de: string | null, ate: string | null) =>
  queryOptions({
    queryKey: ["resumo-periodo", projectId, de, ate],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ResumoPeriodo> => {
      const sb = getSupabaseBrowserClient();

      // Banco com o 30: uma chamada no lugar das sete contagens abaixo.
      const pronto = await sb.rpc("resumo_periodo", { p_project: projectId!, p_de: de, p_ate: ate });
      if (!pronto.error) {
        const r = (pronto.data ?? {}) as { aberturas?: number; iniciaram?: number; por_status?: Record<string, number> };
        const mapa = Object.fromEntries(STATUS_LEAD.map((s) => [s, Number(r.por_status?.[s] ?? 0)])) as ResumoPeriodo["porStatus"];
        return {
          aberturas: Number(r.aberturas ?? 0),
          iniciaram: Number(r.iniciaram ?? 0),
          enviaram: Object.values(mapa).reduce((t, n) => t + n, 0),
          porStatus: mapa,
        };
      }
      if (!funcaoAusente(pronto.error)) throw pronto.error;

      const noPeriodo = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T) => {
        let r = q;
        if (de) r = r.gte("criado_em", inicioDoDia(de));
        if (ate) r = r.lte("criado_em", fimDoDia(ate));
        return r;
      };
      const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };

      const [aberturas, iniciaram, ...porStatus] = await Promise.all([
        // Uma abertura por sessão: o índice único do 01_schema garante.
        contar(
          noPeriodo(
            sb.from("lead_events").select("id", { count: "exact", head: true }).eq("project_id", projectId!).eq("tipo", "form_open"),
          ),
        ),
        contar(noPeriodo(sb.from("leads").select("id", { count: "exact", head: true }).eq("project_id", projectId!))),
        ...STATUS_LEAD.map((s) =>
          contar(
            noPeriodo(
              sb
                .from("leads")
                .select("id", { count: "exact", head: true })
                .eq("project_id", projectId!)
                .eq("completo", true)
                .eq("status", s),
            ),
          ),
        ),
      ]);

      const mapa = Object.fromEntries(STATUS_LEAD.map((s, i) => [s, porStatus[i] ?? 0])) as ResumoPeriodo["porStatus"];
      return {
        aberturas: aberturas ?? 0,
        iniciaram: iniciaram ?? 0,
        enviaram: porStatus.reduce((t, n) => t + n, 0),
        porStatus: mapa,
      };
    },
  });

/** Leads enviados que ainda estão em "novo": o número ao lado de Leads no menu. */
export const leadsNovosQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["leads-novos", projectId],
    enabled: Boolean(projectId),
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await getSupabaseBrowserClient()
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId!)
        .eq("completo", true)
        .eq("status", "novo");
      if (error) throw error;
      return count ?? 0;
    },
  });

/* ── Tela de Leads ──────────────────────────────────────────────────── */

export type FiltroContagem = {
  projectId: string | undefined;
  campaignId: string | null;
  de: string | null;
  ate: string | null;
  /** "" = todos, "parcial" = quem ainda não enviou. */
  tipo: string;
};

/**
 * Quantos leads há em cada status, com o mesmo recorte da tabela: é o
 * número ao lado de cada aba. Conta parciais também, porque a tabela os
 * lista (o funil do CRM é outra conta, que olha quem enviou).
 */
export const contagemPorStatusQuery = (f: FiltroContagem) =>
  queryOptions({
    queryKey: ["leads-por-status", f],
    enabled: Boolean(f.projectId),
    queryFn: async (): Promise<Record<(typeof STATUS_LEAD)[number], number>> => {
      const sb = getSupabaseBrowserClient();
      const contagens = await Promise.all(
        STATUS_LEAD.map(async (s) => {
          let c = sb
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("project_id", f.projectId!)
            .eq("status", s);
          if (f.campaignId) c = c.eq("campaign_id", f.campaignId);
          if (f.tipo === "parcial") c = c.eq("completo", false);
          if (f.de) c = c.gte("criado_em", inicioDoDia(f.de));
          if (f.ate) c = c.lte("criado_em", fimDoDia(f.ate));
          const { count, error } = await c;
          if (error) throw error;
          return count ?? 0;
        }),
      );
      return Object.fromEntries(STATUS_LEAD.map((s, i) => [s, contagens[i] ?? 0])) as Record<
        (typeof STATUS_LEAD)[number],
        number
      >;
    },
  });

/**
 * Quando a sessão abriu o formulário. "Começou" e "enviou" já estão no
 * próprio lead (criado_em e completado_em); a abertura mora nos eventos.
 */
export const aberturaDoLeadQuery = (projectId: string | undefined, sessionId: string | undefined) =>
  queryOptions({
    queryKey: ["lead-abertura", projectId, sessionId],
    enabled: Boolean(projectId && sessionId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("lead_events")
        .select("criado_em")
        .eq("project_id", projectId!)
        .eq("session_id", sessionId!)
        .eq("tipo", "form_open")
        .order("criado_em")
        .limit(1);
      if (error) throw error;
      return (data?.[0] as { criado_em: string } | undefined)?.criado_em ?? null;
    },
  });

/** Anotação interna de um lead (lead_notes, 01_schema.sql). */
export type NotaLead = {
  id: string;
  lead_id: string;
  user_id: string | null;
  /** Quem escreveu (30_portal_novo.sql). Ausente em banco antigo e em anotação anterior a ele. */
  autor_nome?: string | null;
  texto: string;
  criado_em: string;
};

export const notasDoLeadQuery = (leadId: string | undefined) =>
  queryOptions({
    queryKey: ["lead-notas", leadId],
    enabled: Boolean(leadId),
    queryFn: async (): Promise<NotaLead[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("lead_notes")
        .select("*")
        .eq("lead_id", leadId!)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as NotaLead[];
    },
  });

export async function anotarLead(leadId: string, userId: string | undefined, texto: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("lead_notes")
    .insert({ lead_id: leadId, user_id: userId ?? null, texto })
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(RECUSADO);
}

/* ── Calendário ─────────────────────────────────────────────────────── */

/**
 * O comentário mais recente de cada post: é o recado que aparece no card
 * "Esperando aprovação". Uma consulta só para todos os posts da lista.
 */
export const ultimosComentariosQuery = (projectId: string | undefined, conteudoIds: string[]) =>
  queryOptions({
    queryKey: ["ultimos-comentarios", projectId, conteudoIds],
    enabled: Boolean(projectId) && conteudoIds.length > 0,
    retry: false,
    queryFn: async (): Promise<Record<string, Comentario>> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("conteudo_comentarios")
        .select("*")
        .eq("project_id", projectId!)
        .in("conteudo_id", conteudoIds)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const porPost: Record<string, Comentario> = {};
      // Vêm do mais novo para o mais antigo: o primeiro de cada post é o que vale.
      for (const c of (data ?? []) as Comentario[]) porPost[c.conteudo_id] ??= c;
      return porPost;
    },
  });

/* ── Escolher cliente (super-admin) ─────────────────────────────────── */

type LinhaDoResumo = {
  project_id: string;
  criado_em: string;
  leads_30_dias: number;
  leads_novos: number;
  posts_para_aprovar: number;
  posts_hoje_sem_arte: number;
};

/**
 * Os números de todos os clientes numa chamada (função resumo_dos_clientes,
 * 30_portal_novo.sql). Devolve null quando o banco ainda não tem a função
 * ou a chamada falha: quem chama recua para as contagens uma a uma.
 */
async function resumoPronto(): Promise<Map<string, LinhaDoResumo> | null> {
  const { data, error } = await getSupabaseBrowserClient().rpc("resumo_dos_clientes");
  if (error) return null;
  return new Map(((data ?? []) as LinhaDoResumo[]).map((l) => [l.project_id, l]));
}

/** O que está pedindo atenção num cliente: os alertas do card dele. */
export type PendenciasDoCliente = { leadsNovos: number; postsParaAprovar: number; postsDeHojeSemArte: number };

/**
 * Pendências de vários clientes de uma vez, para a tela de escolher cliente.
 * São três contagens por cliente (nenhuma linha trafega, só os números), e
 * cada uma presa ao id do cliente. Módulo desligado nem é consultado.
 */
export const pendenciasDosClientesQuery = (projetos: Project[]) =>
  queryOptions({
    queryKey: ["pendencias-dos-clientes", projetos.map((p) => p.id)],
    enabled: projetos.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, PendenciasDoCliente>> => {
      const sb = getSupabaseBrowserClient();
      const prontos = await resumoPronto();
      if (prontos) {
        return Object.fromEntries(
          projetos.map((p) => {
            const m = modulosDe(p);
            const r = prontos.get(p.id);
            return [
              p.id,
              {
                leadsNovos: m.crm ? Number(r?.leads_novos ?? 0) : 0,
                postsParaAprovar: m.conteudo ? Number(r?.posts_para_aprovar ?? 0) : 0,
                postsDeHojeSemArte: m.conteudo ? Number(r?.posts_hoje_sem_arte ?? 0) : 0,
              },
            ];
          }),
        );
      }
      const hoje = hojeBrasilia();
      // Uma contagem que falha (tabela ausente num banco antigo) vale zero:
      // o card do cliente aparece sem aquele alerta, em vez de a tela quebrar.
      const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
        const { count, error } = await q;
        return error ? 0 : (count ?? 0);
      };

      const linhas = await Promise.all(
        projetos.map(async (p) => {
          const m = modulosDe(p);
          const [leadsNovos, postsParaAprovar, postsDeHojeSemArte] = await Promise.all([
            m.crm
              ? contar(
                  sb.from("leads").select("id", { count: "exact", head: true }).eq("project_id", p.id).eq("completo", true).eq("status", "novo"),
                )
              : 0,
            m.conteudo
              ? contar(sb.from("conteudos").select("id", { count: "exact", head: true }).eq("project_id", p.id).eq("status", "aprovacao"))
              : 0,
            m.conteudo
              ? contar(
                  sb
                    .from("conteudos")
                    .select("id", { count: "exact", head: true })
                    .eq("project_id", p.id)
                    .eq("data", hoje)
                    .eq("status", "agendado")
                    .eq("midias", "{}"),
                )
              : 0,
          ]);
          return [p.id, { leadsNovos, postsParaAprovar, postsDeHojeSemArte }] as const;
        }),
      );
      return Object.fromEntries(linhas);
    },
  });

/* ── Lista de clientes (super-admin) ────────────────────────────────── */

export type ResumoDoCliente = {
  /** Leads que chegaram nos últimos 30 dias (enviados e parciais). */
  leads30Dias: number;
  /** Quando o cliente foi cadastrado no portal (ISO). */
  criadoEm: string | null;
};

/**
 * O rodapé de cada card da lista de clientes: leads em 30 dias e desde
 * quando o cliente existe. Uma consulta traz as datas de todos; os leads são
 * uma contagem por cliente com o módulo CRM.
 */
export const resumoDosClientesQuery = (projetos: Project[]) =>
  queryOptions({
    queryKey: ["resumo-dos-clientes", projetos.map((p) => p.id)],
    enabled: projetos.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ResumoDoCliente>> => {
      const sb = getSupabaseBrowserClient();
      const prontos = await resumoPronto();
      if (prontos) {
        return Object.fromEntries(
          projetos.map((p) => {
            const r = prontos.get(p.id);
            return [p.id, { leads30Dias: modulosDe(p).crm ? Number(r?.leads_30_dias ?? 0) : 0, criadoEm: r?.criado_em ?? null }];
          }),
        );
      }
      const desde = new Date(Date.now() - 30 * 864e5).toISOString();
      const ids = projetos.map((p) => p.id);

      const [datas, ...contagens] = await Promise.all([
        sb.from("projects").select("id, criado_em").in("id", ids),
        ...projetos.map((p) =>
          modulosDe(p).crm
            ? sb.from("leads").select("id", { count: "exact", head: true }).eq("project_id", p.id).gte("criado_em", desde)
            : Promise.resolve({ count: 0, error: null }),
        ),
      ]);

      const criado = new Map(((datas.data ?? []) as { id: string; criado_em: string }[]).map((d) => [d.id, d.criado_em]));
      return Object.fromEntries(
        projetos.map((p, i) => [
          p.id,
          // Contagem que falhou vale zero: o card aparece sem o número em vez de a lista quebrar.
          { leads30Dias: contagens[i]?.error ? 0 : (contagens[i]?.count ?? 0), criadoEm: criado.get(p.id) ?? null },
        ]),
      );
    },
  });

/* ── Ficha do cliente ───────────────────────────────────────────────── */

export type LandingPage = {
  /** Domínio + caminho, sem UTMs. */
  endereco: string;
  /** Leads (enviados e parciais) nos últimos 30 dias. */
  leads: number;
  /** Quando chegou o lead mais recente (ISO). */
  ultimoLead: string;
};

/**
 * As landing pages que mandaram lead para o cliente nos últimos 30 dias,
 * da mais movimentada para a menos. O banco não tem cadastro de páginas:
 * elas saem do endereço de origem de cada lead.
 */
export const landingPagesQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["landing-pages", projectId],
    enabled: Boolean(projectId),
    staleTime: 60_000,
    queryFn: async (): Promise<LandingPage[]> => {
      // Banco com o 30: a conta é feita lá, sem trazer os leads para cá.
      const pronto = await getSupabaseBrowserClient().rpc("landing_pages_do_cliente", { p_project: projectId!, p_dias: 30 });
      if (!pronto.error) {
        return ((pronto.data ?? []) as { endereco: string; leads: number; ultimo_lead: string }[]).map((p) => ({
          endereco: p.endereco,
          leads: Number(p.leads),
          ultimoLead: p.ultimo_lead,
        }));
      }
      if (!funcaoAusente(pronto.error)) throw pronto.error;

      const { data, error } = await getSupabaseBrowserClient()
        .from("leads")
        .select("origem, criado_em")
        .eq("project_id", projectId!)
        .not("origem", "is", null)
        .gte("criado_em", new Date(Date.now() - 30 * 864e5).toISOString())
        .order("criado_em", { ascending: false })
        .limit(3000);
      if (error) throw error;

      const paginas = new Map<string, LandingPage>();
      for (const l of (data ?? []) as { origem: string | null; criado_em: string }[]) {
        if (!l.origem) continue;
        let endereco = l.origem;
        try {
          const u = new URL(l.origem);
          endereco = u.host.replace(/^www[.]/, "") + u.pathname.replace(/[/]$/, "");
        } catch {
          // origem que não é URL fica como veio
        }
        const atual = paginas.get(endereco);
        // Vêm do mais novo para o mais antigo: o primeiro de cada página é o último lead.
        if (atual) atual.leads++;
        else paginas.set(endereco, { endereco, leads: 1, ultimoLead: l.criado_em });
      }
      return [...paginas.values()].sort((a, b) => b.leads - a.leads);
    },
  });

/** Troca o nome do cliente. Só a equipe OVERSO consegue: a RLS confere. */
export async function renomearCliente(projectId: string, nome: string) {
  const { data, error } = await getSupabaseBrowserClient().from("projects").update({ nome }).eq("id", projectId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("O banco recusou: sua conta não pode renomear este cliente.");
}

/** Pessoa com acesso direto a um cliente (função equipe_membros, 12_equipe.sql). */
export type MembroDoCliente = { user_id: string; email: string; papel: "admin" | "membro"; nome?: string | null };

/** Só responde para quem gerencia o cliente; para os demais o banco recusa. */
export const membrosDoClienteQuery = (projectId: string | undefined, podeGerenciar: boolean) =>
  queryOptions({
    queryKey: ["equipe", projectId],
    enabled: Boolean(projectId) && podeGerenciar,
    queryFn: async (): Promise<MembroDoCliente[]> => {
      const { data, error } = await getSupabaseBrowserClient().rpc("equipe_membros", { p_project: projectId! });
      if (error) throw error;
      return (data ?? []) as MembroDoCliente[];
    },
  });

/* ── Remover cliente ────────────────────────────────────────────────── */

/** Os buckets em que a primeira pasta do caminho é o id do cliente. */
const BUCKETS_DO_CLIENTE = [BUCKET_MIDIAS, BUCKET_EVENTOS, "logos-cliente"];

/**
 * Todos os arquivos debaixo de uma pasta, descendo nas subpastas (os
 * materiais de evento ficam em <cliente>/<evento>/<arquivo>). A listagem do
 * Storage vem por página e não desce sozinha.
 */
async function listarArquivos(bucket: string, pasta: string): Promise<string[]> {
  const storage = getSupabaseBrowserClient().storage.from(bucket);
  const achados: string[] = [];
  const POR_VEZ = 1000;
  for (let de = 0; ; de += POR_VEZ) {
    const { data, error } = await storage.list(pasta, { limit: POR_VEZ, offset: de });
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      const caminho = `${pasta}/${item.name}`;
      // Pasta vem sem id: é o jeito de distinguir de arquivo na resposta.
      if (item.id == null) achados.push(...(await listarArquivos(bucket, caminho)));
      else achados.push(caminho);
    }
    if ((data ?? []).length < POR_VEZ) return achados;
  }
}

/**
 * Remove o cliente e tudo o que é dele. O banco apaga os dados em cascata,
 * mas não alcança o Storage: artes dos posts, materiais de evento e logo
 * ficariam guardados para sempre, sem dono. Por isso os arquivos saem
 * primeiro. Se a remoção deles falhar, o cliente continua existindo e dá
 * para tentar de novo; o contrário deixaria arquivo órfão sem como achar.
 *
 * Devolve quantos arquivos foram apagados.
 */
export async function removerCliente(projectId: string): Promise<number> {
  const sb = getSupabaseBrowserClient();

  // Confere a permissão ANTES de tocar em arquivo: quem não pode remover o
  // cliente não pode sair apagando as artes dele no caminho.
  const { data: superAdmin, error: erroPermissao } = await sb.rpc("is_super_admin");
  if (erroPermissao) throw new Error(erroPermissao.message);
  if (!superAdmin) throw new Error("Apenas a equipe OVERSO remove um cliente.");

  let apagados = 0;
  for (const bucket of BUCKETS_DO_CLIENTE) {
    const caminhos = await listarArquivos(bucket, projectId);
    // Em lotes: uma chamada só com milhares de caminhos estoura o limite do pedido.
    for (let i = 0; i < caminhos.length; i += 100) {
      const lote = caminhos.slice(i, i + 100);
      const { error } = await sb.storage.from(bucket).remove(lote);
      if (error) throw new Error(`Não consegui apagar os arquivos do cliente (${error.message}). Nada foi removido do banco: tente de novo.`);
      apagados += lote.length;
    }
  }

  const { error } = await sb.rpc("remover_projeto", { p_project: projectId });
  if (error) throw new Error(error.message);
  return apagados;
}
