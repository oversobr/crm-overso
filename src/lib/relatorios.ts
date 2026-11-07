import { queryOptions } from "@tanstack/react-query";

import { getSupabaseBrowserClient } from "./supabase/client";

/**
 * Relatório mensal de resultados (38_relatorios.sql).
 *
 * O design mora em public/relatorio e é igual para todos os clientes. Aqui só
 * se organizam os dados: o `dados` de cada mês tem exatamente o formato que a
 * página lê, e o que dá para calcular (CTR, CPC, custo por conversão...) é
 * calculado ao salvar, para a equipe digitar só o que vem da plataforma.
 */

export type Relatorio = {
  id: string;
  project_id: string;
  slug: string;
  nome_exibicao: string | null;
  subtitulo: string;
  fontes: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DadosMes = Record<string, any>;

export type MesRelatorio = {
  id: string;
  relatorio_id: string;
  referencia: string;
  dados: DadosMes;
  publicado: boolean;
  atualizado_em: string;
};

export const relatorioQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["relatorio", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Relatorio | null> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("relatorios")
        .select("id, project_id, slug, nome_exibicao, subtitulo, fontes")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as Relatorio | null;
    },
  });

export const mesesRelatorioQuery = (relatorioId: string | undefined) =>
  queryOptions({
    queryKey: ["relatorio-meses", relatorioId],
    enabled: Boolean(relatorioId),
    queryFn: async (): Promise<MesRelatorio[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("relatorio_meses")
        .select("id, relatorio_id, referencia, dados, publicado, atualizado_em")
        .eq("relatorio_id", relatorioId)
        .order("referencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MesRelatorio[];
    },
  });

export const logoClienteQuery = (projectId: string | undefined) =>
  queryOptions({
    queryKey: ["relatorio-logo", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await getSupabaseBrowserClient().from("projects").select("logo_url").eq("id", projectId).maybeSingle();
      if (error) throw error;
      return (data?.logo_url as string | null) ?? null;
    },
  });

/** "Clínica Bem Viver" vira clinica-bem-viver. */
export function paraEndereco(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

function erroDeEndereco(error: { code?: string }) {
  if (error.code === "23505") return new Error("Este endereço já é usado por outro cliente.");
  if (error.code === "23514") return new Error("Use só letras e números, com hífen entre as palavras.");
  return error;
}

export async function criarRelatorio(projectId: string, nomeCliente: string) {
  const { error } = await getSupabaseBrowserClient().from("relatorios").insert({ project_id: projectId, slug: paraEndereco(nomeCliente) });
  if (error) throw erroDeEndereco(error);
}

export async function salvarMes(relatorioId: string, dados: DadosMes, publicado: boolean, userId?: string) {
  const { error } = await getSupabaseBrowserClient()
    .from("relatorio_meses")
    .upsert(
      {
        relatorio_id: relatorioId,
        referencia: dados.id,
        dados,
        publicado,
        atualizado_por: userId ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "relatorio_id,referencia" },
    );
  if (error) throw error;
}

export async function definirPublicado(mesId: string, publicado: boolean) {
  const { error } = await getSupabaseBrowserClient()
    .from("relatorio_meses")
    .update({ publicado, atualizado_em: new Date().toISOString() })
    .eq("id", mesId);
  if (error) throw error;
}

export async function apagarMes(mesId: string) {
  const { error } = await getSupabaseBrowserClient().from("relatorio_meses").delete().eq("id", mesId);
  if (error) throw error;
}

/** Troca o endereço: o anterior para de funcionar na hora. */
export async function alterarEndereco(relatorioId: string, slug: string) {
  const { error } = await getSupabaseBrowserClient()
    .from("relatorios")
    .update({ slug, atualizado_em: new Date().toISOString() })
    .eq("id", relatorioId);
  if (error) throw erroDeEndereco(error);
}

// ── Campos do formulário ─────────────────────────────────────────────────

export type TipoCampo = "texto" | "inteiro" | "dinheiro" | "decimal" | "porcento";
export type Campo = { k: string; r: string; t: TipoCampo; calc?: boolean; dica?: string; larg?: string };
export type Linha = Record<string, string>;

export const CAMPOS_GOOGLE: Campo[] = [
  { k: "custo", r: "Custo total", t: "dinheiro" },
  { k: "impressoes", r: "Impressões", t: "inteiro" },
  { k: "cliques", r: "Cliques", t: "inteiro" },
  { k: "conversoes", r: "Conversões", t: "decimal" },
  { k: "ctr", r: "CTR (%)", t: "porcento", calc: true },
  { k: "cpc", r: "CPC médio", t: "dinheiro", calc: true },
  { k: "custoConversao", r: "Custo / conversão", t: "dinheiro", calc: true },
  { k: "taxaConversao", r: "Taxa de conversão (%)", t: "porcento", calc: true },
];

export const COLS_GOOGLE_CAMPANHAS: Campo[] = [
  { k: "status", r: "Status", t: "texto", larg: "w-24" },
  { k: "nome", r: "Campanha", t: "texto", larg: "min-w-64" },
  { k: "rotulo", r: "Nome curto", t: "texto", larg: "min-w-44" },
  { k: "orcamento", r: "Orçamento", t: "texto", larg: "w-28" },
  { k: "impressoes", r: "Impr.", t: "inteiro", larg: "w-24" },
  { k: "cliques", r: "Cliques", t: "inteiro", larg: "w-20" },
  { k: "custo", r: "Custo", t: "dinheiro", larg: "w-24" },
  { k: "conversoes", r: "Conv.", t: "decimal", larg: "w-20" },
];

export const COLS_CONCORRENTES: Campo[] = [
  { k: "dominio", r: "Domínio", t: "texto", larg: "min-w-56" },
  { k: "parcela", r: "Parcela impr.", t: "texto", larg: "w-28" },
  { k: "sobreposicao", r: "Sobreposição", t: "texto", larg: "w-28" },
  { k: "posicaoSuperior", r: "Posição superior", t: "texto", larg: "w-28" },
  { k: "topoPagina", r: "Parte superior", t: "texto", larg: "w-28" },
  { k: "primeiraPosicao", r: "1ª posição", t: "texto", larg: "w-28" },
  { k: "vitorias", r: "Vitórias", t: "texto", larg: "w-28" },
];

export const COLS_PARCELA: Campo[] = [
  { k: "posicao", r: "Posição", t: "inteiro", larg: "w-20" },
  { k: "dominio", r: "Domínio", t: "texto", larg: "min-w-64" },
  { k: "parcela", r: "Parcela", t: "texto", larg: "w-28" },
];

export const CAMPOS_META: Campo[] = [
  { k: "gasto", r: "Valor gasto", t: "dinheiro" },
  { k: "alcance", r: "Alcance", t: "inteiro" },
  { k: "impressoes", r: "Impressões", t: "inteiro" },
  { k: "cliques", r: "Cliques (todos)", t: "inteiro" },
  { k: "cliquesLink", r: "Cliques no link", t: "inteiro" },
  { k: "visitasPerfil", r: "Visitas ao perfil", t: "inteiro" },
  { k: "conversas", r: "Conversas (WhatsApp)", t: "inteiro" },
  { k: "novosSeguidores", r: "Novos seguidores", t: "inteiro" },
  { k: "frequencia", r: "Frequência", t: "decimal", calc: true },
  { k: "ctr", r: "CTR (%)", t: "porcento", calc: true },
  { k: "cpc", r: "CPC", t: "dinheiro", calc: true },
  { k: "cpm", r: "CPM", t: "dinheiro", calc: true },
];

export const COLS_META_CAMPANHAS: Campo[] = [
  { k: "status", r: "Status", t: "texto", larg: "w-24" },
  { k: "nome", r: "Campanha", t: "texto", larg: "min-w-64" },
  { k: "rotulo", r: "Nome curto", t: "texto", larg: "min-w-40" },
  { k: "alcance", r: "Alcance", t: "inteiro", larg: "w-24" },
  { k: "impressoes", r: "Impr.", t: "inteiro", larg: "w-24" },
  { k: "cliques", r: "Cliques", t: "inteiro", larg: "w-20" },
  { k: "gasto", r: "Gasto", t: "dinheiro", larg: "w-24" },
  { k: "resultados", r: "Resultados", t: "texto", larg: "min-w-36" },
  { k: "custoResultado", r: "Custo/result.", t: "dinheiro", larg: "w-24" },
  { k: "seguidores", r: "Seguidores", t: "inteiro", larg: "w-20" },
];

export const COLS_POSICIONAMENTOS: Campo[] = [
  { k: "campanha", r: "Campanha", t: "texto", larg: "min-w-40" },
  { k: "posicionamento", r: "Posicionamento", t: "texto", larg: "min-w-40" },
  { k: "gasto", r: "Gasto", t: "dinheiro", larg: "w-24" },
  { k: "impressoes", r: "Impressões", t: "inteiro", larg: "w-24" },
  { k: "alcance", r: "Alcance", t: "inteiro", larg: "w-24" },
  { k: "resultados", r: "Resultados", t: "inteiro", larg: "w-24" },
  { k: "custoResultado", r: "Custo/result.", t: "dinheiro", larg: "w-24" },
  { k: "seguidores", r: "Seguidores", t: "inteiro", larg: "w-20" },
];

export const COLS_IDADES: Campo[] = [
  { k: "faixa", r: "Faixa etária", t: "texto", larg: "min-w-32" },
  { k: "impressoes", r: "Impressões", t: "inteiro", larg: "w-24" },
  { k: "seguidores", r: "Novos seguidores", t: "inteiro", larg: "w-24" },
  { k: "feminino", r: "Gasto feminino", t: "dinheiro", larg: "w-24" },
  { k: "masculino", r: "Gasto masculino", t: "dinheiro", larg: "w-24" },
  { k: "naoIdentificado", r: "Gasto não ident.", t: "dinheiro", larg: "w-24" },
];

export const COLS_ENTREGAS: Campo[] = [
  { k: "formato", r: "Formato", t: "texto", larg: "w-32" },
  { k: "acao", r: "Ação", t: "texto", larg: "min-w-64" },
  { k: "quantidade", r: "Quantidade", t: "inteiro", larg: "w-24" },
];

// ── Rascunho: o que está na tela, sempre em texto ───────────────────────

export type Rascunho = {
  referencia: string;
  google: { ativo: boolean; rede: string; observacao: string; campos: Linha; campanhas: Linha[]; concorrentes: Linha[]; parcela: Linha[] };
  meta: { ativo: boolean; observacao: string; campos: Linha; campanhas: Linha[]; posicionamentos: Linha[]; idades: Linha[] };
  social: { ativo: boolean; stories: string; feed: string; extraRotulo: string; extraValor: string; extraNota: string; entregas: Linha[] };
};

const paraTexto = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v));

function linhas(lista: unknown, cols: Campo[]): Linha[] {
  if (!Array.isArray(lista)) return [];
  return lista.map((l: Record<string, unknown>) => Object.fromEntries(cols.map((c) => [c.k, paraTexto(l[c.k])])));
}

const camposDe = (o: DadosMes | null | undefined, defs: Campo[]): Linha => Object.fromEntries(defs.map((c) => [c.k, paraTexto(o?.[c.k])]));

export function paraRascunho(dados: DadosMes | null, referencia: string): Rascunho {
  const g = dados?.google;
  const a = dados?.meta;
  const s = dados?.social;
  return {
    referencia,
    google: {
      ativo: dados ? Boolean(g) : true,
      rede: g?.rede ?? "Rede de Pesquisa",
      observacao: g?.observacao ?? "",
      campos: camposDe(g, CAMPOS_GOOGLE),
      campanhas: linhas(g?.campanhas, COLS_GOOGLE_CAMPANHAS),
      concorrentes: linhas(g?.concorrentes, COLS_CONCORRENTES),
      parcela: linhas(g?.parcelaLeilao, COLS_PARCELA),
    },
    meta: {
      ativo: dados ? Boolean(a) : true,
      observacao: a?.observacao ?? "",
      campos: camposDe(a, CAMPOS_META),
      campanhas: linhas(a?.campanhas, COLS_META_CAMPANHAS),
      posicionamentos: linhas(a?.posicionamentos, COLS_POSICIONAMENTOS),
      idades: linhas(a?.idades, COLS_IDADES),
    },
    social: {
      ativo: dados ? Boolean(s) : true,
      stories: paraTexto(s?.stories),
      feed: paraTexto(s?.feed),
      extraRotulo: s?.extra?.rotulo ?? "",
      extraValor: paraTexto(s?.extra?.valor),
      extraNota: s?.extra?.nota ?? "",
      entregas: linhas(s?.entregas, COLS_ENTREGAS),
    },
  };
}

/** Mês novo: repete nomes e estrutura do anterior, com os números em branco. */
export function estruturaDoAnterior(anterior: DadosMes, referencia: string): Rascunho {
  const r = paraRascunho(anterior, referencia);
  const limpa = (lista: Linha[], cols: Campo[]) =>
    lista.map((l) => Object.fromEntries(cols.map((c) => [c.k, c.t === "texto" && ["status", "nome", "rotulo", "orcamento", "campanha", "posicionamento", "faixa", "formato", "acao"].includes(c.k) ? (l[c.k] ?? "") : ""])));
  r.google.campos = camposDe(null, CAMPOS_GOOGLE);
  r.google.observacao = "";
  r.google.campanhas = limpa(r.google.campanhas, COLS_GOOGLE_CAMPANHAS);
  r.google.concorrentes = [];
  r.google.parcela = [];
  r.meta.campos = camposDe(null, CAMPOS_META);
  r.meta.observacao = "";
  r.meta.campanhas = limpa(r.meta.campanhas, COLS_META_CAMPANHAS);
  r.meta.posicionamentos = limpa(r.meta.posicionamentos, COLS_POSICIONAMENTOS);
  r.meta.idades = limpa(r.meta.idades, COLS_IDADES);
  r.social.stories = "";
  r.social.feed = "";
  r.social.extraValor = "";
  r.social.entregas = limpa(r.social.entregas, COLS_ENTREGAS);
  return r;
}

/** Aceita 1.234,56 · 1234,56 · 1234.56 · R$ 1.234,56 · 7,40%. Vazio = null; inválido = NaN. */
export function lerNumero(texto: string): number | null {
  let t = (texto ?? "").trim().replace(/^R\$\s*/i, "").replace(/%$/, "").trim();
  if (!t || t === "—" || t === "-") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (!/^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isNaN(n) ? NaN : n;
}

const arredonda = (n: number, c = 2) => Math.round(n * 10 ** c) / 10 ** c;
const razao = (a: number | null, b: number | null, fator = 1) => (a === null || !b ? null : arredonda((a / b) * fator));

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDoMes = (referencia: string) => MESES[Number(referencia.slice(5, 7)) - 1] ?? "";

export function periodoDoMes(referencia: string) {
  const ano = Number(referencia.slice(0, 4));
  const mes = Number(referencia.slice(5, 7));
  const ultimo = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, "0");
  return `01/${mm}/${ano} a ${String(ultimo).padStart(2, "0")}/${mm}/${ano}`;
}

function converte(l: Linha, cols: Campo[]) {
  const o: Record<string, unknown> = {};
  for (const c of cols) o[c.k] = c.t === "texto" ? (l[c.k] ?? "").trim() : lerNumero(l[c.k] ?? "");
  return o;
}

/** Nome curto em branco não vira campo vazio: o relatório usa o nome da campanha. */
function semVazios(o: Record<string, unknown>) {
  if (o.rotulo === "") delete o.rotulo;
  return o;
}

const preenchida = (l: Linha) => Object.values(l).some((v) => (v ?? "").trim() !== "");

/** Linha que veio do mês anterior só com o nome não conta: sem número, não entra no relatório. */
const comNumero = (cols: Campo[]) => (l: Linha) => cols.some((c) => c.t !== "texto" && (l[c.k] ?? "").trim() !== "");

/**
 * Monta o `dados` do mês. `base` preserva o que o formulário não mostra, e
 * valores já informados vencem o cálculo, para o número bater com a plataforma.
 */
export function paraDados(r: Rascunho, base: DadosMes | null): DadosMes {
  const d: DadosMes = { ...(base ?? {}), id: r.referencia, mes: nomeDoMes(r.referencia), ano: Number(r.referencia.slice(0, 4)), periodo: base?.periodo ?? periodoDoMes(r.referencia) };

  if (r.google.ativo) {
    const c = converte(r.google.campos, CAMPOS_GOOGLE) as Record<string, number | null>;
    const custo = c.custo ?? null;
    const impressoes = c.impressoes ?? null;
    const cliques = c.cliques ?? null;
    const conversoes = c.conversoes ?? null;
    d.google = {
      ...(base?.google ?? {}),
      ...c,
      rede: r.google.rede.trim() || "Rede de Pesquisa",
      ctr: c.ctr ?? razao(cliques, impressoes, 100),
      cpc: c.cpc ?? razao(custo, cliques),
      custoConversao: c.custoConversao ?? razao(custo, conversoes),
      taxaConversao: c.taxaConversao ?? razao(conversoes, cliques, 100),
      observacao: r.google.observacao.trim(),
      campanhas: r.google.campanhas.filter(comNumero(COLS_GOOGLE_CAMPANHAS)).map((l, i) => {
        const x = semVazios(converte(l, COLS_GOOGLE_CAMPANHAS)) as Record<string, number | null>;
        const antes = (base?.google?.campanhas ?? [])[i] ?? {};
        return {
          ...antes,
          ...x,
          orcamento: l.orcamento?.trim() || null,
          ctr: antes.nome === l.nome ? antes.ctr : razao(x.cliques ?? null, x.impressoes ?? null, 100),
          cpc: antes.nome === l.nome ? antes.cpc : (razao(x.custo ?? null, x.cliques ?? null) ?? 0),
          custoConversao: antes.nome === l.nome ? antes.custoConversao : (razao(x.custo ?? null, x.conversoes ?? null) ?? 0),
          taxaConversao: antes.nome === l.nome ? antes.taxaConversao : razao(x.conversoes ?? null, x.cliques ?? null, 100),
        };
      }),
      concorrentes: r.google.concorrentes.filter(preenchida).map((l) => converte(l, COLS_CONCORRENTES)),
      parcelaLeilao: r.google.parcela.some(preenchida) ? r.google.parcela.filter(preenchida).map((l) => converte(l, COLS_PARCELA)) : null,
    };
  } else d.google = null;

  if (r.meta.ativo) {
    const c = converte(r.meta.campos, CAMPOS_META) as Record<string, number | null>;
    const gasto = c.gasto ?? null;
    const impressoes = c.impressoes ?? null;
    const cliques = c.cliques ?? null;
    const alcance = c.alcance ?? null;
    const posicionamentos = r.meta.posicionamentos.filter(comNumero(COLS_POSICIONAMENTOS)).map((l) => converte(l, COLS_POSICIONAMENTOS));
    const idades = r.meta.idades.filter(comNumero(COLS_IDADES)).map((l, i) => {
      const x = converte(l, COLS_IDADES) as Record<string, number | null>;
      const total = arredonda((x.feminino ?? 0) + (x.masculino ?? 0) + (x.naoIdentificado ?? 0));
      const antes = (base?.meta?.idades ?? [])[i] ?? {};
      return {
        ...antes,
        ...x,
        gasto: antes.faixa === l.faixa && antes.gasto !== undefined && arredonda(antes.feminino + antes.masculino + antes.naoIdentificado) === total ? antes.gasto : total,
        percentual: antes.faixa === l.faixa && antes.percentual !== undefined && arredonda(antes.feminino + antes.masculino + antes.naoIdentificado) === total ? antes.percentual : (razao(total, gasto, 100) ?? 0),
        percentualFeminino: antes.faixa === l.faixa && antes.percentualFeminino !== undefined && arredonda(antes.feminino + antes.masculino + antes.naoIdentificado) === total ? antes.percentualFeminino : (razao(x.feminino ?? 0, total, 100) ?? 0),
      };
    });
    const mudou = JSON.stringify(posicionamentos) !== JSON.stringify(base?.meta?.posicionamentos ?? null);
    const { gastoPosicionamento, ...metaBase } = base?.meta ?? ({} as DadosMes);
    d.meta = {
      ...metaBase,
      ...(mudou || !gastoPosicionamento ? {} : { gastoPosicionamento }),
      ...c,
      frequencia: c.frequencia ?? razao(impressoes, alcance),
      ctr: c.ctr ?? razao(cliques, impressoes, 100),
      cpc: c.cpc ?? razao(gasto, cliques),
      cpm: c.cpm ?? razao(gasto, impressoes, 1000),
      observacao: r.meta.observacao.trim(),
      campanhas: r.meta.campanhas.filter(comNumero(COLS_META_CAMPANHAS)).map((l, i) => {
        const x = semVazios(converte(l, COLS_META_CAMPANHAS)) as Record<string, number | null>;
        const antes = (base?.meta?.campanhas ?? [])[i] ?? {};
        return {
          ...antes,
          ...x,
          frequencia: antes.nome === l.nome ? antes.frequencia : razao(x.impressoes ?? null, x.alcance ?? null),
          ctr: antes.nome === l.nome ? antes.ctr : razao(x.cliques ?? null, x.impressoes ?? null, 100),
          cpc: antes.nome === l.nome ? antes.cpc : razao(x.gasto ?? null, x.cliques ?? null),
          cpm: antes.nome === l.nome ? antes.cpm : razao(x.gasto ?? null, x.impressoes ?? null, 1000),
        };
      }),
      posicionamentos: posicionamentos.length ? posicionamentos : null,
      idades: idades.length ? idades : null,
    };
  } else d.meta = null;

  if (r.social.ativo) {
    const entregas = r.social.entregas.filter(comNumero(COLS_ENTREGAS)).map((l) => converte(l, COLS_ENTREGAS)) as { quantidade: number | null }[];
    const total = entregas.reduce((t, e) => t + (e.quantidade ?? 0), 0);
    const extra = r.social.extraRotulo.trim() ? { rotulo: r.social.extraRotulo.trim(), valor: lerNumero(r.social.extraValor), nota: r.social.extraNota.trim() } : null;
    d.social = { total, stories: lerNumero(r.social.stories), feed: lerNumero(r.social.feed), extra, entregas };
  } else d.social = null;

  return d;
}

// ── Conferência ──────────────────────────────────────────────────────────

export type Alerta = { nivel: "erro" | "aviso"; msg: string };

const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("pt-BR");

function invalidos(rotulo: string, defs: Campo[], lista: Linha[]): Alerta[] {
  const a: Alerta[] = [];
  lista.forEach((l, i) => {
    for (const c of defs) {
      if (c.t !== "texto" && Number.isNaN(lerNumero(l[c.k] ?? ""))) a.push({ nivel: "erro", msg: `${rotulo}${lista.length > 1 ? `, linha ${i + 1}` : ""}: "${l[c.k]}" em ${c.r} não é um número.` });
    }
  });
  return a;
}

function soma(lista: Record<string, unknown>[] | null | undefined, k: string) {
  return (lista ?? []).reduce((t: number, l) => t + (Number(l[k]) || 0), 0);
}

function confere(a: Alerta[], rotulo: string, somado: number, total: number | null | undefined, fmt: (n: number) => string, tolerancia = 0.05) {
  if (total === null || total === undefined) return;
  if (Math.abs(somado - total) > tolerancia) a.push({ nivel: "aviso", msg: `${rotulo}: a soma dá ${fmt(somado)}, mas o total informado é ${fmt(total)}.` });
}

/** Mesma conferência feita no relatório original: as partes têm de fechar com o total. */
export function conferir(r: Rascunho): Alerta[] {
  const a: Alerta[] = [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.referencia)) a.push({ nivel: "erro", msg: "Escolha o mês do relatório." });
  if (!r.google.ativo && !r.meta.ativo && !r.social.ativo) a.push({ nivel: "erro", msg: "Ligue ao menos um canal: Google Ads, Meta ADS ou Social Media." });

  if (r.google.ativo) {
    a.push(...invalidos("Google Ads", CAMPOS_GOOGLE, [r.google.campos]), ...invalidos("Campanhas do Google", COLS_GOOGLE_CAMPANHAS, r.google.campanhas));
    for (const k of ["custo", "impressoes", "cliques", "conversoes"]) {
      if (!(r.google.campos[k] ?? "").trim()) a.push({ nivel: "aviso", msg: `Google Ads: falta preencher ${CAMPOS_GOOGLE.find((c) => c.k === k)?.r}.` });
    }
  }
  if (r.meta.ativo) {
    a.push(...invalidos("Meta ADS", CAMPOS_META, [r.meta.campos]), ...invalidos("Campanhas do Meta", COLS_META_CAMPANHAS, r.meta.campanhas), ...invalidos("Posicionamentos", COLS_POSICIONAMENTOS, r.meta.posicionamentos), ...invalidos("Faixas etárias", COLS_IDADES, r.meta.idades));
    for (const k of ["gasto", "impressoes", "cliques"]) {
      if (!(r.meta.campos[k] ?? "").trim()) a.push({ nivel: "aviso", msg: `Meta ADS: falta preencher ${CAMPOS_META.find((c) => c.k === k)?.r}.` });
    }
  }
  if (r.social.ativo) a.push(...invalidos("Entregas", COLS_ENTREGAS, r.social.entregas));
  if (a.some((x) => x.nivel === "erro")) return a;

  const d = paraDados(r, null);
  if (d.google?.campanhas?.length) {
    confere(a, "Custo das campanhas do Google", soma(d.google.campanhas, "custo"), d.google.custo, brl);
    confere(a, "Impressões das campanhas do Google", soma(d.google.campanhas, "impressoes"), d.google.impressoes, num, 0);
    confere(a, "Cliques das campanhas do Google", soma(d.google.campanhas, "cliques"), d.google.cliques, num, 0);
    confere(a, "Conversões das campanhas do Google", soma(d.google.campanhas, "conversoes"), d.google.conversoes, num, 0.01);
  }
  if (d.meta) {
    if (d.meta.campanhas?.length) {
      confere(a, "Gasto das campanhas do Meta", soma(d.meta.campanhas, "gasto"), d.meta.gasto, brl);
      confere(a, "Impressões das campanhas do Meta", soma(d.meta.campanhas, "impressoes"), d.meta.impressoes, num, 0);
      confere(a, "Cliques das campanhas do Meta", soma(d.meta.campanhas, "cliques"), d.meta.cliques, num, 0);
    }
    if (d.meta.posicionamentos) confere(a, "Gasto por posicionamento", soma(d.meta.posicionamentos, "gasto"), d.meta.gasto, brl);
    if (d.meta.idades) confere(a, "Gasto por faixa etária", soma(d.meta.idades, "gasto"), d.meta.gasto, brl);
  }
  if (r.social.ativo && !r.social.entregas.some(comNumero(COLS_ENTREGAS))) a.push({ nivel: "aviso", msg: "Social Media está ligado, mas não há entregas." });
  return a;
}
