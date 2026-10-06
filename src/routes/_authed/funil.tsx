import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Download, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { CampaignSelector, corDaCampanha } from "@/components/ds/campaign-selector";
import { Card, HighlightCard, KpiCard } from "@/components/ds/card";
import {
  COR_ETAPA_CRM,
  COR_ETAPA_LP,
  FunnelChart,
  maiorQueda,
  porcento,
  type EtapaDoFunil,
  type ModoDaTaxa,
} from "@/components/ds/funnel-chart";
import { CampanhaBadge } from "@/components/ds/status-badge";
import { ModuloDesativado } from "@/components/modulo";
import { Cabecalho, usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { fmt, somarDias, ymd } from "@/lib/datas";
import { leadsDoFunilQuery, resumoPeriodoQuery, type LeadDoFunil, type ResumoPeriodo } from "@/lib/queries";
import { statusDaCampanha } from "@/lib/status";
import type { Campaign } from "@/lib/types";
import { modulosDe } from "@/lib/types";

export const Route = createFileRoute("/_authed/funil")({ component: Funil });

const PERIODOS = {
  "30": { rotulo: "Últimos 30 dias", frase: "dos últimos 30 dias" },
  "7": { rotulo: "Últimos 7 dias", frase: "dos últimos 7 dias" },
  mes: { rotulo: "Este mês", frase: "deste mês" },
  passado: { rotulo: "Mês passado", frase: "do mês passado" },
} as const;
type Periodo = keyof typeof PERIODOS;

function limitesDo(periodo: Periodo, hoje: string): { de: string; ate: string } {
  if (periodo === "mes") return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  if (periodo === "passado") {
    // O dia anterior ao primeiro deste mês é o último do mês passado.
    const fim = somarDias(`${hoje.slice(0, 7)}-01`, -1);
    return { de: `${fim.slice(0, 7)}-01`, ate: fim };
  }
  return { de: somarDias(hoje, -(Number(periodo) - 1)), ate: hoje };
}

const inteiro = (n: number) => n.toLocaleString("pt-BR");
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * As seis etapas, do topo ao fundo. As três da landing page são medidas pelo
 * script de captura. As três do CRM saem do status de hoje de cada lead: quem
 * está numa etapa passou pelas anteriores, então cada uma soma as seguintes.
 * Lead marcado como Perdido sai da conta do CRM, porque o banco não guarda
 * por quais etapas ele passou antes de se perder.
 */
function etapasDe(r: ResumoPeriodo): EtapaDoFunil[] {
  const convertido = r.porStatus.convertido;
  const noGrupo = r.porStatus.entrou_no_grupo + convertido;
  const comContato = r.porStatus.contato_feito + noGrupo;
  // O script só conta abertura de quem carregou a página com ele instalado:
  // lead antigo pode existir sem abertura, e o funil não pode alargar para baixo.
  const comecaram = Math.max(r.iniciaram, r.enviaram);
  const abriram = Math.max(r.aberturas, comecaram);
  return [
    { rotulo: "Abriram a página", dica: "Carregaram a landing page", n: abriram, cor: COR_ETAPA_LP, grupo: "LANDING PAGE" },
    { rotulo: "Começaram o formulário", dica: "Preencheram o primeiro campo", n: comecaram, cor: COR_ETAPA_LP },
    { rotulo: "Enviaram", dica: "Viraram lead no CRM", n: r.enviaram, cor: COR_ETAPA_LP },
    { rotulo: "Contato feito", dica: "A equipe chamou no WhatsApp", n: comContato, cor: COR_ETAPA_CRM, grupo: "CRM" },
    { rotulo: "Entrou no grupo", dica: "Entrou no grupo do WhatsApp", n: noGrupo, cor: COR_ETAPA_CRM },
    { rotulo: "Convertido", dica: "Fechou a venda", n: convertido, cor: COR_ETAPA_CRM },
  ];
}

/** Portão do módulo: sem CRM, a tela mostra o aviso em vez de consultar dados. */
function Funil() {
  const { projeto } = usePainel();
  if (!modulosDe(projeto).crm) {
    return (
      <>
        <Cabecalho titulo="Funil" comCampanha={false} />
        <ModuloDesativado modulo="crm" />
      </>
    );
  }
  return <FunilTela />;
}

function FunilTela() {
  const { projeto, campanha, campanhas, setCampanhaId } = usePainel();
  const hoje = ymd(new Date());
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [modo, setModo] = useState<ModoDaTaxa>("anterior");

  // Com campanha escolhida, o período é o dela.
  const { de, ate } = campanha ? { de: campanha.inicio, ate: campanha.fim } : limitesDo(periodo, hoje);
  const agendada = campanha ? statusDaCampanha(campanha, hoje) === "agendada" : false;

  const { data: resumo } = useQuery({ ...resumoPeriodoQuery(projeto?.id, de, ate), enabled: Boolean(projeto?.id) && !agendada });
  const { data: leads } = useQuery({ ...leadsDoFunilQuery(projeto?.id, de, ate), enabled: Boolean(projeto?.id) && !agendada });
  // Uma leitura por campanha, para a tabela de comparação.
  const porCampanha = useQueries({
    queries: campanhas.map((c) => ({
      ...resumoPeriodoQuery(projeto?.id, c.inicio, c.fim),
      enabled: Boolean(projeto?.id) && statusDaCampanha(c, hoje) !== "agendada",
    })),
  });

  const etapas = resumo ? etapasDe(resumo) : null;
  const temDados = Boolean(etapas && etapas[0]!.n > 0);
  const [abriram, comecaram, enviaram, , , convertidos] = (etapas ?? []).map((e) => e.n) as number[];
  const pior = etapas ? maiorQueda(etapas) : -1;

  // Investimento: o da campanha escolhida, ou a soma das que caem no período.
  const investimento = campanha
    ? (campanha.investimento ?? null)
    : somarInvestimento(campanhas.filter((c) => (!c.fim || c.fim >= de!) && (!c.inicio || c.inicio <= ate!)));

  const nome = projeto?.nome ?? "seu cliente";
  const frase = campanha ? `na campanha ${campanha.nome}` : PERIODOS[periodo].frase;

  function exportar() {
    if (!etapas) return;
    const celula = (v: unknown) => {
      const texto = String(v ?? "");
      // Nome de campanha é texto livre: não pode virar fórmula no Excel.
      const neutro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
      return `"${neutro.replace(/"/g, '""')}"`;
    };
    const linhas: unknown[][] = [
      [`Funil de ${nome}`, campanha ? campanha.nome : PERIODOS[periodo].rotulo],
      [],
      ["Etapa", "Pessoas", "Da etapa anterior", "Do total", "Saíram"],
      ...etapas.map((e, i) => {
        const antes = i ? etapas[i - 1]!.n : e.n;
        return [e.rotulo, e.n, i ? porcento(e.n, antes) : "100%", i ? porcento(e.n, etapas[0]!.n) : "100%", i ? antes - e.n : 0];
      }),
      [],
      ["Campanha", "Abriram", "Enviaram", "Envio do formulário", "Convertidos", "Conversão total", "Custo por lead"],
      ...campanhas.map((c, i) => {
        const r = porCampanha[i]?.data;
        if (!r) return [c.nome, "-", "-", "-", "-", "-", "-"];
        const e = etapasDe(r).map((x) => x.n);
        return [
          c.nome,
          e[0],
          e[2],
          porcento(e[2]!, e[0]!),
          e[5],
          porcento(e[5]!, e[0]!),
          c.investimento && e[2] ? reais(c.investimento / e[2]) : "-",
        ];
      }),
    ];
    const csv = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `funil-${projeto?.slug ?? "cliente"}-${hoje}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Funil"
        selo={campanha ? campanha.nome : PERIODOS[periodo].rotulo}
        subtitulo={`Onde ${nome} ganha e perde gente, da landing page até a venda`}
        acoes={
          <>
            {!campanha && (
              <label className="campo flex items-center gap-2 px-3 text-[12px] font-semibold text-texto-3">
                Período
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value as Periodo)}
                  className="cursor-pointer border-0 bg-transparent text-[13px] font-bold text-marinho outline-none"
                >
                  {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
                    <option key={p} value={p}>
                      {PERIODOS[p].rotulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" onClick={exportar} disabled={!temDados} className="btn btn-escuro px-4">
              <Download size={16} strokeWidth={1.9} aria-hidden />
              Exportar relatório
            </button>
          </>
        }
      />

      <CampaignSelector leadsDaCampanha={enviaram ?? 0} periodoPadrao={PERIODOS[periodo].frase} assunto="funil" />

      {/* Indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HighlightCard className="!gap-2.5">
          <span className="relative text-[13px] font-semibold text-[#DCE8F7]">Conversão total</span>
          <span className="relative text-[38px] font-extrabold leading-tight tracking-[-0.02em]">
            {temDados ? porcento(convertidos!, abriram!) : "-"}
          </span>
          <span className="relative text-[12px] leading-[1.45] text-azul-claro-2">
            {agendada
              ? "Campanha agendada"
              : temDados
                ? `${inteiro(convertidos!)} de ${inteiro(abriram!)} que abriram a página viraram venda`
                : etapas
                  ? "Sem visitas no período"
                  : "Calculando…"}
          </span>
        </HighlightCard>
        <KpiCard
          className="!p-[22px]"
          rotulo="Envio do formulário"
          valor={temDados ? porcento(enviaram!, abriram!) : "-"}
          contexto={temDados ? `${inteiro(enviaram!)} enviaram · ${inteiro(comecaram! - enviaram!)} pararam no meio` : "Sem dados ainda"}
        />
        <KpiCard
          className="!p-[22px]"
          rotulo="Custo por lead"
          valor={temDados && investimento && enviaram ? reais(investimento / enviaram) : "-"}
          contexto={
            !temDados
              ? "Sem dados ainda"
              : investimento
                ? `Investimento de ${reais(investimento)} informado ${campanha ? "na campanha" : "nas campanhas do período"}`
                : "Informe o investimento na campanha para calcular"
          }
        />
        <div className="flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-borda bg-white p-[22px]">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-texto-3">Maior queda</span>
            {pior > 0 && (
              <span className="flex items-center gap-[5px] whitespace-nowrap rounded-full bg-alerta-fundo px-2 py-[3px] text-[11px] font-bold text-alerta">
                <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />
                Atenção
              </span>
            )}
          </span>
          {pior > 0 && etapas ? (
            <>
              <span className="text-[20px] font-extrabold leading-[1.3]">
                {etapas[pior - 1]!.rotulo.split(" ")[0]} → {etapas[pior]!.rotulo.split(" ")[0]}
              </span>
              <span className="text-[12px] leading-[1.45] text-texto-3">
                {inteiro(etapas[pior - 1]!.n - etapas[pior]!.n)} pessoas ({porcento(etapas[pior - 1]!.n - etapas[pior]!.n, etapas[pior - 1]!.n)})
                saíram nessa etapa
              </span>
            </>
          ) : (
            <>
              <span className="text-[20px] font-extrabold leading-[1.3]">Sem dados</span>
              <span className="text-[12px] leading-[1.45] text-texto-3">
                {agendada ? "Aparece quando a campanha começar" : "Aparece quando chegarem as primeiras visitas"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Funil completo */}
      <section className="flex flex-col gap-[18px] rounded-[20px] border border-borda bg-white px-6 py-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[16px] font-bold">Funil completo</h2>
            <span className="text-[12px] text-texto-3">
              Da abertura da landing page até a venda. Passe o mouse numa barra para ver os detalhes.
            </span>
          </div>
          <div role="radiogroup" aria-label="Como calcular a taxa" className="flex gap-1 rounded-[12px] bg-gelo p-1">
            {(
              [
                ["anterior", "Sobre a etapa anterior"],
                ["total", "Sobre o total"],
              ] as [ModoDaTaxa, string][]
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={modo === id}
                onClick={() => setModo(id)}
                className={`min-h-9 whitespace-nowrap rounded-[9px] border-0 px-3.5 text-[12px] font-bold transition-[background-color,color,box-shadow] ${
                  modo === id ? "bg-white text-marinho shadow-[0_1px_3px_rgba(28,46,69,0.12)]" : "bg-transparent text-texto-3 hover:text-marinho"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {agendada && campanha ? (
          <Vazio titulo="Essa campanha ainda não começou">
            {campanha.nome} começa em {fmt(campanha.inicio!, { day: "2-digit", month: "2-digit" })}. O funil aparece aqui assim que chegarem as
            primeiras visitas.
          </Vazio>
        ) : !etapas ? (
          <Vazio titulo="Montando o funil…" />
        ) : !temDados ? (
          <Vazio titulo="Nenhuma visita neste período">
            O funil aparece aqui quando alguém abrir uma landing page com o script de captura instalado.
          </Vazio>
        ) : (
          <>
            <FunnelChart etapas={etapas} modo={modo} />
            <div className="flex flex-wrap gap-x-[18px] gap-y-2 border-t border-gelo pt-3 text-[12px] text-texto-3">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded" style={{ background: COR_ETAPA_LP }} />
                Etapas da landing page (medidas pelo script)
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded" style={{ background: COR_ETAPA_CRM }} />
                Etapas do CRM (status que a equipe marca)
              </span>
              <span className="sm:ml-auto">
                {inteiro(resumo!.porStatus.perdido)} {resumo!.porStatus.perdido === 1 ? "lead marcado" : "leads marcados"} como Perdido no período
              </span>
            </div>
          </>
        )}
      </section>

      {/* Comparar campanhas */}
      <section className="flex flex-col gap-3.5 rounded-[20px] border border-borda bg-white px-6 py-[22px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
          <h2 className="m-0 text-[16px] font-bold">Comparar campanhas</h2>
          {campanhas.length > 0 && <span className="text-[12px] text-texto-3">Clique numa linha para ver o funil dela</span>}
        </div>
        {campanhas.length === 0 ? (
          <Vazio titulo="Nenhuma campanha ainda">Crie uma campanha no seletor acima para comparar o desempenho de cada uma.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-[860px] flex-col">
              <div className={`${GRADE_CAMPANHAS} rounded-[12px] bg-superficie-2 px-3.5 py-2.5 text-[12px] font-bold text-texto-3`}>
                <span>Campanha</span>
                <span>Status</span>
                <span className="text-right">Abriram</span>
                <span className="text-right">Enviaram</span>
                <span className="text-right">Envio do form.</span>
                <span className="text-right">Convertidos</span>
                <span className="text-right">Conversão total</span>
                <span className="text-right">Custo por lead</span>
              </div>
              {campanhas.map((c, i) => (
                <LinhaDeCampanha
                  key={c.id}
                  campanha={c}
                  cor={corDaCampanha(campanhas, c.id)}
                  resumo={porCampanha[i]?.data}
                  hoje={hoje}
                  escolhida={campanha?.id === c.id}
                  // Clicar na campanha já escolhida volta para todas.
                  onEscolher={() => setCampanhaId(campanha?.id === c.id ? null : c.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <PorOrigem leads={agendada ? [] : leads} />
        <OndeParam leads={agendada ? [] : leads} />
        <Card titulo="Velocidade do primeiro contato" subtitulo="Quanto converte, conforme o tempo até a equipe chamar">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[14px] bg-superficie-2 px-4 py-8 text-center">
            <strong className="text-[14px]">Ainda sem medição</strong>
            <span className="max-w-[280px] text-[12px] leading-normal text-texto-3">
              O portal ainda não registra a hora em que o lead vira "Contato feito". Sem isso não dá para comparar quem foi chamado rápido
              com quem esperou.
            </span>
          </div>
          <span className="flex items-start gap-2 rounded-[12px] bg-azul-claro px-3 py-2.5 text-[12px] leading-normal">
            <Info size={16} strokeWidth={2} color="#1A66C2" aria-hidden className="mt-px flex-none" />
            Assim que esse registro existir, este card mostra a conversão de quem é chamado em até 1 hora, de 1h a 24h e depois de 24h.
          </span>
        </Card>
      </div>
    </div>
  );
}

const somarInvestimento = (lista: Campaign[]): number | null => {
  const informados = lista.filter((c) => c.investimento != null);
  return informados.length ? informados.reduce((t, c) => t + Number(c.investimento), 0) : null;
};

function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[16px] bg-superficie-2 px-5 py-12 text-center">
      <strong className="text-[15px]">{titulo}</strong>
      {children && <span className="max-w-[520px] text-[13px] leading-normal text-texto-3">{children}</span>}
    </div>
  );
}

/* ── Comparar campanhas ─────────────────────────────────────────────── */

const GRADE_CAMPANHAS = "grid grid-cols-[2.2fr_1fr_0.9fr_0.9fr_1.1fr_0.9fr_1.1fr_1fr] items-center gap-3.5";
/** Conversão total que enche a barrinha da tabela. */
const TETO_DA_BARRA = 0.08;

function LinhaDeCampanha({
  campanha: c,
  cor,
  resumo,
  hoje,
  escolhida,
  onEscolher,
}: {
  campanha: Campaign;
  cor: string;
  resumo: ResumoPeriodo | undefined;
  hoje: string;
  escolhida: boolean;
  onEscolher: () => void;
}) {
  const status = statusDaCampanha(c, hoje);
  const e = resumo ? etapasDe(resumo).map((x) => x.n) : null;
  const [abriram, , enviaram, , , convertidos] = e ?? [];
  const taxa = e && abriram ? convertidos! / abriram : 0;
  const num = (n: number | undefined) => (n == null ? "-" : inteiro(n));

  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-pressed={escolhida}
      className={`${GRADE_CAMPANHAS} min-h-14 rounded-[12px] border-0 border-b border-solid border-gelo px-3.5 py-1.5 text-left text-[13px] text-marinho transition-colors ${
        escolhida ? "bg-azul-claro shadow-[inset_0_0_0_1.5px_#1A66C2]" : "bg-transparent hover:bg-superficie-2"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5 font-bold">
        <span className="h-3 w-3 flex-none rounded-full" style={{ background: cor }} />
        <span className="truncate">{c.nome}</span>
      </span>
      <span>
        <CampanhaBadge status={status} />
      </span>
      <span className="text-right font-semibold">{num(abriram)}</span>
      <span className="text-right font-semibold">{num(enviaram)}</span>
      <span className="text-right font-semibold">{e && abriram ? porcento(enviaram!, abriram) : "-"}</span>
      <span className="text-right font-semibold">{num(convertidos)}</span>
      <span className="flex items-center justify-end gap-2 font-extrabold">
        <span className="h-1.5 w-[60px] overflow-hidden rounded-full bg-gelo">
          <span className="block h-1.5 rounded-full bg-azul" style={{ width: `${Math.min(100, (taxa / TETO_DA_BARRA) * 100)}%` }} />
        </span>
        {e && abriram ? porcento(convertidos!, abriram) : "-"}
      </span>
      <span className="text-right font-semibold">{c.investimento && enviaram ? reais(Number(c.investimento) / enviaram) : "-"}</span>
    </button>
  );
}

/* ── Por origem ─────────────────────────────────────────────────────── */

function PorOrigem({ leads }: { leads: LeadDoFunil[] | undefined }) {
  // Só quem enviou: é o lead que a equipe trabalha e que pode converter.
  const grupos = new Map<string, { leads: number; convertidos: number; meios: Map<string, number> }>();
  for (const l of leads ?? []) {
    if (!l.completo) continue;
    const fonte = l.utms?.utm_source?.trim().toLowerCase() || "direto";
    const g = grupos.get(fonte) ?? { leads: 0, convertidos: 0, meios: new Map() };
    g.leads++;
    if (l.status === "convertido") g.convertidos++;
    const meio = l.utms?.utm_medium?.trim().toLowerCase();
    if (meio) g.meios.set(meio, (g.meios.get(meio) ?? 0) + 1);
    grupos.set(fonte, g);
  }
  const linhas = [...grupos].sort((a, b) => b[1].leads - a[1].leads).slice(0, 6);
  const maior = linhas[0]?.[1].leads ?? 0;

  return (
    <Card titulo="Por origem" subtitulo="Leads e conversão por utm_source">
      {!leads ? (
        <Nota>Carregando…</Nota>
      ) : linhas.length === 0 ? (
        <Nota>Nenhum lead enviado neste período.</Nota>
      ) : (
        linhas.map(([fonte, g]) => {
          // O meio mais comum daquela fonte; "direto" é quem chegou sem UTM.
          const meio = fonte === "direto" ? "sem UTM" : ([...g.meios].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "");
          return (
            <div key={fonte} title={`${fonte}${meio ? ` / ${meio}` : ""}: ${g.leads} leads`} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-bold">
                  {fonte} <span className="font-medium text-texto-3">{meio}</span>
                </span>
                <span className="flex-none text-[12px] text-texto-2">
                  <strong className="text-marinho">{inteiro(g.leads)}</strong> leads ·{" "}
                  <strong className="text-marinho">{umaCasa((g.convertidos / g.leads) * 100)}%</strong> convertem
                </span>
              </span>
              <Barra pct={(g.leads / maior) * 100} cor="#1A66C2" />
            </div>
          );
        })
      )}
    </Card>
  );
}

/* ── Onde param no formulário ───────────────────────────────────────── */

function OndeParam({ leads }: { leads: LeadDoFunil[] | undefined }) {
  const parciais = (leads ?? []).filter((l) => !l.completo);
  const campos = new Map<string, number>();
  for (const l of parciais) if (l.parou_em) campos.set(l.parou_em, (campos.get(l.parou_em) ?? 0) + 1);
  const identificados = [...campos.values()].reduce((t, n) => t + n, 0);
  const linhas = [...campos].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maior = linhas[0]?.[1] ?? 0;

  return (
    <Card
      titulo="Onde param no formulário"
      subtitulo={
        !leads
          ? "Carregando…"
          : parciais.length === 0
            ? "Ninguém parou no meio do formulário neste período."
            : `${inteiro(parciais.length)} ${parciais.length === 1 ? "pessoa começou e não enviou" : "pessoas começaram e não enviaram"}. Último campo antes de parar:`
      }
    >
      {linhas.map(([campo, n]) => (
        <div key={campo} className="flex flex-col gap-1.5">
          <span className="flex justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate font-bold">{campo}</span>
            <span className="flex-none font-extrabold">{Math.round((n / identificados) * 100)}%</span>
          </span>
          <Barra pct={(n / maior) * 100} cor="#D98A1C" />
        </div>
      ))}
      {leads && parciais.length > 0 && identificados < parciais.length && (
        <Nota>
          {identificados === 0
            ? "O campo em que cada pessoa parou passou a ser registrado há pouco. Ele aparece aqui para os leads parciais novos."
            : `Em ${inteiro(parciais.length - identificados)} deles o campo não foi registrado.`}
        </Nota>
      )}
      <Link to="/leads" className="link mt-auto flex min-h-11 items-center gap-2 text-[13px] font-bold no-underline">
        Ver leads parciais
        <ArrowRight size={16} strokeWidth={2} aria-hidden />
      </Link>
    </Card>
  );
}

function Barra({ pct, cor }: { pct: number; cor: string }) {
  return (
    <span className="h-2.5 overflow-hidden rounded-full bg-gelo">
      <span className="block h-2.5 rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: cor }} />
    </span>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return <span className="rounded-[12px] bg-superficie-2 px-3 py-2.5 text-[12px] leading-normal text-texto-3">{children}</span>;
}
