import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { AreaChart } from "@/components/ds/area-chart";
import { CampaignSelector, periodoDaCampanha } from "@/components/ds/campaign-selector";
import { Card, EmptyState, HighlightCard, Variacao } from "@/components/ds/card";
import { MenuSelect, Tabs } from "@/components/ds/controles";
import { ListaStatus, SegmentedBars } from "@/components/ds/segmented-bars";
import { StatusBadge } from "@/components/ds/status-badge";
import { ModuloDesativado } from "@/components/modulo";
import { usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { capitalizar, deYmd, fmt, hhmm, semanaDe, somarDias, ymd } from "@/lib/datas";
import {
  conteudosQuery,
  faltaTabelaConteudos,
  resumoPeriodoQuery,
  serieQuery,
  tarefasQuery,
} from "@/lib/queries";
import { COR_LEAD, COR_POST } from "@/lib/status";
import type { Conteudo, Rede, Status, StatusConteudo, Tarefa } from "@/lib/types";
import { FORMATO_LABEL, modulosDe, STATUS_CONTEUDO_LABEL, STATUS_LABEL } from "@/lib/types";
import { useUsuario } from "@/lib/usuario";

export const Route = createFileRoute("/_authed/")({ component: Dashboard });

const STATUS_LEAD = Object.keys(STATUS_LABEL) as Status[];
const STATUS_POST = Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[];

/** Como as redes aparecem na tabela de próximas postagens. */
const REDE_CURTA: Record<Rede, string> = {
  instagram: "IG",
  facebook: "FB",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  pinterest: "Pinterest",
  outro: "Outra",
};

const PERIODOS = [7, 30, 90].map((d) => ({ valor: d, rotulo: `Últimos ${d} dias` }));
const JANELAS = [7, 14, 30].map((d) => ({ valor: d, rotulo: `${d} dias` }));

const inteiro = (n: number) => n.toLocaleString("pt-BR");
/** "54,7%": uma casa, com vírgula. */
const pct = (parte: number, todo: number) =>
  `${(todo > 0 ? Math.min(100, (100 * parte) / todo) : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

/** "Seg" a partir de "seg." */
const semPonto = (s: string) => capitalizar(s.replace(".", ""));

function Dashboard() {
  const { projeto } = usePainel();
  const mods = modulosDe(projeto);
  const usuario = useUsuario();

  const hoje = ymd(new Date());
  const hora = new Date().getHours();
  const saudacao =
    (hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite") +
    (usuario.primeiroNome ? `, ${capitalizar(usuario.primeiroNome)}` : "");
  // "Segunda, 5 de outubro"
  const dataDeHoje = `${capitalizar(fmt(hoje, { weekday: "long" }).replace("-feira", ""))}, ${fmt(hoje, {
    day: "numeric",
    month: "long",
  })}`;

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo={saudacao}
        subtitulo={
          projeto
            ? `${dataDeHoje} · o que está acontecendo com ${projeto.nome}`
            : "Escolha um cliente no menu para ver os números dele."
        }
      />

      {/* Módulo não contratado: no lugar dos números, o aviso do que falta. */}
      {mods.crm ? <AreaCrm comConteudo={mods.conteudo} /> : <ModuloDesativado modulo="crm" compacto />}
      {mods.conteudo ? <AreaConteudo hoje={hoje} /> : <ModuloDesativado modulo="conteudo" compacto />}

    </div>
  );
}

/* ── CRM: campanha, leads de hoje, funil do formulário, série e status ──
   As bases de flex (324, 526, 606, 366) são as do design somadas ao padding
   e à borda: lá os cards são content-box, e `flex: 1 1 280px` mede só o
   miolo. É o que decide em que largura um card desce para a linha de baixo. */

function AreaCrm({ comConteudo }: { comConteudo: boolean }) {
  const { projeto, campanha } = usePainel();
  const hoje = ymd(new Date());

  /** Recorte quando nenhuma campanha está escolhida. */
  const [diasPeriodo, setDiasPeriodo] = useState(30);
  const [diasSerie, setDiasSerie] = useState(14);
  const [serieAtiva, setSerieAtiva] = useState<"enviados" | "parciais">("enviados");

  // Com campanha, o período é o dela; sem, os últimos N dias até hoje.
  const de = campanha ? campanha.inicio : somarDias(hoje, -(diasPeriodo - 1));
  const ate = campanha ? campanha.fim : hoje;
  const { data: resumo, isLoading: carregandoResumo } = useQuery(resumoPeriodoQuery(projeto?.id, de, ate));

  // Mesmo tamanho, logo antes: é contra ele que a conversão sobe ou desce.
  // Campanha de ponta aberta não tem "período anterior" que faça sentido.
  const tamanho = de && ate ? Math.round((deYmd(ate).getTime() - deYmd(de).getTime()) / 864e5) + 1 : null;
  const { data: anterior } = useQuery({
    ...resumoPeriodoQuery(projeto?.id, de && tamanho ? somarDias(de, -tamanho) : null, de ? somarDias(de, -1) : null),
    enabled: Boolean(projeto?.id) && tamanho != null,
  });

  const { data: serie = [] } = useQuery(serieQuery(projeto?.id, campanha?.id ?? null, diasSerie));
  // "Hoje" é hoje, qualquer que seja a campanha escolhida no seletor.
  const { data: doisDias = [] } = useQuery(serieQuery(projeto?.id, null, 2));
  const leadsHoje = doisDias.at(-1)?.completos ?? 0;
  const diferenca = leadsHoje - (doisDias.at(-2)?.completos ?? 0);

  const aberturas = resumo?.aberturas ?? 0;
  const iniciaram = resumo?.iniciaram ?? 0;
  const enviaram = resumo?.enviaram ?? 0;
  // Abertura sem registro (bloqueador de script) não pode gerar desistência negativa.
  const desistiram = Math.max(0, aberturas - enviaram);
  const conversao = aberturas > 0 ? Math.min(100, (100 * enviaram) / aberturas) : 0;
  const conversaoAntes =
    anterior && anterior.aberturas > 0 ? Math.min(100, (100 * anterior.enviaram) / anterior.aberturas) : null;
  const pp = conversaoAntes != null && aberturas > 0 ? conversao - conversaoAntes : null;

  const rotuloPeriodo = campanha ? periodoDaCampanha(campanha) : `${diasPeriodo} dias`;

  const etapas = [
    { rotulo: "Abriram", n: aberturas, taxa: "100%", ponto: "#1C2E45" },
    { rotulo: "Começaram", n: iniciaram, taxa: `${pct(iniciaram, aberturas)} de quem abriu`, ponto: "#1A66C2" },
    { rotulo: "Enviaram", n: enviaram, taxa: `${pct(enviaram, iniciaram)} de quem começou`, ponto: "#9CC0EA" },
  ];

  const fatias = STATUS_LEAD.map((s) => ({
    rotulo: STATUS_LABEL[s],
    valor: resumo?.porStatus[s] ?? 0,
    cor: COR_LEAD[s].serie,
  }));

  const pontos = serie.map((d, i) => {
    const virouMes = i === 0 || d.dia.slice(5, 7) !== serie[i - 1]!.dia.slice(5, 7);
    return {
      eixo: virouMes ? `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` : d.dia.slice(8, 10),
      titulo: `${semPonto(fmt(d.dia, { weekday: "short" }))}, ${d.dia.slice(8, 10)} ${fmt(d.dia, { month: "short" }).replace(".", "")}`,
      valor: serieAtiva === "enviados" ? d.completos : d.parciais,
    };
  });

  return (
    <>
      <CampaignSelector leadsDaCampanha={enviaram} periodoPadrao={`dos últimos ${diasPeriodo} dias`} />

      <div className="flex flex-wrap gap-4">
        <HighlightCard className="flex-[1_1_324px]">
          <span className="text-[13px] font-semibold text-[#DCE8F7]">Leads hoje</span>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[40px] font-extrabold leading-none tracking-[-0.02em]">{inteiro(leadsHoje)}</span>
            <Variacao sobreDegrade>
              {diferenca === 0 ? "igual a ontem" : `${diferenca > 0 ? "+" : "−"}${Math.abs(diferenca)} vs ontem`}
            </Variacao>
          </div>
          <div className="mt-auto flex gap-2.5">
            <Link to="/leads" className="btn btn-claro btn-pilula flex-1">
              Ver leads
            </Link>
            {comConteudo && (
              <Link to="/calendario" search={{ novo: true }} className="btn btn-escuro btn-pilula flex-1">
                Nova postagem
              </Link>
            )}
          </div>
        </HighlightCard>

        <Card
          className="flex-[2_1_526px]"
          titulo="Formulário das landing pages"
          acao={
            campanha ? (
              <span className="text-[12px] text-texto-3">{rotuloPeriodo}</span>
            ) : (
              <MenuSelect valor={diasPeriodo} opcoes={PERIODOS} onChange={setDiasPeriodo} rotulo="Período" />
            )
          }
        >
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr))]">
            {etapas.map((e) => (
              <div key={e.rotulo} className="flex flex-col gap-2 rounded-[14px] border border-borda p-3.5">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-texto-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: e.ponto }} />
                  {e.rotulo}
                </span>
                <span className="text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
                  <Numero carregando={carregandoResumo}>{inteiro(e.n)}</Numero>
                </span>
                <span className="self-start rounded-full bg-gelo px-2 py-[3px] text-[11px] font-bold text-texto-2">
                  {e.taxa}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex-[1_1_326px] gap-2.5" titulo="Conversão do formulário">
          <span className="-mt-1 text-[12px] text-texto-3">Quem enviou, sobre quem abriu</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[32px] font-extrabold leading-tight tracking-[-0.02em]">
              <Numero carregando={carregandoResumo}>{pct(enviaram, aberturas)}</Numero>
            </span>
            {pp != null && Math.abs(pp) >= 0.05 && (
              <Variacao tom={pp > 0 ? "bom" : "ruim"}>
                {pp > 0 ? "↑" : "↓"} {Math.abs(pp).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.
              </Variacao>
            )}
          </div>
          <div className="mt-auto flex h-7 gap-1" aria-hidden="true">
            {aberturas > 0 ? (
              <>
                <div className="min-w-1 rounded-lg bg-marinho" style={{ flex: Math.max(conversao, 1) }} />
                <div className="min-w-1 rounded-lg bg-[#B9D2EF]" style={{ flex: Math.max(100 - conversao, 1) }} />
              </>
            ) : (
              <div className="flex-1 rounded-lg bg-gelo" />
            )}
          </div>
          <div className="flex justify-between gap-2 text-[11px] font-semibold text-texto-3">
            {aberturas > 0 ? (
              <>
                <span>
                  {inteiro(enviaram)} {enviaram === 1 ? "enviou" : "enviaram"}
                </span>
                <span>
                  {inteiro(desistiram)} {desistiram === 1 ? "desistiu" : "desistiram"}
                </span>
              </>
            ) : (
              <span>Ninguém abriu o formulário neste período.</span>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card
          className="flex-[2_1_606px] gap-4"
          titulo="Leads por dia"
          acao={<MenuSelect valor={diasSerie} opcoes={JANELAS} onChange={setDiasSerie} rotulo="Janela do gráfico" />}
        >
          <Tabs
            rotulo="Série"
            valor={serieAtiva}
            onChange={setSerieAtiva}
            abas={[
              { id: "enviados", rotulo: "Leads enviados" },
              { id: "parciais", rotulo: "Leads parciais" },
            ]}
          />
          {pontos.length >= 2 ? (
            <AreaChart
              pontos={pontos}
              unidade={(n) =>
                serieAtiva === "enviados"
                  ? `${inteiro(n)} ${n === 1 ? "lead" : "leads"}`
                  : `${inteiro(n)} ${n === 1 ? "parcial" : "parciais"}`
              }
              descricao={`${serieAtiva === "enviados" ? "Leads enviados" : "Leads parciais"} por dia nos últimos ${diasSerie} dias`}
            />
          ) : (
            <div className="h-[204px]" />
          )}
        </Card>

        <Card
          className="flex-[1_1_366px]"
          titulo="Leads por status"
          acao={<span className="text-[12px] text-texto-3">{rotuloPeriodo}</span>}
        >
          <SegmentedBars fatias={fatias} />
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]">
              <Numero carregando={carregandoResumo}>{inteiro(enviaram)}</Numero>
            </span>
            <span className="text-[13px] text-texto-3">{enviaram === 1 ? "lead no período" : "leads no período"}</span>
          </div>
          <ListaStatus fatias={fatias} />
        </Card>
      </div>
    </>
  );
}

/* ── Conteúdo: semana do calendário, mês em números, próximas postagens ── */

function AreaConteudo({ hoje }: { hoje: string }) {
  const { projeto } = usePainel();

  // Uma consulta só cobre a semana, o mês e as próximas postagens.
  const semana = semanaDe(hoje);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const fimMes = ymd(new Date(deYmd(hoje).getFullYear(), deYmd(hoje).getMonth() + 1, 0));
  const de = [semana[0]!, inicioMes].sort()[0]!;
  const ate = [semana[6]!, fimMes, somarDias(hoje, 30)].sort().at(-1)!;

  const { data: conteudos = [], error, isLoading } = useQuery(conteudosQuery(projeto?.id, de, ate));
  // Tarefa é complemento: se a tabela dela não existir, a semana segue só com os posts.
  const { data: tarefas = [] } = useQuery(tarefasQuery(projeto?.id, semana[0]!, semana[6]!));

  if (error) {
    return (
      <Card>
        <EmptyState icone={<CalendarDays size={20} strokeWidth={1.8} aria-hidden />} titulo="Calendário indisponível">
          {faltaTabelaConteudos(error)
            ? "O calendário de conteúdo ainda não foi ativado no banco deste portal."
            : `Não consegui carregar os conteúdos: ${(error as Error).message}`}
        </EmptyState>
      </Card>
    );
  }

  const mes = hoje.slice(0, 7);
  const doMes = conteudos.filter((c) => c.data.startsWith(mes));
  const proximas = conteudos.filter((c) => c.data >= hoje).slice(0, 5);
  const fatias = STATUS_POST.map((s) => ({
    rotulo: STATUS_CONTEUDO_LABEL[s],
    valor: doMes.filter((c) => c.status === s).length,
    cor: COR_POST[s].serie,
  }));
  const publicados = doMes.filter((c) => c.status === "publicado").length;
  const emAprovacao = doMes.filter((c) => c.status === "aprovacao").length;

  // "Semana de 4 a 10 de outubro" · "Semana de 28 de setembro a 4 de outubro"
  const [a, b] = [semana[0]!, semana[6]!];
  const tituloSemana =
    a.slice(0, 7) === b.slice(0, 7)
      ? `Semana de ${deYmd(a).getDate()} a ${fmt(b, { day: "numeric", month: "long" })}`
      : `Semana de ${fmt(a, { day: "numeric", month: "long" })} a ${fmt(b, { day: "numeric", month: "long" })}`;

  return (
    <>
      <Card
        aria-label="Calendário de postagens"
        className="gap-[18px]"
        titulo="Calendário de postagens"
        subtitulo={tituloSemana}
        acao={
          <div className="flex gap-2">
            <Link to="/calendario" className="btn btn-secundario btn-40">
              Abrir calendário
            </Link>
            <Link to="/calendario" search={{ novo: true }} className="btn btn-primario btn-40">
              <Plus size={14} strokeWidth={2.2} aria-hidden />
              Nova postagem
            </Link>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-2.5">
            {semana.map((dia) => (
              <DiaDaSemana
                key={dia}
                dia={dia}
                hoje={dia === hoje}
                posts={conteudos.filter((c) => c.data === dia)}
                tarefas={tarefas.filter((t) => t.data === dia)}
              />
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-4">
        <Card className="flex-[1_1_366px]" titulo={`${capitalizar(fmt(hoje, { month: "long" }))} em números`}>
          <div className="flex items-baseline gap-2">
            <span className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]">
              <Numero carregando={isLoading}>{inteiro(doMes.length)}</Numero>
            </span>
            <span className="text-[13px] text-texto-3">{doMes.length === 1 ? "post planejado" : "posts planejados"}</span>
          </div>
          <SegmentedBars fatias={fatias} />
          <ListaStatus fatias={fatias} />
          <span className="mt-auto border-t border-borda-campo pt-2.5 text-[12px] leading-normal text-texto-2">
            {doMes.length === 0 ? (
              "Nada planejado para este mês ainda."
            ) : (
              <>
                <strong className="text-marinho">
                  {publicados} de {doMes.length}
                </strong>{" "}
                já {publicados === 1 ? "publicado" : "publicados"}.{" "}
                {emAprovacao > 0 && (
                  <>
                    <strong className="text-marinho">{emAprovacao}</strong>{" "}
                    {emAprovacao === 1 ? "espera" : "esperam"} o cliente aprovar.
                  </>
                )}
              </>
            )}
          </span>
        </Card>

        <Card
          className="flex-[2_1_606px]"
          titulo="Próximas postagens"
          acao={
            <Link to="/calendario" className="btn btn-secundario btn-36">
              Abrir calendário
            </Link>
          }
        >
          {proximas.length === 0 ? (
            <EmptyState icone={<CalendarDays size={20} strokeWidth={1.8} aria-hidden />} titulo="Nenhuma postagem pela frente">
              {isLoading ? "Carregando…" : "Nada programado de hoje até os próximos 30 dias."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[600px] flex-col" role="table" aria-label="Próximas postagens">
                <div
                  role="row"
                  className="grid grid-cols-[90px_2.4fr_1fr_1fr_1.1fr] gap-3.5 rounded-[10px] bg-superficie-2 px-3.5 py-2.5 text-[11px] font-bold text-texto-3"
                >
                  {["Data", "Post", "Formato", "Redes", "Status"].map((c) => (
                    <span key={c} role="columnheader">
                      {c}
                    </span>
                  ))}
                </div>
                {proximas.map((c) => (
                  <LinhaPost key={c.id} c={c} />
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function DiaDaSemana({
  dia,
  hoje,
  posts,
  tarefas,
}: {
  dia: string;
  hoje: boolean;
  posts: Conteudo[];
  tarefas: Tarefa[];
}) {
  const vazio = posts.length === 0 && tarefas.length === 0;
  return (
    <div
      className={`flex min-h-[220px] flex-col gap-2 rounded-[14px] border p-3 ${
        hoje ? "border-azul bg-azul-claro" : "border-borda bg-white"
      }`}
      aria-current={hoje ? "date" : undefined}
    >
      <span className="flex flex-col gap-0.5">
        <span className={`text-[10px] font-bold tracking-[0.08em] ${hoje ? "text-azul" : "text-texto-3"}`}>
          {fmt(dia, { weekday: "short" }).replace(".", "").toUpperCase()}
        </span>
        <span className={`text-[20px] font-extrabold leading-tight ${hoje ? "text-azul" : "text-marinho"}`}>
          {dia.slice(8, 10)}
        </span>
      </span>

      {posts.map((c) => {
        const cor = COR_POST[c.status];
        const meta = [hhmm(c.hora), FORMATO_LABEL[c.formato].toUpperCase()].filter(Boolean).join(" · ");
        return (
          <Link
            key={c.id}
            to="/postagens"
            search={{ abrir: c.id }}
            title={`${c.titulo} (${STATUS_CONTEUDO_LABEL[c.status]})`}
            className="chip-post flex flex-col gap-[3px] rounded-[10px] border px-2.5 py-2 no-underline"
            style={{ background: cor.fundo, color: cor.texto, borderColor: cor.fundo }}
          >
            <span className="text-[10px] font-bold">{meta}</span>
            <span className="line-clamp-4 text-[12px] font-semibold leading-[1.35]">{c.titulo}</span>
          </Link>
        );
      })}

      {/* Tarefa não é post: contorno tracejado, sem cor de status. */}
      {tarefas.map((t) => (
        <Link
          key={t.id}
          to="/calendario"
          title={t.titulo}
          className="chip-post flex flex-col gap-[3px] rounded-[10px] border border-dashed border-nevoa bg-white px-2.5 py-2 text-[#4A5868] no-underline"
        >
          <span className="text-[10px] font-bold">TAREFA</span>
          <span className="line-clamp-4 text-[12px] font-semibold leading-[1.35]">{t.titulo}</span>
        </Link>
      ))}

      {vazio && <span className="text-[11px] text-texto-4">Sem posts</span>}
    </div>
  );
}

function LinhaPost({ c }: { c: Conteudo }) {
  return (
    <Link
      to="/postagens"
      search={{ abrir: c.id }}
      role="row"
      className="linha-tabela grid min-h-[58px] grid-cols-[90px_2.4fr_1fr_1fr_1.1fr] items-center gap-3.5 border-b border-gelo px-3.5 py-1.5 text-[13px] text-marinho no-underline"
    >
      <span role="cell" className="flex flex-col gap-0.5">
        <strong className="font-bold">
          {semPonto(fmt(c.data, { weekday: "short" }))}, {c.data.slice(8, 10)}/{c.data.slice(5, 7)}
        </strong>
        <span className="text-[11px] text-texto-3">{hhmm(c.hora) ?? "Sem horário"}</span>
      </span>
      <span role="cell" className="truncate font-semibold">
        {c.titulo}
      </span>
      <span role="cell" className="text-texto-2">
        {FORMATO_LABEL[c.formato]}
      </span>
      <span role="cell" className="text-texto-2">
        {c.redes.map((r) => REDE_CURTA[r]).join(" · ") || "Sem rede"}
      </span>
      <span role="cell">
        <StatusBadge tipo="post" status={c.status} />
      </span>
    </Link>
  );
}

/** Número que ainda está chegando: um traço pulsando no lugar, do mesmo tamanho. */
function Numero({ carregando, children }: { carregando: boolean; children: ReactNode }) {
  if (!carregando) return <>{children}</>;
  return <span className="atualizando inline-block h-[0.8em] w-[2.2em] rounded-md bg-gelo align-baseline" aria-label="Carregando" />;
}
