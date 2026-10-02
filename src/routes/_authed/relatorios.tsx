import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { useState } from "react";

import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { fmt, somarDias, ymd } from "@/lib/datas";
import type { Periodo } from "@/lib/relatorios";
import { diasDoPeriodo, periodoAnterior, relatorioQuery, variacao } from "@/lib/relatorios";
import { FORMATO_LABEL } from "@/lib/types";

export const Route = createFileRoute("/_authed/relatorios")({ component: Relatorios });

/* Atalhos de período. O relatório é ferramenta de análise interna, então os
   recortes são os que a gente usa pra decidir: fechar o mês, comparar com o
   anterior, olhar a tendência longa. */
function atalhos(): { rotulo: string; periodo: Periodo }[] {
  const hoje = new Date();
  const hojeYmd = ymd(hoje);
  const primeiroDoMes = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const primeiroDoAnterior = ymd(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  const ultimoDoAnterior = ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 0));

  return [
    { rotulo: "Este mês", periodo: { de: primeiroDoMes, ate: hojeYmd } },
    { rotulo: "Mês passado", periodo: { de: primeiroDoAnterior, ate: ultimoDoAnterior } },
    { rotulo: "Últimos 30 dias", periodo: { de: somarDias(hojeYmd, -29), ate: hojeYmd } },
    { rotulo: "Últimos 90 dias", periodo: { de: somarDias(hojeYmd, -89), ate: hojeYmd } },
    { rotulo: "Este ano", periodo: { de: ymd(new Date(hoje.getFullYear(), 0, 1)), ate: hojeYmd } },
  ];
}

function Relatorios() {
  const { projeto, projetos } = usePainel();
  const [periodo, setPeriodo] = useState<Periodo>(() => atalhos()[0]!.periodo);
  // Todos os clientes de uma vez é o que o Dashboard não faz — e é o motivo
  // principal de esta tela existir pra uso interno.
  const [todosClientes, setTodosClientes] = useState(false);

  const alvo = todosClientes ? null : (projeto?.id ?? null);
  const anterior = periodoAnterior(periodo);

  const atual = useQuery(relatorioQuery(alvo, periodo));
  const base = useQuery(relatorioQuery(alvo, anterior));

  const r = atual.data;
  const b = base.data;
  const dias = diasDoPeriodo(periodo);

  function exportarCsv() {
    if (!r) return;
    const nome = (id: string) => projetos.find((p) => p.id === id)?.nome ?? id;
    const ids = [...new Set([...Object.keys(r.crm.porProjeto), ...Object.keys(r.conteudo.porProjeto)])];

    const linhas = [
      ["cliente", "leads", "leads_completos", "conteudos", "conteudos_publicados"],
      ...ids.map((id) => [
        nome(id),
        String(r.crm.porProjeto[id]?.leads ?? 0),
        String(r.crm.porProjeto[id]?.completos ?? 0),
        String(r.conteudo.porProjeto[id]?.total ?? 0),
        String(r.conteudo.porProjeto[id]?.publicados ?? 0),
      ]),
    ];

    const csv = "﻿" + linhas.map((l) => l.map((c) => JSON.stringify(c)).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${periodo.de}-a-${periodo.ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Cabecalho titulo="Relatórios" atualizavel oQueAtualiza="" comCampanha={false}>
        <div className="flex gap-2 nao-imprime">
          <button
            onClick={exportarCsv}
            disabled={!r}
            className="flex items-center gap-2 rounded-full border border-line/70 bg-surface px-3 py-2 text-sm transition hover:border-accent/50 disabled:opacity-40"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-full border border-line/70 bg-surface px-3 py-2 text-sm transition hover:border-accent/50"
          >
            <Printer size={14} /> Imprimir
          </button>
        </div>
      </Cabecalho>

      <SeletorPeriodo
        periodo={periodo}
        onMudar={setPeriodo}
        todosClientes={todosClientes}
        onTodosClientes={setTodosClientes}
        qtdClientes={projetos.length}
      />

      <p className="mb-4 text-sm text-muted">
        {fmt(periodo.de, { day: "numeric", month: "short", year: "numeric" })} a{" "}
        {fmt(periodo.ate, { day: "numeric", month: "short", year: "numeric" })} ({dias} dia
        {dias === 1 ? "" : "s"}) · comparado com {fmt(anterior.de, { day: "numeric", month: "short" })} a{" "}
        {fmt(anterior.ate, { day: "numeric", month: "short" })}
        {todosClientes ? ` · ${projetos.length} clientes` : projeto ? ` · ${projeto.nome}` : ""}
      </p>

      {atual.isError && (
        <Card>
          <Vazio>Não consegui montar o relatório: {(atual.error as Error).message}</Vazio>
        </Card>
      )}

      {!atual.isError && (
        <>
          <Secao titulo="CRM" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Leads" valor={r?.crm.leads} antes={b?.crm.leads} destaque />
            <Indicador rotulo="Leads completos" valor={r?.crm.completos} antes={b?.crm.completos} />
            <Indicador rotulo="Aberturas do form" valor={r?.crm.aberturas} antes={b?.crm.aberturas} />
            <Indicador
              rotulo="Conversão"
              valor={r?.crm.conversao}
              antes={b?.crm.conversao}
              sufixo="%"
              /* Taxa já é relativa: comparar sua variação percentual confunde
                 mais do que ajuda. Mostramos a diferença em pontos. */
              emPontos
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card titulo="De onde vieram">
              <Ranking
                itens={r?.crm.porFonte.map((f) => ({ rotulo: f.fonte, valor: f.total })) ?? []}
                vazio="Nenhum lead no período."
              />
            </Card>
            <Card titulo="Formatos publicados">
              <Ranking
                itens={
                  r?.conteudo.porFormato.map((f) => ({
                    rotulo: FORMATO_LABEL[f.formato] ?? f.formato,
                    valor: f.total,
                  })) ?? []
                }
                vazio="Nenhum conteúdo no período."
              />
            </Card>
          </div>

          <Secao titulo="Conteúdo" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Planejados" valor={r?.conteudo.total} antes={b?.conteudo.total} destaque />
            <Indicador rotulo="Publicados" valor={r?.conteudo.publicados} antes={b?.conteudo.publicados} />
            <Indicador rotulo="Em aprovação" valor={r?.conteudo.emAprovacao} antes={b?.conteudo.emAprovacao} />
            <Indicador
              rotulo="Atrasados"
              valor={r?.conteudo.atrasados}
              antes={b?.conteudo.atrasados}
              /* Aqui crescer é ruim: o verde/vermelho inverte. */
              menorEhMelhor
            />
          </div>

          {todosClientes && (
            <>
              <Secao titulo="Por cliente" />
              <TabelaClientes relatorio={r} projetos={projetos} />
            </>
          )}
        </>
      )}
    </>
  );
}

function Secao({ titulo }: { titulo: string }) {
  return (
    <h2 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">{titulo}</h2>
  );
}

function SeletorPeriodo({
  periodo,
  onMudar,
  todosClientes,
  onTodosClientes,
  qtdClientes,
}: {
  periodo: Periodo;
  onMudar: (p: Periodo) => void;
  todosClientes: boolean;
  onTodosClientes: (v: boolean) => void;
  qtdClientes: number;
}) {
  const campo =
    "rounded-xl border border-line/70 bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent/70";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 nao-imprime">
      {atalhos().map(({ rotulo, periodo: p }) => {
        const ativo = p.de === periodo.de && p.ate === periodo.ate;
        return (
          <button
            key={rotulo}
            onClick={() => onMudar(p)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              ativo
                ? "border-accent/60 bg-gold/10 font-medium text-accent"
                : "border-line/70 bg-surface text-muted hover:text-ink"
            }`}
          >
            {rotulo}
          </button>
        );
      })}

      <span className="mx-1 hidden h-5 w-px bg-line/70 sm:block" />

      <input
        type="date"
        value={periodo.de}
        max={periodo.ate}
        onChange={(e) => e.target.value && onMudar({ ...periodo, de: e.target.value })}
        className={campo}
      />
      <span className="text-sm text-muted">até</span>
      <input
        type="date"
        value={periodo.ate}
        min={periodo.de}
        onChange={(e) => e.target.value && onMudar({ ...periodo, ate: e.target.value })}
        className={campo}
      />

      {qtdClientes > 1 && (
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={todosClientes}
            onChange={(e) => onTodosClientes(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-gold"
          />
          Todos os clientes
        </label>
      )}
    </div>
  );
}

/** KPI com a variação contra a janela anterior de mesmo tamanho. */
function Indicador({
  rotulo,
  valor,
  antes,
  sufixo = "",
  destaque = false,
  menorEhMelhor = false,
  emPontos = false,
}: {
  rotulo: string;
  valor: number | null | undefined;
  antes: number | null | undefined;
  sufixo?: string;
  destaque?: boolean;
  /** Inverte as cores: em "Atrasados", subir é ruim. */
  menorEhMelhor?: boolean;
  /** Para taxas: mostra a diferença em pontos, não a variação relativa. */
  emPontos?: boolean;
}) {
  const carregando = valor === undefined;
  const delta =
    valor == null || antes == null ? null : emPontos ? Math.round((valor - antes) * 10) / 10 : variacao(valor, antes);
  const subiu = delta != null && delta > 0;
  const bom = delta === 0 || delta == null ? null : menorEhMelhor ? !subiu : subiu;

  return (
    <div
      className={
        destaque
          ? "rounded-2xl bg-gold px-5 py-4 text-white"
          : "rounded-2xl border border-line/70 bg-surface px-5 py-4"
      }
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${destaque ? "text-white" : "text-muted"}`}
      >
        {rotulo}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold ${destaque ? "text-white" : "text-ink"}`}>
        {carregando ? "—" : valor == null ? "—" : `${valor}${sufixo}`}
      </p>
      <p
        className={`mt-0.5 text-xs ${
          destaque
            ? "text-white"
            : bom === null
              ? "text-muted"
              : bom
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {delta == null
          ? "sem base de comparação"
          : delta === 0
            ? "igual ao período anterior"
            : emPontos
              ? `${delta > 0 ? "+" : ""}${delta} p.p. vs. anterior`
              : `${delta > 0 ? "+" : ""}${delta}% vs. anterior`}
      </p>
    </div>
  );
}

/** Lista ordenada com barra proporcional — leitura rápida de participação. */
function Ranking({ itens, vazio }: { itens: { rotulo: string; valor: number }[]; vazio: string }) {
  if (!itens.length) return <Vazio>{vazio}</Vazio>;
  const maior = Math.max(...itens.map((i) => i.valor));
  const soma = itens.reduce((t, i) => t + i.valor, 0);

  return (
    <div className="space-y-3">
      {itens.slice(0, 8).map((i) => (
        <div key={i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-ink">{i.rotulo}</span>
            <span className="shrink-0 text-muted">
              {i.valor} · {Math.round((i.valor / soma) * 100)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-gold" style={{ width: `${(i.valor / maior) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TabelaClientes({
  relatorio,
  projetos,
}: {
  relatorio: { crm: { porProjeto: Record<string, { leads: number; completos: number }> }; conteudo: { porProjeto: Record<string, { total: number; publicados: number }> } } | undefined;
  projetos: { id: string; nome: string }[];
}) {
  if (!relatorio) return <Card><Vazio>Carregando…</Vazio></Card>;

  const linhas = projetos
    .map((p) => ({
      nome: p.nome,
      leads: relatorio.crm.porProjeto[p.id]?.leads ?? 0,
      completos: relatorio.crm.porProjeto[p.id]?.completos ?? 0,
      conteudos: relatorio.conteudo.porProjeto[p.id]?.total ?? 0,
      publicados: relatorio.conteudo.porProjeto[p.id]?.publicados ?? 0,
    }))
    .sort((a, b) => b.leads - a.leads || b.conteudos - a.conteudos);

  if (!linhas.length) return <Card><Vazio>Nenhum cliente.</Vazio></Card>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line/70 bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line/70 bg-base/40 text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 text-right font-medium">Leads</th>
            <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Completos</th>
            <th className="px-4 py-3 text-right font-medium">Conteúdos</th>
            <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Publicados</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="border-b border-line/40 last:border-0">
              <td className="px-4 py-3 text-ink">{l.nome}</td>
              <td className="px-4 py-3 text-right font-medium text-ink">{l.leads}</td>
              <td className="hidden px-4 py-3 text-right text-muted sm:table-cell">{l.completos}</td>
              <td className="px-4 py-3 text-right font-medium text-ink">{l.conteudos}</td>
              <td className="hidden px-4 py-3 text-right text-muted sm:table-cell">{l.publicados}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
