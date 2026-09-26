import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, Pencil, Target } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { COR_STATUS_CAL, PilulasConteudo, StatusConteudoBadge } from "@/components/conteudo";
import { Dropdown } from "@/components/dropdown";
import { Cabecalho, usePainel } from "@/components/painel";
import { Modal } from "@/components/modal";
import { Card, StatusBadge, Vazio } from "@/components/ui";
import { DadosBlur } from "@/components/dados-blur";
import { deYmd, fmt, hhmm, SEMANA, semanaDe, somarDias, ymd } from "@/lib/datas";
import {
  conteudosQuery,
  faltaTabelaConteudos,
  fonteQuery,
  funilQuery,
  leadsQuery,
  serieQuery,
} from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { coresGrafico, useTema } from "@/lib/theme";
import { toast } from "@/lib/toast";
import type { Conteudo, Funil, StatusConteudo } from "@/lib/types";
import { STATUS_CONTEUDO_LABEL } from "@/lib/types";
import { ModuloDesativado } from "@/components/modulo";
import { modulosDe } from "@/lib/types";

export const Route = createFileRoute("/_authed/")({ component: Dashboard });

const diaCurto = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

/** O que ainda não saiu do lugar: passou do dia e não está agendado nem publicado. */
const PARADOS: StatusConteudo[] = ["ideia", "producao", "aprovacao"];

function Dashboard() {
  const { projeto, campanha, campanhas, setCampanhaId } = usePainel();
  // Área de módulo que o cliente não usa aparece desativada (com o botão de
  // ativar pra quem pode), em vez de números zerados que parecem erro.
  const mods = modulosDe(projeto);
  const cor = coresGrafico(useTema());
  const qc = useQueryClient();
  const [dias, setDias] = useState(7);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");

  const salvarMeta = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: number | null }) => {
      const { error } = await getSupabaseBrowserClient()
        .from("campaigns")
        .update({ meta_leads: valor })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setEditandoMeta(false);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast("Meta atualizada.", "success");
    },
  });

  function abrirMeta() {
    setMetaInput(campanha?.meta_leads != null ? String(campanha.meta_leads) : "");
    setEditandoMeta(true);
  }

  const { data: funil } = useQuery(funilQuery(projeto?.id, campanha?.id ?? null));
  const { data: serie = [] } = useQuery(serieQuery(projeto?.id, campanha?.id ?? null, dias));
  const { data: fontes = [] } = useQuery(fonteQuery(projeto?.id, campanha?.id ?? null));
  const { data: recentes } = useQuery(
    leadsQuery({
      projectId: projeto?.id,
      campaignId: campanha?.id ?? null,
      busca: "",
      status: "",
      tipo: "",
      origem: "",
      pagina: 0,
    }),
  );

  // ── Conteúdo: uma consulta só cobre a semana, o mês e os próximos 30 dias.
  const hoje = ymd(new Date());
  const semana = semanaDe(hoje);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const fimMes = ymd(new Date(deYmd(hoje).getFullYear(), deYmd(hoje).getMonth() + 1, 0));
  const daqui30 = somarDias(hoje, 30);
  const de = [semana[0]!, inicioMes].sort()[0]!;
  const ate = [semana[6]!, fimMes, daqui30].sort().at(-1)!;
  const { data: conteudos = [], error: erroConteudo, isLoading: carregandoConteudo } = useQuery(
    conteudosQuery(projeto?.id, de, ate),
  );

  const daSemana = conteudos.filter((c) => c.data >= semana[0]! && c.data <= semana[6]!);
  const doMes = conteudos.filter((c) => c.data.startsWith(hoje.slice(0, 7)));
  // Tudo de hoje em diante, publicado ou não: a lista precisa bater com a
  // semana ao lado. O status de cada item diz em que pé ele está.
  const proximos = conteudos.filter((c) => c.data >= hoje).slice(0, 15);
  const atrasados = conteudos.filter((c) => c.data < hoje && PARADOS.includes(c.status));
  const publicadosSemana = daSemana.filter((c) => c.status === "publicado").length;
  const emAprovacao = conteudos.filter((c) => c.data >= hoje && c.status === "aprovacao").length;

  const leads = recentes?.linhas ?? [];
  const total = funil?.completos ?? 0;
  const leadsHoje = serie.at(-1)?.total ?? 0;
  const leadsOntem = serie.at(-2)?.total ?? 0;
  const meta = campanha?.meta_leads ?? null;
  const pctMeta = meta ? Math.min(100, Math.round((1000 * total) / meta) / 10) : null;

  // As duas áreas viram blocos pra poder trocar a ordem: a de módulo
  // ativo vem primeiro, e a desativada desce pro fim da página.
  const areaConteudo = (primeira: boolean) => (
    <>
      {/* ── CONTEÚDO ── */}
      <Secao
        primeira={primeira}
        titulo="Conteúdo"
        acao={
          <Link
            to="/postagens"
            className="flex items-center gap-1.5 rounded-full border border-line/70 bg-surface px-3 py-1.5 text-xs text-ink transition hover:border-gold/50"
          >
            Abrir programação <ArrowRight size={13} />
          </Link>
        }
      />

      {!mods.conteudo ? (
        <ModuloDesativado modulo="conteudo" compacto />
      ) : erroConteudo ? (
        <Card>
          <p className="py-4 text-center text-sm text-muted">
            {faltaTabelaConteudos(erroConteudo)
              ? "O calendário de conteúdo ainda não foi ativado no banco (supabase/18_calendario.sql)."
              : `Não consegui carregar os conteúdos: ${(erroConteudo as Error).message}`}
          </p>
        </Card>
      ) : (
        <>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi rotulo="Na Semana" valor={daSemana.length} sub={`${publicadosSemana} publicado${publicadosSemana === 1 ? "" : "s"}`} destaque />
          <Kpi rotulo="No Mês" valor={doMes.length} sub="conteúdos planejados" />
          <Kpi rotulo="Em Aprovação" valor={emAprovacao} sub="aguardando o cliente" />
          <Kpi
            rotulo="Atrasados"
            valor={atrasados.length}
            sub={atrasados.length ? "passaram do dia sem agendar" : "tudo em dia"}
            alerta={atrasados.length > 0}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card
            className="lg:col-span-2"
            titulo="Esta semana"
            acao={<span className="text-xs text-muted">{intervaloSemana(semana)}</span>}
          >
            <SemanaResumo dias={semana} conteudos={daSemana} hoje={hoje} />
            <StatusDoMes conteudos={doMes} atrasados={atrasados.length} />
          </Card>

          {/* No desktop quem manda na altura da linha é "Esta semana":
              h-0 + min-h-full faz este card não contar pro tamanho da linha
              e depois esticar até ela. A lista rola por dentro, então muitos
              conteúdos aqui não deixam a semana ao lado esticada e vazia. */}
          <Card
            titulo={`Próximas publicações${proximos.length ? ` (${proximos.length})` : ""}`}
            className="flex flex-col lg:h-0 lg:min-h-full"
          >
            {carregandoConteudo ? (
              <Vazio>Carregando…</Vazio>
            ) : proximos.length === 0 ? (
              <Vazio>Nada programado de hoje até os próximos 30 dias.</Vazio>
            ) : (
              <div className="rolagem-fina -mr-2 max-h-[28rem] min-h-0 flex-1 space-y-2 overflow-y-auto pr-2 lg:max-h-none">
                {proximos.map((c) => (
                  <ItemProximo key={c.id} c={c} hoje={hoje} />
                ))}
              </div>
            )}
          </Card>
        </div>
        </>
      )}

    </>
  );

  const areaCrm = (primeira: boolean) => (
    <>
      {/* ── CRM ── */}
      <Secao
        primeira={primeira}
        titulo="CRM"
        acao={
          <div className="flex flex-wrap items-center gap-2">
          {/* O período vale só para os números de leads — por isso mora aqui. */}
          {mods.crm && campanhas.length > 0 && (
            <Dropdown
              value={campanha?.id ?? ""}
              onChange={(v) => setCampanhaId(v || null)}
              options={[
                { value: "", label: "Todo o período" },
                ...campanhas.map((c) => ({ value: c.id, label: c.nome })),
              ]}
              leading={<BarChart3 size={13} className="shrink-0 text-gold" />}
              triggerClassName="rounded-full border border-line/70 bg-surface px-3 py-1.5 text-xs text-ink hover:border-gold/40"
            />
          )}
          <Link
            to="/leads"
            className="flex items-center gap-1.5 rounded-full border border-line/70 bg-surface px-3 py-1.5 text-xs text-ink transition hover:border-gold/50"
          >
            Ver todos os leads <ArrowRight size={13} />
          </Link>
          </div>
        }
      />

      {!mods.crm ? (
        <ModuloDesativado modulo="crm" compacto />
      ) : (
      <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="Total de Leads" valor={total} destaque />
        <Kpi rotulo="Leads Hoje" valor={leadsHoje} delta={leadsHoje - leadsOntem} />
        <Kpi
          rotulo="Taxa de Conversão"
          valor={funil?.tx_conversao != null ? `${funil.tx_conversao}%` : "—"}
          sub="de abertura até completo"
        />
      </div>

      {campanha && (
        <div className="mb-4 rounded-2xl border border-line/70 bg-surface px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Target size={16} className="text-accent" />
              Meta da Campanha ({campanha.nome})
            </p>
            <div className="flex items-center gap-3">
              {meta != null && (
                <p className="text-sm text-muted">
                  {total} / {meta} leads
                </p>
              )}
              <button
                onClick={abrirMeta}
                title="Editar meta"
                className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <Pencil size={14} />
              </button>
            </div>
          </div>

          {meta != null ? (
            <>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${pctMeta}%` }}
                />
              </div>
              <p className="mt-1.5 text-right text-xs text-muted">{pctMeta}% da meta atingida</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Nenhuma meta definida.{" "}
              <button onClick={abrirMeta} className="font-medium text-accent hover:underline">
                Definir meta
              </button>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gráfico: completos vs parciais empilhados, com período. */}
        <Card
          className="lg:col-span-2"
          titulo="Leads por dia"
          acao={
            <div className="flex gap-1 rounded-full border border-line/70 p-0.5">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDias(d)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    dias === d ? "bg-gold font-semibold text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={cor.grade} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="dia"
                  tickFormatter={diaCurto}
                  interval={dias > 7 ? 4 : 0}
                  tick={{ fill: cor.eixo, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: cor.eixo, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={diaCurto}
                  cursor={{ fill: cor.grade, opacity: 0.3 }}
                  contentStyle={{
                    background: cor.tooltipBg,
                    border: `1px solid ${cor.tooltipLinha}`,
                    borderRadius: 10,
                    color: cor.ink,
                  }}
                />
                <Bar dataKey="completos" name="Completos" stackId="a" fill={cor.fill} />
                <Bar dataKey="parciais" name="Parciais" stackId="a" fill={cor.fill2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legenda cor={cor} />
        </Card>

        {/* Funil compacto — o sinal-chave do negócio, num olhar. */}
        <Card titulo="Funil">
          {funil ? <FunilCompacto f={funil} /> : <Vazio>Sem dados.</Vazio>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card titulo="Fontes">
          {fontes.length === 0 ? (
            <Vazio>Sem leads ainda.</Vazio>
          ) : (
            <div className="space-y-3">
              {fontes.slice(0, 6).map((f) => (
                <BarraFonte key={f.fonte} fonte={f.fonte} total={f.total} max={fontes[0]?.total ?? 0} />
              ))}
            </div>
          )}
        </Card>

        <Card titulo="Leads Recentes">
          {leads.length === 0 ? (
            <Vazio>Nenhum lead ainda.</Vazio>
          ) : (
            <div className="space-y-1">
              {leads.slice(0, 5).map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-ink">
                      {l.nome ?? (l.completo ? "(sem nome)" : "Lead parcial")}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {l.whatsapp ?? "—"} · {l.utms.utm_source ?? "direto"}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </>
      )}
    </>
  );
  const conteudoPrimeiro = mods.conteudo || !mods.crm;


  return (
    <>
      {/* Topo neutro: a Dashboard junta Conteúdo e CRM, então período e
          atualização de leads ficam na área do CRM, não aqui. */}
      <Cabecalho titulo="Dashboard" atualizavel comCampanha={false} oQueAtualiza="" />

      <DadosBlur>
      {conteudoPrimeiro ? (
        <>
          {areaConteudo(true)}
          {areaCrm(false)}
        </>
      ) : (
        <>
          {areaCrm(true)}
          {areaConteudo(false)}
        </>
      )}
      </DadosBlur>

      <Modal aberto={editandoMeta} onFechar={() => setEditandoMeta(false)} titulo="Meta da campanha">
        <p className="text-sm text-muted">
          Quantos leads você quer atingir em{" "}
          <span className="font-semibold text-ink">{campanha?.nome}</span>?
        </p>
        <input
          type="number"
          min={0}
          autoFocus
          value={metaInput}
          onChange={(e) => setMetaInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && campanha) {
              const v = parseInt(metaInput, 10);
              salvarMeta.mutate({ id: campanha.id, valor: Number.isFinite(v) ? v : null });
            }
          }}
          placeholder="Ex.: 500"
          className="mt-3 w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent/70"
        />
        {salvarMeta.isError && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{(salvarMeta.error as Error).message}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => {
              if (!campanha) return;
              const v = parseInt(metaInput, 10);
              salvarMeta.mutate({ id: campanha.id, valor: Number.isFinite(v) ? v : null });
            }}
            disabled={salvarMeta.isPending}
            className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-60"
          >
            {salvarMeta.isPending ? "Salvando…" : "Salvar meta"}
          </button>
          {campanha?.meta_leads != null && (
            <button
              onClick={() => salvarMeta.mutate({ id: campanha.id, valor: null })}
              disabled={salvarMeta.isPending}
              className="rounded-xl border border-line/70 px-4 py-2.5 text-sm text-muted transition hover:text-ink"
            >
              Remover
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Divisória entre as áreas da Dashboard (Conteúdo, Leads). */
function Secao({ titulo, acao, primeira = false }: { titulo: string; acao?: ReactNode; primeira?: boolean }) {
  return (
    <div className={`mb-3 ${primeira ? "" : "mt-8"} flex flex-wrap items-center justify-between gap-3 border-b border-line/50 pb-2`}>
      <h2 className="display text-lg font-semibold text-ink">{titulo}</h2>
      {acao}
    </div>
  );
}

/** "20 – 26 de set." */
function intervaloSemana(semana: string[]) {
  const [a, b] = [semana[0]!, semana[6]!];
  return a.slice(0, 7) === b.slice(0, 7)
    ? `${deYmd(a).getDate()} – ${fmt(b, { day: "numeric", month: "short" })}`
    : `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short" })}`;
}

/** Quantos cabem por dia antes de virar "+N". */
const POR_DIA = 3;

/**
 * A semana em 7 colunas, cada conteúdo na cor do status (as mesmas do
 * Calendário). No celular os dias viram linhas. Clicar leva ao Calendário.
 */
function SemanaResumo({ dias, conteudos, hoje }: { dias: string[]; conteudos: Conteudo[]; hoje: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {dias.map((dia) => {
        const doDia = conteudos.filter((c) => c.data === dia);
        const passou = dia < hoje;
        return (
          <Link
            key={dia}
            to="/postagens"
            className={`flex gap-2 rounded-xl border p-2 transition hover:border-gold/40 sm:min-h-36 sm:flex-col ${
              dia === hoje ? "border-gold/60 bg-gold/5" : "border-line/60"
            } ${passou ? "opacity-70" : ""}`}
          >
            <div className="flex w-14 shrink-0 items-center gap-1.5 sm:w-auto">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {SEMANA[deYmd(dia).getDay()]}
              </span>
              <span
                className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${
                  dia === hoje ? "bg-gold font-semibold text-white" : "font-medium text-ink"
                }`}
              >
                {deYmd(dia).getDate()}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {doDia.length === 0 && <span className="text-[11px] text-muted/60 sm:mt-1">—</span>}
              {doDia.slice(0, POR_DIA).map((c) => (
                <span
                  key={c.id}
                  title={c.titulo}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-tight ${COR_STATUS_CAL[c.status].chip}`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COR_STATUS_CAL[c.status].ponto}`} />
                  {hhmm(c.hora) && <span className="shrink-0 font-semibold tabular-nums">{hhmm(c.hora)}</span>}
                  <span className="truncate">{c.titulo}</span>
                </span>
              ))}
              {doDia.length > POR_DIA && (
                <span className="px-1.5 text-[11px] font-medium text-muted">+{doDia.length - POR_DIA} mais</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/** Barra única com a divisão do mês por status — o andamento da produção. */
function StatusDoMes({ conteudos, atrasados }: { conteudos: Conteudo[]; atrasados: number }) {
  const total = conteudos.length;
  const status = Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[];
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date());

  return (
    <div className="mt-5 border-t border-line/50 pt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          Em {nomeMes}: {total} {total === 1 ? "conteúdo" : "conteúdos"}
        </p>
        {atrasados > 0 && (
          <Link
            to="/postagens"
            className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-500/25 transition hover:bg-rose-500/15 dark:text-rose-300"
          >
            <AlertTriangle size={12} />
            {atrasados} atrasado{atrasados === 1 ? "" : "s"}
          </Link>
        )}
      </div>

      {total === 0 ? (
        <p className="text-xs text-muted">Nada planejado para este mês ainda.</p>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {status.map((s) => {
              const n = conteudos.filter((c) => c.status === s).length;
              return n ? (
                <div
                  key={s}
                  title={`${STATUS_CONTEUDO_LABEL[s]}: ${n}`}
                  className={COR_STATUS_CAL[s].ponto}
                  style={{ width: `${(100 * n) / total}%` }}
                />
              ) : null;
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {status.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${COR_STATUS_CAL[s].ponto}`} />
                {STATUS_CONTEUDO_LABEL[s]}
                <span className="font-semibold text-ink">{conteudos.filter((c) => c.status === s).length}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Uma linha da lista de próximas publicações: quando, o quê e em que pé está. */
function ItemProximo({ c, hoje }: { c: Conteudo; hoje: string }) {
  const quando =
    c.data === hoje
      ? "Hoje"
      : c.data === somarDias(hoje, 1)
        ? "Amanhã"
        : fmt(c.data, { weekday: "short" }).replace(".", "");
  return (
    <Link
      to="/postagens"
      // Abre o formulário daquele post direto.
      search={{ abrir: c.id }}
      // Fundo na cor do status (as mesmas do Calendário): o andamento se lê
      // de longe, antes do selo. items-center deixa a data no meio do item.
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:brightness-95 ${COR_STATUS_CAL[c.status].fundo}`}
    >
      <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-surface py-2.5 shadow-sm shadow-black/5">
        <span className="text-[10px] font-semibold uppercase text-muted">{quando}</span>
        <span className="text-lg font-bold leading-tight text-ink">{deYmd(c.data).getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{c.titulo}</p>
        </div>
        <p className="mt-0.5 text-xs text-muted">{hhmm(c.hora) ?? "Sem horário"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <StatusConteudoBadge status={c.status} />
          <PilulasConteudo c={c} />
        </div>
      </div>
    </Link>
  );
}

function Kpi({
  rotulo,
  valor,
  sub,
  delta,
  destaque = false,
  alerta = false,
}: {
  rotulo: string;
  valor: React.ReactNode;
  sub?: string;
  delta?: number;
  destaque?: boolean;
  /** Pinta de vermelho quando o número pede atenção (ex.: atrasados). */
  alerta?: boolean;
}) {
  return (
    <div
      className={
        destaque
          ? "rounded-2xl bg-gold px-5 py-4 text-white"
          : alerta
            ? "rounded-2xl border border-rose-500/40 bg-rose-500/5 px-5 py-4"
            : "rounded-2xl border border-line/70 bg-surface px-5 py-4"
      }
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${
          destaque ? "text-white" : "text-muted"
        }`}
      >
        {rotulo}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p
          className={`text-3xl font-semibold ${
            destaque ? "text-white" : alerta ? "text-rose-600 dark:text-rose-400" : "text-ink"
          }`}
        >
          {valor}
        </p>
        {delta != null && <Delta v={delta} />}
      </div>
      {sub && <p className={`mt-1 text-xs ${destaque ? "text-white" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="text-xs text-muted">= ontem</span>;
  const subiu = v > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${
        subiu ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      }`}
    >
      {subiu ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(v)} vs ontem
    </span>
  );
}

function Legenda({ cor }: { cor: { fill: string; fill2: string } }) {
  return (
    <div className="mt-1 flex justify-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: cor.fill }} /> Completos
      </span>
      <span className="flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: cor.fill2 }} /> Parciais
      </span>
    </div>
  );
}

function FunilCompacto({ f }: { f: Funil }) {
  const etapas = [
    { rot: "Abriram o formulário", v: f.aberturas },
    { rot: "Começaram a preencher", v: f.iniciaram },
    { rot: "Completaram", v: f.completos },
  ];
  // Maior perda entre etapas consecutivas — onde focar.
  const perdaAbrir = f.aberturas - f.iniciaram;
  const perdaConcluir = f.iniciaram - f.completos;
  const maior =
    perdaAbrir >= perdaConcluir
      ? { entre: "abrir e preencher", n: perdaAbrir }
      : { entre: "preencher e concluir", n: perdaConcluir };

  return (
    <div className="space-y-3">
      {etapas.map((e, i) => (
        <div key={e.rot}>
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink">{e.rot}</p>
            <p className="text-sm font-semibold text-ink">{e.v}</p>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gold transition-all"
              style={{
                width: `${f.aberturas ? Math.max(3, (100 * e.v) / f.aberturas) : 0}%`,
                // Cada etapa um pouco mais clara, pra ler como um funil afunilando.
                opacity: 1 - i * 0.28,
              }}
            />
          </div>
        </div>
      ))}
      <div className="mt-4 rounded-lg border border-line/60 bg-surface-2/50 p-3 text-xs">
        <p className="text-muted">
          Conversão geral:{" "}
          <span className="font-semibold text-ink">
            {f.tx_conversao != null ? `${f.tx_conversao}%` : "—"}
          </span>
        </p>
        {maior.n > 0 && (
          <p className="mt-1 text-muted">
            Maior perda: <span className="font-semibold text-ink">{maior.n} leads</span> entre{" "}
            {maior.entre}.
          </p>
        )}
      </div>
    </div>
  );
}

function BarraFonte({ fonte, total, max }: { fonte: string; total: number; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink">{fonte}</span>
        <span className="text-muted">{total}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gold transition-all"
          style={{ width: `${max ? Math.max(4, (100 * total) / max) : 0}%` }}
        />
      </div>
    </div>
  );
}
