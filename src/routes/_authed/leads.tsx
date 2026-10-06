import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ListFilter, MessageCircle, Search, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CampaignSelector } from "@/components/ds/campaign-selector";
import { Card } from "@/components/ds/card";
import { Checkbox } from "@/components/ds/controles";
import { StatusBadge } from "@/components/ds/status-badge";
import { LeadDetalhe } from "@/components/lead-detalhe";
import { Modal } from "@/components/modal";
import { ModuloDesativado } from "@/components/modulo";
import { Cabecalho, usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { useAcesso } from "@/lib/acesso";
import { somarDias, ymd } from "@/lib/datas";
import {
  chegouEm,
  linkWhatsApp,
  nomeDoLead,
  paginaDoLead,
  respostasDe,
  telefoneBonito,
  valorDaResposta,
} from "@/lib/leads";
import type { ResultadoMassa } from "@/lib/queries";
import {
  atualizarStatusEmMassa,
  contagemPorStatusQuery,
  excluirLeadsEmMassa,
  fonteQuery,
  leadsQuery,
  POR_PAGINA,
  resumoPeriodoQuery,
} from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Lead, Status } from "@/lib/types";
import { modulosDe, STATUS_LABEL } from "@/lib/types";
import { iniciais } from "@/lib/usuario";

export const Route = createFileRoute("/_authed/leads")({
  // `busca` chega da busca do topo (components/shell/top-bar.tsx).
  validateSearch: (s: Record<string, unknown>): { busca?: string } =>
    typeof s.busca === "string" && s.busca ? { busca: s.busca } : {},
  component: Leads,
});

const STATUS = Object.keys(STATUS_LABEL) as Status[];

/** Recortes de período da tabela. `frase` completa "todas as campanhas …". */
const PERIODOS = {
  "30": { rotulo: "Últimos 30 dias", frase: "dos últimos 30 dias", sub: "nos últimos 30 dias" },
  hoje: { rotulo: "Hoje", frase: "de hoje", sub: "hoje" },
  "7": { rotulo: "Últimos 7 dias", frase: "dos últimos 7 dias", sub: "nos últimos 7 dias" },
  mes: { rotulo: "Este mês", frase: "deste mês", sub: "neste mês" },
  tudo: { rotulo: "Todo o período", frase: "de todo o período", sub: "desde o início" },
} as const;
type Periodo = keyof typeof PERIODOS;

function limitesDo(periodo: Periodo, hoje: string): { de: string | null; ate: string | null } {
  if (periodo === "tudo") return { de: null, ate: null };
  if (periodo === "hoje") return { de: hoje, ate: hoje };
  if (periodo === "mes") return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  return { de: somarDias(hoje, -(Number(periodo) - 1)), ate: hoje };
}

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const taxa = (parte: number, todo: number) =>
  `${(todo > 0 ? (100 * parte) / todo : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Colunas da tabela: as mesmas no cabeçalho e em cada linha. O minmax(0, …)
 * impede um selo largo de alargar a coluna só naquela linha e desalinhar as outras.
 */
const GRADE =
  "grid grid-cols-[24px_minmax(0,1.7fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_52px] items-center gap-4";

/**
 * Portão do módulo: se o cliente não usa CRM, a tela mostra o aviso
 * (e o botão de ativar) em vez de consultar dados que ele não tem.
 */
function Leads() {
  const { projeto } = usePainel();
  if (!modulosDe(projeto).crm) {
    return (
      <>
        <Cabecalho titulo="Leads" comCampanha={false} />
        <ModuloDesativado modulo="crm" />
      </>
    );
  }
  return <LeadsTela />;
}

function LeadsTela() {
  const { projeto, campanha } = usePainel();
  const { podeGerenciar } = useAcesso(projeto?.id);
  const qc = useQueryClient();
  const hoje = ymd(new Date());

  const { busca: buscaInicial } = Route.useSearch();
  const [busca, setBusca] = useState(buscaInicial ?? "");
  // Buscar de novo pelo topo, já nesta tela, troca o termo sem remontar.
  useEffect(() => {
    if (buscaInicial) setBusca(buscaInicial);
  }, [buscaInicial]);

  const [status, setStatus] = useState<Status | "">("");
  const [soParciais, setSoParciais] = useState(false);
  const [origem, setOrigem] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [pagina, setPagina] = useState(0);
  const [filtrosVisiveis, setFiltrosVisiveis] = useState(true);
  const [aberto, setAberto] = useState<Lead | null>(null);
  // Ações em massa: ids marcados e a confirmação da exclusão do lote.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmandoMassa, setConfirmandoMassa] = useState(false);

  // Com campanha escolhida, o período é o dela: o seletor de período sai de cena.
  const { de, ate } = campanha ? { de: campanha.inicio, ate: campanha.fim } : limitesDo(periodo, hoje);
  const tipo = soParciais ? "parcial" : "";

  const { data, isLoading } = useQuery(
    leadsQuery({ projectId: projeto?.id, campaignId: campanha?.id ?? null, busca, status, tipo, origem, pagina, de, ate }),
  );
  const { data: porStatus } = useQuery(
    contagemPorStatusQuery({ projectId: projeto?.id, campaignId: campanha?.id ?? null, de, ate, tipo }),
  );
  // Funil do CRM: só quem enviou o formulário, no mesmo período.
  const { data: resumo } = useQuery(resumoPeriodoQuery(projeto?.id, de, ate));
  // As opções de origem vêm dos próprios leads: cada cliente usa utm_source diferentes.
  const { data: fontes } = useQuery(fonteQuery(projeto?.id, campanha?.id ?? null));

  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const totalDoPeriodo = STATUS.reduce((t, s) => t + (porStatus?.[s] ?? 0), 0);

  // Trocar de filtro, página ou cliente zera a seleção: manter ids que não
  // estão mais na tela levaria a apagar lead que o usuário nem enxerga.
  useEffect(() => {
    setSelecionados(new Set());
  }, [busca, status, tipo, origem, periodo, pagina, projeto?.id, campanha?.id]);

  // Filtro novo começa da primeira página.
  useEffect(() => {
    setPagina(0);
  }, [busca, status, tipo, origem, periodo, projeto?.id, campanha?.id]);

  // A origem escolhida pode não existir no cliente ou campanha seguinte.
  useEffect(() => {
    setOrigem("");
  }, [projeto?.id, campanha?.id]);

  const idsDaPagina = linhas.map((l) => l.id);
  const todosMarcados = idsDaPagina.length > 0 && idsDaPagina.every((id) => selecionados.has(id));

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /** O checkbox do cabeçalho vale só para a página atual, não para o filtro inteiro. */
  function alternarPagina() {
    setSelecionados((atual) => {
      if (todosMarcados) {
        const novo = new Set(atual);
        idsDaPagina.forEach((id) => novo.delete(id));
        return novo;
      }
      return new Set([...atual, ...idsDaPagina]);
    });
  }

  function recarregar() {
    for (const chave of ["leads", "leads-por-status", "resumo-periodo", "leads-novos", "funil"]) {
      void qc.invalidateQueries({ queryKey: [chave] });
    }
  }

  /** Conta quantas linhas a RLS deixou passar e conta a verdade ao usuário. */
  function avisar({ feitos, pedidos }: ResultadoMassa, participio: string) {
    if (feitos === 0) {
      toast(`Nenhum lead ${participio}: sua conta não tem permissão nesta página.`, "error");
    } else if (feitos < pedidos) {
      toast(`${feitos} de ${pedidos} ${participio}s. Nos outros faltou permissão.`, "info");
    } else {
      toast(`${feitos} ${feitos === 1 ? `lead ${participio}` : `leads ${participio}s`}.`, "success");
    }
  }

  const statusEmMassa = useMutation({
    mutationFn: ({ ids, novo }: { ids: string[]; novo: string }) => atualizarStatusEmMassa(ids, novo),
    onSuccess: (r) => {
      avisar(r, "atualizado");
      setSelecionados(new Set());
      recarregar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const excluirEmMassa = useMutation({
    mutationFn: (ids: string[]) => excluirLeadsEmMassa(ids),
    onSuccess: (r) => {
      avisar(r, "excluído");
      setSelecionados(new Set());
      setConfirmandoMassa(false);
      recarregar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  /** Exporta o recorte inteiro (campanha ou período), não só a página na tela. */
  async function exportar() {
    if (!projeto) return;

    let q = getSupabaseBrowserClient().from("leads").select("*").eq("project_id", projeto.id);
    if (campanha) q = q.eq("campaign_id", campanha.id);
    if (de) q = q.gte("criado_em", `${de}T00:00:00-03:00`);
    if (ate) q = q.lte("criado_em", `${ate}T23:59:59.999-03:00`);
    const { data: resposta, error } = await q.order("criado_em", { ascending: false });
    if (error) return toast(error.message, "error");
    const todos = (resposta ?? []) as Lead[];
    if (!todos.length) return toast("Nenhum lead para exportar neste recorte.", "info");

    // Cada LP tem perguntas diferentes, então as colunas são descobertas a
    // partir dos dados em vez de fixadas no código.
    const chaves = [...new Set(todos.flatMap((l) => Object.keys(l.respostas ?? {})))];
    const cabecalho = ["nome", "email", "whatsapp", "status", "completo", "criado_em", "utm_source", "utm_campaign", ...chaves];

    // As respostas vêm de um formulário público. Um valor começando com =, +,
    // - ou @ seria executado como fórmula pelo Excel de quem abre a planilha:
    // o apóstrofo na frente faz o Excel tratar como texto.
    const escapar = (v: unknown) => {
      const texto = String(v ?? "");
      const neutro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
      return `"${neutro.replace(/"/g, '""')}"`;
    };
    const corpo = todos.map((l) =>
      [
        l.nome,
        l.email,
        l.whatsapp,
        STATUS_LABEL[l.status],
        l.completo ? "sim" : "não",
        new Date(l.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        l.utms?.utm_source,
        l.utms?.utm_campaign,
        ...chaves.map((k) => valorDaResposta(l.respostas?.[k])),
      ]
        .map(escapar)
        .join(";"),
    );

    // Ponto e vírgula e BOM: é como o Excel em português abre separando as
    // colunas e com os acentos certos, sem passar por "importar dados".
    const csv = "﻿" + [cabecalho.map(escapar).join(";"), ...corpo].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${projeto.slug}-${hoje}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Funil do CRM: cada etapa conta quem chegou ATÉ ela ou passou dela. */
  const s = resumo?.porStatus;
  const entraram = resumo?.enviaram ?? 0;
  const convertido = s?.convertido ?? 0;
  const noGrupo = (s?.entrou_no_grupo ?? 0) + convertido;
  const comContato = (s?.contato_feito ?? 0) + noGrupo;
  const perdidos = s?.perdido ?? 0;
  const funil = [
    { rotulo: "Entraram", n: entraram, taxa: "100%", cor: "#1C2E45" },
    { rotulo: "Contato feito", n: comContato, taxa: taxa(comContato, entraram), cor: "#1A66C2" },
    { rotulo: "Entrou no grupo", n: noGrupo, taxa: taxa(noGrupo, comContato), cor: "#5B93D6" },
    { rotulo: "Convertido", n: convertido, taxa: taxa(convertido, noGrupo), cor: "#9CC0EA" },
  ];

  const abas: { id: Status | ""; rotulo: string; n: number }[] = [
    { id: "", rotulo: "Todos", n: totalDoPeriodo },
    ...STATUS.map((st) => ({ id: st, rotulo: STATUS_LABEL[st], n: porStatus?.[st] ?? 0 })),
  ];

  // Até três números de página, com a atual no meio quando dá.
  const primeira = Math.max(0, Math.min(pagina - 1, paginas - 3));
  const numeros = Array.from({ length: Math.min(3, paginas) }, (_, i) => primeira + i);

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Leads"
        selo={inteiro(totalDoPeriodo)}
        subtitulo={`Quem chegou pelas landing pages de ${projeto?.nome ?? "seu cliente"} ${
          campanha ? `na campanha ${campanha.nome}` : PERIODOS[periodo].sub
        }`}
        acoes={
          <>
            <button
              type="button"
              onClick={() => setFiltrosVisiveis((v) => !v)}
              aria-expanded={filtrosVisiveis}
              aria-controls="filtros-leads"
              className="btn btn-secundario px-4"
            >
              <ListFilter size={16} strokeWidth={1.8} aria-hidden />
              Filtros
            </button>
            <button type="button" onClick={() => void exportar()} className="btn btn-escuro px-4">
              <Download size={16} strokeWidth={1.9} aria-hidden />
              Exportar Excel
            </button>
          </>
        }
      />

      <CampaignSelector leadsDaCampanha={entraram} periodoPadrao={PERIODOS[periodo].frase} />

      <Card
        className="gap-4"
        titulo="Funil do CRM"
        acao={
          <span className="text-[12px] text-texto-3">
            Taxa de cada etapa sobre a anterior · {inteiro(perdidos)} {perdidos === 1 ? "perdido" : "perdidos"} no caminho
          </span>
        }
      >
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
          {funil.map((f) => (
            <div key={f.rotulo} className="flex flex-col gap-2.5 rounded-[16px] bg-superficie-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-texto-2">{f.rotulo}</span>
                <span className="rounded-full bg-white px-2 py-[3px] text-[11px] font-bold">{f.taxa}</span>
              </div>
              <span className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{inteiro(f.n)}</span>
              <div className="h-2 rounded-full bg-borda-campo" aria-hidden="true">
                <div
                  className="h-2 rounded-full transition-[width] duration-300"
                  style={{ width: `${entraram > 0 ? (100 * f.n) / entraram : 0}%`, background: f.cor }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <section className="flex min-w-0 flex-col rounded-[20px] border border-borda bg-white">
        <div className="flex items-center gap-2.5 rounded-t-[20px] border-b border-borda bg-superficie-2 px-[22px] py-3.5 text-[13px] text-texto-2">
          <span className="h-2.5 w-2.5 flex-none rounded-full bg-azul" />
          Leads parciais são pessoas que começaram o formulário e não enviaram. Se voltarem e enviarem, o cadastro é completado.
        </div>

        <div role="tablist" aria-label="Status" className="flex flex-wrap gap-x-[26px] gap-y-1 border-b border-borda px-[22px]">
          {abas.map((a) => (
            <button
              key={a.id || "todos"}
              type="button"
              role="tab"
              aria-selected={a.id === status}
              onClick={() => setStatus(a.id)}
              className="aba flex min-h-[52px] items-center gap-2"
            >
              {a.rotulo}
              <span className="rounded-full bg-gelo px-[7px] py-0.5 text-[11px] font-bold text-texto-2">{inteiro(a.n)}</span>
            </button>
          ))}
        </div>

        {filtrosVisiveis && (
          <div id="filtros-leads" className="flex flex-wrap items-center gap-2.5 px-[22px] py-4">
            <label className="campo flex flex-[1_1_280px] items-center gap-2.5 text-texto-3">
              <Search size={18} strokeWidth={1.8} aria-hidden className="shrink-0" />
              <span className="sr-only">Buscar lead</span>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, email ou telefone"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-marinho"
              />
            </label>

            <Seletor rotulo="Origem" valor={origem} onChange={setOrigem}>
              <option value="">Todas</option>
              {(fontes ?? []).map((f) => (
                <option key={f.fonte} value={f.fonte}>
                  {f.fonte} ({f.total})
                </option>
              ))}
            </Seletor>

            {!campanha && (
              <Seletor rotulo="Período" valor={periodo} onChange={(v) => setPeriodo(v as Periodo)}>
                {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
                  <option key={p} value={p}>
                    {PERIODOS[p].rotulo}
                  </option>
                ))}
              </Seletor>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={soParciais}
              onClick={() => setSoParciais((v) => !v)}
              className="btn btn-secundario gap-2.5 px-3.5"
            >
              <span
                className={`box-border flex h-[22px] w-10 items-center rounded-full p-0.5 transition-colors ${
                  soParciais ? "justify-end bg-azul" : "justify-start bg-nevoa-2"
                }`}
              >
                <span className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
              </span>
              Só parciais
            </button>
          </div>
        )}

        {selecionados.size > 0 && (
          <div className="mx-[22px] mb-4 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-azul-borda bg-azul-claro px-3.5 py-2.5">
            <span className="text-[13px] font-bold">
              {selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}
            </span>
            <Seletor
              rotulo="Mudar status para"
              valor=""
              onChange={(novo) => {
                if (novo) statusEmMassa.mutate({ ids: [...selecionados], novo });
              }}
            >
              <option value="">Escolher</option>
              {STATUS.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </Seletor>
            {podeGerenciar && (
              <button
                type="button"
                onClick={() => setConfirmandoMassa(true)}
                className="btn btn-40 border border-erro/30 bg-white text-erro-texto hover:bg-erro-fundo"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden />
                Excluir selecionados
              </button>
            )}
            <button type="button" onClick={() => setSelecionados(new Set())} className="link ml-auto border-0 bg-transparent text-[13px]">
              Limpar seleção
            </button>
          </div>
        )}

        <div className={`overflow-x-auto px-[22px] ${filtrosVisiveis || selecionados.size ? "" : "pt-4"}`}>
          <div className="min-w-[1060px]" role="table" aria-label="Leads">
            <div role="row" className={`${GRADE} rounded-[12px] bg-superficie-2 px-3.5 py-3 text-[12px] font-bold text-texto-3`}>
              <Checkbox aria-label="Selecionar os leads desta página" checked={todosMarcados} onChange={alternarPagina} />
              {["Nome", "Contato", "Landing page", "Respostas", "Status", "Chegou"].map((c) => (
                <span key={c} role="columnheader">
                  {c}
                </span>
              ))}
              <span />
            </div>

            {linhas.map((l) => (
              <LinhaLead
                key={l.id}
                lead={l}
                marcado={selecionados.has(l.id)}
                onMarcar={() => alternar(l.id)}
                onAbrir={() => setAberto(l)}
              />
            ))}

            {linhas.length === 0 && (
              <div className="px-5 py-10 text-center text-[14px] text-texto-3">
                {isLoading ? "Carregando leads…" : "Nenhum lead com esse filtro nesta página."}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-4">
          <span className="text-[13px] text-texto-3">
            Mostrando {inteiro(linhas.length)} de {inteiro(total)} {total === 1 ? "lead" : "leads"}
          </span>
          {paginas > 1 && (
            <nav aria-label="Páginas" className="flex flex-wrap gap-1.5">
              {pagina > 0 && (
                <button type="button" onClick={() => setPagina((p) => p - 1)} className="btn btn-secundario px-3.5">
                  Anterior
                </button>
              )}
              {numeros.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPagina(n)}
                  aria-current={n === pagina ? "page" : undefined}
                  className={`btn min-w-11 px-0 ${n === pagina ? "btn-escuro" : "btn-secundario"}`}
                >
                  {n + 1}
                </button>
              ))}
              {pagina + 1 < paginas && (
                <button type="button" onClick={() => setPagina((p) => p + 1)} className="btn btn-secundario px-3.5">
                  Próxima
                </button>
              )}
            </nav>
          )}
        </div>
      </section>

      <LeadDetalhe lead={aberto} onFechar={() => setAberto(null)} podeExcluir={podeGerenciar} />

      <Modal aberto={confirmandoMassa} onFechar={() => setConfirmandoMassa(false)} titulo="Excluir leads selecionados">
        <p className="text-[14px]">
          Excluir{" "}
          <strong>
            {selecionados.size} {selecionados.size === 1 ? "lead" : "leads"}
          </strong>{" "}
          para sempre?
        </p>
        <p className="mt-1 text-[12px] text-texto-3">Não dá para desfazer.</p>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => excluirEmMassa.mutate([...selecionados])}
            disabled={excluirEmMassa.isPending}
            className="btn flex-1 bg-erro text-white hover:bg-erro-texto"
          >
            {excluirEmMassa.isPending ? "Excluindo…" : `Sim, excluir ${selecionados.size}`}
          </button>
          <button type="button" onClick={() => setConfirmandoMassa(false)} className="btn btn-secundario flex-1">
            Cancelar
          </button>
        </div>
      </Modal>
    </div>
  );
}

function LinhaLead({
  lead: l,
  marcado,
  onMarcar,
  onAbrir,
}: {
  lead: Lead;
  marcado: boolean;
  onMarcar: () => void;
  onAbrir: () => void;
}) {
  const nome = nomeDoLead(l);
  const telefone = telefoneBonito(l.whatsapp);
  const respostas = respostasDe(l);
  const resumo = respostas
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${valorDaResposta(v)}`)
    .join(" · ");

  return (
    <div
      role="row"
      aria-selected={marcado}
      className={`linha-tabela ${GRADE} min-h-[68px] border-b border-gelo px-3.5 py-2 text-[13px]`}
    >
      <Checkbox aria-label={`Selecionar ${nome}`} checked={marcado} onChange={onMarcar} />

      <span role="cell" className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-azul-claro-2 text-[12px] font-bold text-[#1A57A6]">
          {iniciais(l.nome)}
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <button
            type="button"
            onClick={onAbrir}
            className="truncate border-0 bg-transparent p-0 text-left font-bold text-marinho underline decoration-nevoa underline-offset-[3px] transition-colors hover:decoration-azul"
          >
            {nome}
          </button>
          {!l.completo && (
            <span className="self-start rounded-md bg-alerta-fundo px-[7px] py-0.5 text-[11px] font-bold text-alerta">
              {l.whatsapp ? "Parcial" : "Parcial · parou antes do telefone"}
            </span>
          )}
        </span>
      </span>

      <span role="cell" className={telefone ? "" : "text-texto-3"}>
        {telefone ?? "Sem telefone"}
      </span>
      <span role="cell" className="text-texto-2 [overflow-wrap:anywhere]">
        {paginaDoLead(l.origem) ?? "Não informada"}
      </span>
      <span role="cell" className={`line-clamp-2 leading-[1.45] ${resumo ? "" : "text-texto-3"}`}>
        {resumo || "Nenhuma resposta ainda"}
      </span>
      <span role="cell">
        <StatusBadge tipo="lead" status={l.status} />
      </span>
      <span role="cell" className="text-texto-3">
        {chegouEm(l.criado_em)}
      </span>

      {l.whatsapp ? (
        <a
          href={linkWhatsApp(l.whatsapp)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir WhatsApp de ${nome}`}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-sucesso-fundo text-sucesso transition-colors hover:bg-[#CDEBD7]"
        >
          <MessageCircle size={18} strokeWidth={1.8} aria-hidden />
        </a>
      ) : (
        <span
          aria-label="Sem WhatsApp"
          title="Este lead não deixou telefone"
          className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-superficie-2 text-nevoa"
        >
          <MessageCircle size={18} strokeWidth={1.8} aria-hidden />
        </span>
      )}
    </div>
  );
}

/** Caixa "rótulo + lista" dos filtros: o <select> nativo dentro da moldura do design. */
function Seletor({
  rotulo,
  valor,
  onChange,
  children,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="campo flex items-center gap-2 px-3 text-[12px] font-semibold text-texto-3">
      {rotulo}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[200px] cursor-pointer border-0 bg-transparent text-[13px] font-bold text-marinho outline-none"
      >
        {children}
      </select>
    </label>
  );
}
