import { queryOptions } from "@tanstack/react-query";

import { getSupabaseBrowserClient } from "./supabase/client";
import type { Campaign, Funil, Lead, Project } from "./types";

export const projectsQuery = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("projects")
        .select("id, nome, slug, ingest_key")
        .order("nome");
      if (error) throw error;
      return data ?? [];
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

export async function atualizarStatus(leadId: string, status: string) {
  const { error } = await getSupabaseBrowserClient()
    .from("leads")
    .update({ status })
    .eq("id", leadId);
  if (error) throw error;
}

/**
 * Exclui um lead. Só admin do projeto consegue (a policy leads_delete no
 * banco garante isso — o botão no painel é só a interface).
 */
export async function excluirLead(leadId: string) {
  const { error } = await getSupabaseBrowserClient().from("leads").delete().eq("id", leadId);
  if (error) throw error;
}
