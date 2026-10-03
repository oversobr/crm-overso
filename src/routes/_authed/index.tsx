import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, CheckCircle2, ChevronRight, Pencil, Send, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { ComponentType } from "react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
import { PARADOS, STATUS_CONTEUDO_LABEL } from "@/lib/types";
import { ModuloDesativado } from "@/components/modulo";
import { modulosDe } from "@/lib/types";

export const Route = createFileRoute("/_authed/")({ component: Dashboard });

const diaCurto = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });


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
  // A semana anterior entra na janela porque o KPI do topo compara com ela —
  // sem isso o "Semana passada: N" leria sempre zero, por falta de dado.
  const semanaAnterior = semanaDe(somarDias(hoje, -7));
  const de = [semanaAnterior[0]!, semana[0]!, inicioMes].sort()[0]!;
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
  const publicadosSemanaAnterior = conteudos.filter(
    (c) =>
      c.data >= semanaAnterior[0]! && c.data <= semanaAnterior[6]! && c.status === "publicado",
  ).length;
  const emAprovacao = conteudos.filter((c) => c.data >= hoje && c.status === "aprovacao").length;

  // ── "Precisa de você": o que está parado esperando alguém agir.
  // `atualizado_em` é a última vez que o conteúdo mudou; num que está em
  // aprovação, é há quanto tempo ele espera o cliente responder. Não é o
  // instante exato em que entrou nesse status (o banco não guarda histórico),
  // mas é a melhor aproximação sem migration — e erra para o lado seguro:
  // qualquer mexida reinicia a contagem, então nada aparece como parado à toa.
  const DIAS_PARADO = 3;
  const limiteParado = somarDias(hoje, -DIAS_PARADO);
  const paradosAprovacao = conteudos.filter(
    (c) => c.status === "aprovacao" && (c.atualizado_em ?? "").slice(0, 10) <= limiteParado,
  );
  const pendencias = atrasados.length + paradosAprovacao.length;

  // Mesma queryKey do bloco de usuário na sidebar: o react-query devolve do
  // cache, sem uma segunda ida ao servidor.
  const { data: usuario } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient().auth.getUser();
      return data.user;
    },
  });
  const metaUsuario = (usuario?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const nomeUsuario =
    metaUsuario.full_name || metaUsuario.name || usuario?.email?.split("@")[0] || "";

  // Saudação pela hora do dia, como nas referências — o painel cumprimenta
  // quem abriu em vez de anunciar "Dashboard", que a pessoa já sabe.
  const hora = new Date().getHours();
  const primeiroNome = (nomeUsuario ?? "").trim().split(" ")[0] ?? "";
  const saudacao =
    (hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite") +
    (primeiroNome ? `, ${primeiroNome}` : "");

  // Dia de pico da série — é a barra que fica cheia no gráfico. Empate fica
  // com o mais recente, que é o que interessa olhar.
  const iPico = serie.reduce((melhor, d, i) => (d.total >= (serie[melhor]?.total ?? -1) ? i : melhor), 0);

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
        {/* Quatro cards de peso igual viraram uma tira: os números continuam
            todos aqui, mas param de competir com o topo da página. */}
        <TiraKpi
          itens={[
            { rotulo: "Na semana", valor: daSemana.length },
            { rotulo: "No mês", valor: doMes.length },
            { rotulo: "Em aprovação", valor: emAprovacao },
            { rotulo: "Atrasados", valor: atrasados.length, alerta: atrasados.length > 0 },
          ]}
        />
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
              leading={<BarChart3 size={13} className="shrink-0 text-accent" />}
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
      {/* "Leads hoje" subiu pro topo da página; repetir aqui só ocuparia
          espaço dizendo a mesma coisa duas vezes. */}
      <TiraKpi
        itens={[
          { rotulo: "Total de leads", valor: total },
          {
            rotulo: "Taxa de conversão",
            valor: funil?.tx_conversao != null ? `${funil.tx_conversao}%` : "—",
          },
          { rotulo: "Aberturas do form", valor: funil?.aberturas ?? 0 },
        ]}
      />

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
                {/* O dia de melhor resultado fica cheio e o resto esmaecido,
                    como nas referências: a leitura vira "qual foi o pico"
                    em vez de 30 barras de peso igual. O rótulo só aparece
                    nele, e só quando houve algum lead. */}
                <Bar dataKey="completos" name="Completos" stackId="a">
                  {serie.map((d, i) => (
                    <Cell
                      key={d.dia}
                      fill={cor.fill}
                      fillOpacity={i === iPico ? 1 : 0.35}
                    />
                  ))}
                </Bar>
                <Bar dataKey="parciais" name="Parciais" stackId="a" radius={[4, 4, 0, 0]}>
                  {serie.map((d, i) => (
                    <Cell
                      key={d.dia}
                      fill={cor.fill2}
                      fillOpacity={i === iPico ? 1 : 0.35}
                    />
                  ))}
                  <LabelList dataKey="total" content={<RotuloPico indice={iPico} cor={cor} />} />
                </Bar>
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

      {/* Fontes e Leads Recentes existem inteiros em /relatorios e /leads.
          Em vez de remover (você pode usar no dia a dia), ficam recolhidos:
          a página encurta e eles continuam a um clique. O <details> guarda o
          estado enquanto a tela não é remontada. */}
      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1 py-2 text-sm text-muted transition hover:text-ink">
          <ChevronRight
            size={15}
            className="shrink-0 transition-transform group-open:rotate-90"
          />
          Fontes e leads recentes
        </summary>

        <div className="mt-2 grid gap-4 lg:grid-cols-2">
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
      </details>
      </>
      )}
    </>
  );
  const conteudoPrimeiro = mods.conteudo || !mods.crm;


  return (
    <>
      {/* Topo neutro: a Dashboard junta Conteúdo e CRM, então período e
          atualização de leads ficam na área do CRM, não aqui. */}
      <Cabecalho
        titulo={saudacao}
        subtitulo={
          projeto
            ? `Veja o que está acontecendo com ${projeto.nome} hoje.`
            : "Escolha um cliente no menu para ver os números dele."
        }
        atualizavel
        comCampanha={false}
        oQueAtualiza=""
      />

      <DadosBlur>
      {/* Antes era "aqui está tudo", com 7 KPIs de peso igual misturando
          escalas de tempo. Agora o topo responde duas perguntas: o que
          preciso fazer, e como foi hoje. O resto desce de hierarquia. */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          rotulo="Precisa de você"
          valor={pendencias}
          sub={pendencias ? "itens parados esperando ação" : "nada parado"}
          alerta={pendencias > 0}
          destaque={pendencias === 0}
          Icone={pendencias > 0 ? AlertTriangle : CheckCircle2}
          chip="rosa"
          comparacao={
            pendencias > 0
              ? `${atrasados.length} atrasado${atrasados.length === 1 ? "" : "s"} · ${paradosAprovacao.length} em aprovação`
              : "Tudo em dia"
          }
        />
        {mods.conteudo && (
          <Kpi
            rotulo="Publicados na semana"
            valor={publicadosSemana}
            sub={`de ${daSemana.length} programado${daSemana.length === 1 ? "" : "s"}`}
            Icone={Send}
            chip="verde"
            comparacao={`Semana passada: ${publicadosSemanaAnterior}`}
          />
        )}
        {mods.crm && (
          <Kpi
            rotulo="Leads hoje"
            valor={leadsHoje}
            delta={leadsHoje - leadsOntem}
            Icone={Users}
            chip="acento"
            comparacao={`Ontem: ${leadsOntem}`}
          />
        )}
      </div>

      {mods.conteudo && pendencias > 0 && (
        <PrecisaDeVoce atrasados={atrasados} parados={paradosAprovacao} hoje={hoje} />
      )}

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
    <div className={`mb-3 ${primeira ? "" : "mt-8"} flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-2`}>
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
              {doDia.length === 0 && <span className="text-[11px] text-muted sm:mt-1">—</span>}
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
    <div className="mt-5 border-t border-line/70 pt-4">
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

/**
 * Números de apoio numa tira só, em vez de um card por número. Mesma
 * informação, uma fração do peso visual — é o que tira o topo da página da
 * competição com quatro caixas do mesmo tamanho.
 */
function TiraKpi({
  itens,
}: {
  itens: { rotulo: string; valor: React.ReactNode; alerta?: boolean }[];
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-line/70 bg-surface px-5 py-3.5">
      {itens.map(({ rotulo, valor, alerta }) => (
        <div key={rotulo}>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{rotulo}</p>
          <p
            className={`text-lg font-semibold ${
              alerta ? "text-rose-600 dark:text-rose-400" : "text-ink"
            }`}
          >
            {valor}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * O que está parado esperando alguém agir. É a única parte da Dashboard que
 * pede ação em vez de informar estado — por isso fica no topo, e cada linha
 * leva direto pra programação, onde o problema se resolve.
 */
function PrecisaDeVoce({
  atrasados,
  parados,
  hoje,
}: {
  atrasados: Conteudo[];
  parados: Conteudo[];
  hoje: string;
}) {
  const diasDesde = (dia: string) =>
    Math.round((deYmd(hoje).getTime() - deYmd(dia).getTime()) / 864e5);

  const itens = [
    ...atrasados.map((c) => ({
      c,
      motivo: `atrasado há ${diasDesde(c.data)} dia${diasDesde(c.data) === 1 ? "" : "s"}`,
    })),
    ...parados.map((c) => ({ c, motivo: "parado em aprovação" })),
  ];

  return (
    <Card
      className="mb-5 border-rose-500/30 bg-rose-500/5"
      titulo="Precisa de você"
      acao={
        <Link
          to="/postagens"
          className="flex items-center gap-1.5 text-xs text-muted transition hover:text-ink"
        >
          Ver tudo <ArrowRight size={13} />
        </Link>
      }
    >
      <div className="space-y-1">
        {itens.slice(0, 5).map(({ c, motivo }) => (
          <Link
            key={c.id}
            to="/postagens"
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-surface-2/60"
          >
            <span className="min-w-0 truncate text-ink">{c.titulo}</span>
            <span className="shrink-0 text-xs text-rose-600 dark:text-rose-400">{motivo}</span>
          </Link>
        ))}
        {itens.length > 5 && (
          <p className="px-2 pt-1 text-xs text-muted">e mais {itens.length - 5}…</p>
        )}
      </div>
    </Card>
  );
}

/**
 * Etiqueta flutuante sobre a barra de pico — o detalhe que as referências
 * usam pra dizer "foi aqui". Só desenha no índice do pico e só se houve
 * lead; em série zerada não há pico nenhum a apontar.
 */
function RotuloPico({
  indice,
  cor,
  x,
  y,
  width,
  value,
  index,
}: {
  indice: number;
  cor: { fill: string };
  x?: number;
  y?: number;
  width?: number;
  value?: number;
  index?: number;
}) {
  if (index !== indice || !value || x == null || y == null || width == null) return null;

  const texto = String(value);
  const largura = texto.length * 8 + 16;

  return (
    <g transform={`translate(${x + width / 2}, ${y - 10})`}>
      <rect x={-largura / 2} y={-18} width={largura} height={20} rx={10} fill={cor.fill} />
      <text textAnchor="middle" y={-4} fontSize={11} fontWeight={600} fill="#fff">
        {texto}
      </text>
    </g>
  );
}

/* Cada KPI tem seu chip de cor, como nas referências — é o que dá identidade
   a cada número de relance, sem precisar ler o rótulo. Os pares são
   claro/escuro porque um `bg-rose-500/12` que funciona no navy some no branco. */
const CHIPS = {
  acento: "bg-gold/12 text-accent ring-gold/20",
  verde: "bg-emerald-500/12 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400",
  rosa: "bg-rose-500/12 text-rose-600 ring-rose-600/20 dark:text-rose-400",
  ambar: "bg-amber-500/12 text-amber-700 ring-amber-600/20 dark:text-amber-400",
} as const;

function Kpi({
  rotulo,
  valor,
  sub,
  delta,
  destaque = false,
  alerta = false,
  Icone,
  chip = "acento",
  comparacao,
}: {
  rotulo: string;
  valor: React.ReactNode;
  sub?: string;
  delta?: number;
  destaque?: boolean;
  /** Pinta de vermelho quando o número pede atenção (ex.: atrasados). */
  alerta?: boolean;
  /** Ícone do chip colorido no canto. */
  Icone?: ComponentType<{ size?: number; className?: string }>;
  chip?: keyof typeof CHIPS;
  /** Linha de referência embaixo ("Semana passada: 12"), como nas refs. */
  comparacao?: string;
}) {
  return (
    <div
      className={
        destaque
          ? "rounded-3xl bg-gold px-5 py-5 text-white"
          : alerta
            ? "rounded-3xl border border-rose-500/40 bg-rose-500/5 px-5 py-5"
            : "rounded-3xl border border-line/70 bg-surface px-5 py-5 shadow-sm shadow-black/5"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={`text-[11px] font-medium uppercase tracking-wider ${
            destaque ? "text-white" : "text-muted"
          }`}
        >
          {rotulo}
        </p>
        {Icone && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
              destaque ? "bg-white/15 text-white ring-white/25" : CHIPS[chip]
            }`}
          >
            <Icone size={16} />
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p
          className={`text-4xl font-semibold tracking-tight ${
            destaque ? "text-white" : alerta ? "text-rose-600 dark:text-rose-400" : "text-ink"
          }`}
        >
          {valor}
        </p>
        {delta != null && <Delta v={delta} />}
      </div>

      {sub && <p className={`mt-1 text-xs ${destaque ? "text-white" : "text-muted"}`}>{sub}</p>}

      {/* Linha de referência separada por um fio, como nos cards das refs:
          o número sozinho não diz se está bom — o de antes diz. */}
      {comparacao && (
        <p
          className={`mt-3 border-t pt-2.5 text-xs ${
            destaque ? "border-white/20 text-white" : "border-line/70 text-muted"
          }`}
        >
          {comparacao}
        </p>
      )}
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
