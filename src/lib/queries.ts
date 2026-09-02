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

export const serieQuery = (projectId: string | undefined, campaignId: string | null) =>
  queryOptions({
    queryKey: ["serie", projectId, campaignId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<{ dia: string; total: number }[]> => {
      const desde = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
      let q = getSupabaseBrowserClient()
        .from("leads_por_dia")
        .select("dia, total")
        .eq("project_id", projectId!)
        .gte("dia", desde);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q.order("dia");
      if (error) throw error;

      // Preenche os dias sem lead, senão o gráfico "pula" datas.
      const linhas = (data ?? []) as { dia: string; total: number }[];
      const mapa = new Map(linhas.map((r) => [r.dia, Number(r.total)]));
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10);
        return { dia: d, total: mapa.get(d) ?? 0 };
      });
    },
  });

export async function atualizarStatus(leadId: string, status: string) {
  const { error } = await getSupabaseBrowserClient()
    .from("leads")
    .update({ status })
    .eq("id", leadId);
  if (error) throw error;
}
