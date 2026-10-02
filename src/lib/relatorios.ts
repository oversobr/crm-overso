import { queryOptions } from "@tanstack/react-query";

import { somarDias } from "./datas";
import { getSupabaseBrowserClient } from "./supabase/client";
import type { Conteudo, Formato } from "./types";
import { PARADOS } from "./types";

/* ── Relatórios ─────────────────────────────────────────────────────
   Uso interno: período livre, comparação com a janela anterior e quebra
   por cliente. O Dashboard responde "como estamos agora"; aqui a pergunta
   é "o que aconteceu entre X e Y, e foi melhor ou pior que antes".

   Por que não reaproveitar as views do 04_views.sql: `leads_por_fonte` e
   `funil` agregam o tempo TODO — não têm dimensão de data na origem, então
   não dá pra recortar período a partir delas. `leads_por_dia` até teria,
   mas aí seriam três consultas onde uma resolve. */

export type Periodo = { de: string; ate: string };

/* Fronteiras do dia no fuso de Brasília, que é o que o banco usa
   (14_fuso_brasilia.sql). Sem o offset, um lead das 22h de ontem entraria
   no relatório de hoje. */
const abre = (dia: string) => `${dia}T00:00:00-03:00`;
const fecha = (dia: string) => `${dia}T23:59:59.999-03:00`;

/** Dias que o período cobre, contando as duas pontas. */
export function diasDoPeriodo({ de, ate }: Periodo) {
  const ms = new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime();
  return Math.round(ms / 864e5) + 1;
}

/** Janela de mesmo tamanho imediatamente anterior — a base da comparação. */
export function periodoAnterior(p: Periodo): Periodo {
  const n = diasDoPeriodo(p);
  return { de: somarDias(p.de, -n), ate: somarDias(p.de, -1) };
}

/** Variação percentual de `antes` para `agora`. null quando não havia base. */
export function variacao(agora: number, antes: number): number | null {
  if (antes === 0) return agora === 0 ? 0 : null;
  return Math.round(((agora - antes) / antes) * 1000) / 10;
}

export type ResumoCrm = {
  leads: number;
  completos: number;
  parciais: number;
  /** Aberturas de formulário no período (topo do funil). */
  aberturas: number;
  /** completos ÷ aberturas, em %. null quando ninguém abriu o formulário. */
  conversao: number | null;
  porFonte: { fonte: string; total: number }[];
  porProjeto: Record<string, { leads: number; completos: number }>;
};

type LinhaLead = { project_id: string; utms: Record<string, string> | null; completo: boolean };

async function buscarCrm(projectId: string | null, p: Periodo): Promise<ResumoCrm> {
  const sb = getSupabaseBrowserClient();

  // Três colunas, não `*`: o relatório não precisa das respostas do
  // formulário, que são o grosso do peso de cada lead.
  let q = sb
    .from("leads")
    .select("project_id, utms, completo")
    .gte("criado_em", abre(p.de))
    .lte("criado_em", fecha(p.ate));
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;
  const linhas = (data ?? []) as LinhaLead[];

  // head: true devolve só a contagem no cabeçalho — nenhuma linha trafega.
  // São milhares de eventos num mês; trazer todos pra contar seria absurdo.
  let qa = sb
    .from("lead_events")
    .select("*", { count: "exact", head: true })
    .eq("tipo", "form_open")
    .gte("criado_em", abre(p.de))
    .lte("criado_em", fecha(p.ate));
  if (projectId) qa = qa.eq("project_id", projectId);
  const { count, error: erroEventos } = await qa;
  if (erroEventos) throw erroEventos;

  const fontes = new Map<string, number>();
  const porProjeto: ResumoCrm["porProjeto"] = {};
  let completos = 0;

  for (const l of linhas) {
    if (l.completo) completos++;
    const f = l.utms?.utm_source?.trim() || "direto";
    fontes.set(f, (fontes.get(f) ?? 0) + 1);
    const acc = (porProjeto[l.project_id] ??= { leads: 0, completos: 0 });
    acc.leads++;
    if (l.completo) acc.completos++;
  }

  const aberturas = count ?? 0;
  return {
    leads: linhas.length,
    completos,
    parciais: linhas.length - completos,
    aberturas,
    conversao: aberturas ? Math.round((completos / aberturas) * 1000) / 10 : null,
    porFonte: [...fontes].map(([fonte, total]) => ({ fonte, total })).sort((a, b) => b.total - a.total),
    porProjeto,
  };
}

export type ResumoConteudo = {
  total: number;
  publicados: number;
  emAprovacao: number;
  /** Passaram do dia sem agendar nem publicar — mesma regra do Dashboard. */
  atrasados: number;
  porFormato: { formato: Formato; total: number }[];
  porProjeto: Record<string, { total: number; publicados: number }>;
};

async function buscarConteudo(projectId: string | null, p: Periodo): Promise<ResumoConteudo> {
  const sb = getSupabaseBrowserClient();
  // `data` já é dia de calendário (YYYY-MM-DD), sem fuso envolvido.
  let q = sb
    .from("conteudos")
    .select("project_id, data, status, formato")
    .gte("data", p.de)
    .lte("data", p.ate);
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw error;

  const linhas = (data ?? []) as Pick<Conteudo, "project_id" | "data" | "status" | "formato">[];
  const hoje = new Date().toISOString().slice(0, 10);
  const formatos = new Map<Formato, number>();
  const porProjeto: ResumoConteudo["porProjeto"] = {};
  let publicados = 0;
  let emAprovacao = 0;
  let atrasados = 0;

  for (const c of linhas) {
    if (c.status === "publicado") publicados++;
    if (c.status === "aprovacao") emAprovacao++;
    if (c.data < hoje && PARADOS.includes(c.status)) atrasados++;
    formatos.set(c.formato, (formatos.get(c.formato) ?? 0) + 1);
    const acc = (porProjeto[c.project_id] ??= { total: 0, publicados: 0 });
    acc.total++;
    if (c.status === "publicado") acc.publicados++;
  }

  return {
    total: linhas.length,
    publicados,
    emAprovacao,
    atrasados,
    porFormato: [...formatos].map(([formato, total]) => ({ formato, total })).sort((a, b) => b.total - a.total),
    porProjeto,
  };
}

export type Relatorio = { crm: ResumoCrm; conteudo: ResumoConteudo };

/**
 * `projectId` nulo = todos os clientes que a sessão enxerga. A RLS resolve
 * o alcance: super-admin pega tudo, membro pega só os projetos dele.
 */
export const relatorioQuery = (projectId: string | null, p: Periodo) =>
  queryOptions({
    queryKey: ["relatorio", projectId, p.de, p.ate],
    enabled: Boolean(p.de && p.ate && p.de <= p.ate),
    // A tabela `conteudos` pode não existir em banco que não rodou o 18.
    retry: false,
    queryFn: async (): Promise<Relatorio> => {
      const [crm, conteudo] = await Promise.all([
        buscarCrm(projectId, p),
        buscarConteudo(projectId, p).catch(() => null),
      ]);
      return {
        crm,
        conteudo:
          conteudo ?? { total: 0, publicados: 0, emAprovacao: 0, atrasados: 0, porFormato: [], porProjeto: {} },
      };
    },
  });
