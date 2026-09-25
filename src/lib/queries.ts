import { queryOptions } from "@tanstack/react-query";

import { getSupabaseBrowserClient } from "./supabase/client";
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

export const campaignsQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["campaigns", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("campaigns")
        .select("id, project_id, nome, inicio, fim, meta_leads")
        .eq("project_id", projectId!)
        .order("inicio", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
};

export const POR_PAGINA = 15;

export const leadsQuery = (f: FiltroLeads) =>
  queryOptions({
    queryKey: ["leads", f],
    enabled: Boolean(f.projectId),
    queryFn: async (): Promise<{ linhas: Lead[]; total: number }> => {
      let q = getSupabaseBrowserClient()
        .from("leads")
        .select("*", { count: "exact" })
        .eq("project_id", f.projectId!);

      if (f.campaignId) q = q.eq("campaign_id", f.campaignId);
      if (f.status) q = q.eq("status", f.status);
      if (f.tipo === "completo") q = q.eq("completo", true);
      if (f.tipo === "parcial") q = q.eq("completo", false);

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
        q = q.or(`nome.ilike."%${t}%",email.ilike."%${t}%",whatsapp.ilike."%${t}%"`);
      }

      const de = f.pagina * POR_PAGINA;
      const { data, error, count } = await q
        .order("criado_em", { ascending: false })
        .range(de, de + POR_PAGINA - 1);

      if (error) throw error;
      return { linhas: (data ?? []) as Lead[], total: count ?? 0 };
    },
  });

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

/** CRUD de campanha — a RLS de membro já autoriza escrita direta, sem RPC. */
export async function criarCampanha(projectId: string, dados: CampanhaInput) {
  const { error } = await getSupabaseBrowserClient()
    .from("campaigns")
    .insert({ project_id: projectId, ...dados });
  if (error) throw new Error(error.message);
}

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
        .select("id, conteudo_id, autor_id, autor_nome, autor_email, texto, criado_em")
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
    .select("id, conteudo_id, autor_id, autor_nome, autor_email, texto, criado_em")
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
  const { error } = await getSupabaseBrowserClient().from("evento_materiais").insert({
    evento_id: eventoId,
    categoria,
    tipo: "link",
    nome,
    endereco: url,
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
  if (m.tipo === "link") return m.endereco;
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
