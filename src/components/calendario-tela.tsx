import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Lock, Plus, SquareCheckBig, Trash2 } from "lucide-react";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import { separarCard } from "@/components/comment-thread";
import { Card, EmptyState } from "@/components/ds/card";
import { SegmentedControl } from "@/components/ds/controles";
import { ModalDegrade } from "@/components/ds/modal";
import { NovaPostagem } from "@/components/nova-postagem";
import { PostDetalhe } from "@/components/post-detalhe";
import { usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { capitalizar, deYmd, diaExtenso, fmt, gradeDoMes, hhmm, semanaDe, somarDias, tituloPeriodo, ymd } from "@/lib/datas";
import {
  atualizarConteudo,
  atualizarTarefa,
  buscarConteudo,
  conteudosQuery,
  criarTarefa,
  eventosQuery,
  excluirTarefa,
  faltaTabelaTarefas,
  tarefasQuery,
  ultimosComentariosQuery,
} from "@/lib/queries";
import { COR_POST } from "@/lib/status";
import { toast } from "@/lib/toast";
import type { Conteudo, Evento, StatusConteudo, StatusTarefa, Tarefa, TarefaEntrada } from "@/lib/types";
import { FORMATO_LABEL, modulosDe, STATUS_CONTEUDO_LABEL, STATUS_TAREFA_LABEL } from "@/lib/types";

/**
 * A tela de calendário do cliente: os posts programados (na cor do status),
 * as tarefas avulsas (contorno tracejado) e, para quem tem o módulo, os
 * eventos. Arrastar para outro dia remarca.
 *
 * É a mesma tela nas duas rotas, "Calendário" e "Programação de post": cada
 * rota só diz o título e o próprio endereço. Fica fora dos arquivos de rota
 * porque rota é dividida em chunks e não deve exportar nada além do Route.
 */

/** Endereços que mostram esta tela. */
export type RotaCalendario = "/calendario" | "/postagens";

/**
 * O que a URL carrega, igual nas duas rotas:
 *   novo   abre o popup de nova postagem;
 *   data   já deixa o dia escolhido nele (e `hora`, o horário);
 *   abrir  abre os detalhes do post com esse id (e `editar`, o formulário dele).
 * Ficam na URL para qualquer tela abrir os popups com um link comum, e para
 * o voltar do navegador fechá-los.
 */
export type BuscaCalendario = { novo?: true; data?: string; hora?: string; abrir?: string; editar?: true };

export function validarBuscaCalendario(s: Record<string, unknown>): BuscaCalendario {
  return {
    ...(s.novo === true || s.novo === 1 ? { novo: true as const } : {}),
    ...(typeof s.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.data) ? { data: s.data } : {}),
    ...(typeof s.hora === "string" && /^\d{2}:\d{2}$/.test(s.hora) ? { hora: s.hora } : {}),
    ...(typeof s.abrir === "string" && s.abrir ? { abrir: s.abrir } : {}),
    ...(s.editar === true && typeof s.abrir === "string" && s.abrir ? { editar: true as const } : {}),
  };
}

type Visao = "mes" | "semana" | "dia";

/** Post ou tarefa, com o que a grade precisa pra desenhar e ordenar. */
type Item =
  | { tipo: "post"; id: string; data: string; hora: string | null; titulo: string; post: Conteudo }
  | { tipo: "tarefa"; id: string; data: string; hora: string | null; titulo: string; tarefa: Tarefa };

type EdicaoTarefa = { modo: "novo"; data: string; hora?: string | null } | { modo: "editar"; tarefa: Tarefa };

/**
 * Linha da grade de horários onde algo foi solto ou clicado: uma hora cheia
 * (0 a 23) ou a faixa "sem horário". Ausente = a grade do mês, que só tem dia.
 */
type Faixa = number | "sem" | undefined;

/** Faixa de horas sempre à vista na semana e no dia; cresce se houver item fora dela. */
const HORA_INICIAL = 7;
const HORA_FINAL = 21;

const doisDigitos = (n: number) => String(n).padStart(2, "0");
const horaDoItem = (hora: string | null) => (hora ? Number(hora.slice(0, 2)) : null);

const UNIDADE = { mes: "mês", semana: "semana", dia: "dia" } as const;
const VISOES: { id: Visao; rotulo: string }[] = [
  { id: "mes", rotulo: "Mês" },
  { id: "semana", rotulo: "Semana" },
  { id: "dia", rotulo: "Dia" },
];
const DIAS_DA_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const STATUS_POST = Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[];

/** Um evento cobre o dia se ele cai entre o início e o fim. */
const cobre = (e: Evento, dia: string) => e.data_inicio <= dia && dia <= (e.data_fim ?? e.data_inicio);

/** "QUA 07 OUT · REELS" */
const metaDoPost = (c: Conteudo) =>
  `${fmt(c.data, { weekday: "short" }).replace(".", "")} ${c.data.slice(8, 10)} ${fmt(c.data, { month: "short" }).replace(".", "")} · ${FORMATO_LABEL[c.formato]}`.toUpperCase();

export function CalendarioTela({
  titulo: tituloDaTela,
  rota,
  busca,
  resumoDePosts,
  criaNaGrade,
}: {
  /** Nome da tela no topo ("Calendário", "Programação de post"). */
  titulo: string;
  /** O endereço desta tela: é para onde os links dela mesma apontam. */
  rota: RotaCalendario;
  busca: BuscaCalendario;
  /**
   * Mostra os blocos que resumem os posts do mês: os cards por status no
   * topo e, embaixo, "Esperando aprovação" e "Sem arte anexada". A
   * Programação de post mostra; o Calendário fica só com a grade.
   */
  resumoDePosts: boolean;
  /**
   * O que o clique num espaço da grade cria (o "+" do dia e os dois cliques
   * no vazio): uma tarefa avulsa, no Calendário, ou uma postagem, na
   * Programação de post. O botão "Nova tarefa" do topo existe nas duas.
   */
  criaNaGrade: "tarefa" | "post";
}) {
  const { projeto } = usePainel();
  const router = useRouter();
  const qc = useQueryClient();
  const mods = modulosDe(projeto);

  const { novo, data: dataDoLink, hora: horaDoLink, abrir, editar } = busca;

  const hoje = ymd(new Date());
  const [ref, setRef] = useState(hoje);
  // Abre no mês: o Calendário é a visão geral, e o mês mostra o todo.
  const [visao, setVisao] = useState<Visao>("mes");
  const [comEventos, setComEventos] = useState(true);
  const [edicao, setEdicao] = useState<EdicaoTarefa | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const periodo = useMemo(
    () => (visao === "mes" ? gradeDoMes(deYmd(ref)) : visao === "semana" ? semanaDe(ref) : [ref]),
    [visao, ref],
  );

  // A busca cobre o mês inteiro de referência mesmo na semana e no dia: os
  // cards de status, de aprovação e de arte falam do mês, não da grade.
  const prefixoMes = ref.slice(0, 7);
  const gradeMes = useMemo(() => gradeDoMes(deYmd(ref)), [ref]);
  const de = [gradeMes[0]!, periodo[0]!].sort()[0]!;
  const ate = [gradeMes.at(-1)!, periodo.at(-1)!].sort().at(-1)!;

  // Cada fonte só é buscada se o módulo dela está ligado pro cliente.
  const consultaPosts = conteudosQuery(projeto?.id, de, ate);
  const { data: posts = [] } = useQuery({ ...consultaPosts, enabled: Boolean(projeto?.id) && mods.conteudo });
  const consultaTarefas = tarefasQuery(projeto?.id, de, ate);
  const { data: tarefas = [], error: erroTarefas } = useQuery(consultaTarefas);
  const { data: eventos = [] } = useQuery({ ...eventosQuery(projeto?.id), enabled: Boolean(projeto?.id) && mods.eventos });

  const doMes = posts.filter((p) => p.data.startsWith(prefixoMes));
  const emAprovacao = doMes.filter((p) => p.status === "aprovacao");
  const semArte = doMes.filter((p) => p.status === "agendado" && !(p.midias?.length > 0));
  const { data: recados = {} } = useQuery(
    ultimosComentariosQuery(
      projeto?.id,
      resumoDePosts ? emAprovacao.map((p) => p.id) : [],
    ),
  );

  // Post aberto pela URL (?abrir=id). O clique vem de um post que já está na
  // lista; o link de outra tela pode apontar para um post de outro mês, e aí
  // ele é buscado pelo id. A RLS garante que só vem post de cliente acessível;
  // o filtro por cliente evita abrir, por um link antigo, o post de outro.
  const { data: postBuscado } = useQuery({
    queryKey: ["conteudo", abrir],
    enabled: Boolean(abrir) && !posts.some((p) => p.id === abrir),
    queryFn: () => buscarConteudo(abrir!),
  });
  const postAberto = abrir
    ? (posts.find((p) => p.id === abrir) ?? (postBuscado?.project_id === projeto?.id ? postBuscado : null) ?? null)
    : null;
  const fecharPopup = () => void router.navigate({ to: rota, search: {}, replace: true });

  const itens: Item[] = [
    ...posts.map((p) => ({ tipo: "post" as const, id: p.id, data: p.data, hora: p.hora, titulo: p.titulo, post: p })),
    ...tarefas.map((t) => ({ tipo: "tarefa" as const, id: t.id, data: t.data, hora: t.hora, titulo: t.titulo, tarefa: t })),
  ];
  // Posts antes das tarefas; dentro de cada grupo, sem horário vai pro fim do dia.
  const doDia = (dia: string) =>
    itens
      .filter((i) => i.data === dia)
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  const eventosDoDia = (dia: string) =>
    mods.eventos && comEventos ? eventos.filter((e) => e.status !== "cancelado" && cobre(e, dia)) : [];

  function andar(delta: number) {
    setRef((r) => {
      if (visao === "semana") return somarDias(r, 7 * delta);
      if (visao === "dia") return somarDias(r, delta);
      const d = deYmd(r);
      return ymd(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    });
  }

  // Cliente sem o módulo Conteúdo não tem postagem para criar: cai na tarefa.
  const criaPost = criaNaGrade === "post" && mods.conteudo;

  /** Cria algo no dia (e na hora, se o clique veio de uma linha de horário). */
  function novaNoDia(dia: string, hora: string | null = null) {
    if (criaPost) {
      void router.navigate({ to: rota, search: { novo: true, data: dia, ...(hora ? { hora } : {}) } });
    } else {
      setEdicao({ modo: "novo", data: dia, hora });
    }
  }

  function abrirItem(i: Item) {
    if (i.tipo === "post") void router.navigate({ to: rota, search: { abrir: i.id } });
    else setEdicao({ modo: "editar", tarefa: i.tarefa });
  }
  const abrirEvento = (e: Evento) => void router.navigate({ to: "/eventos/$eventoId", params: { eventoId: e.id } });

  // Arrastar remarca. No mês só o dia muda (a hora fica); na semana e no
  // dia, soltar numa linha de horário muda a hora também (`hora` definida).
  // A tela muda na hora; se o banco recusar, volta.
  const mover = useMutation({
    mutationFn: ({ item, data, hora }: { item: Item; data: string; hora?: string | null }) => {
      const mudanca = hora === undefined ? { data } : { data, hora };
      return item.tipo === "post" ? atualizarConteudo(item.id, mudanca) : atualizarTarefa(item.id, mudanca);
    },
    onMutate: async ({ item, data, hora }) => {
      // Chave sem tipo: a lista é de posts ou de tarefas, e as duas têm id/data.
      const chave: readonly unknown[] = item.tipo === "post" ? consultaPosts.queryKey : consultaTarefas.queryKey;
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData(chave);
      qc.setQueryData<{ id: string; data: string; hora: string | null }[]>(chave, (l = []) =>
        l.map((x) => (x.id === item.id ? { ...x, data, ...(hora === undefined ? {} : { hora }) } : x)),
      );
      return { antes, chave };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.chave, ctx.antes);
      toast((e as Error).message, "error");
    },
    onSuccess: (_r, { data, hora }) =>
      toast(`Remarcado para ${deYmd(data).toLocaleDateString("pt-BR")}${hora ? ` às ${hora.slice(0, 5)}` : ""}.`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["conteudos"] });
      void qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
  });

  function soltar(e: DragEvent, dia: string, faixa: Faixa) {
    e.preventDefault();
    setAlvo(null);
    const [t, id] = e.dataTransfer.getData("text/item").split(":");
    const item = itens.find((i) => i.tipo === t && i.id === id);
    if (!item) return;

    // Mês: só o dia. "Sem horário": tira a hora. Linha de hora: troca a hora
    // e mantém os minutos que o item já tinha (18:30 solto nas 10h vira 10:30).
    const hora =
      faixa === undefined
        ? undefined
        : faixa === "sem"
          ? null
          : `${doisDigitos(faixa)}:${item.hora ? item.hora.slice(3, 5) : "00"}:00`;
    const mesmaHora = hora === undefined || (hora ?? null) === (item.hora ? `${item.hora.slice(0, 5)}:00` : null);
    if (item.data === dia && mesmaHora) return;
    mover.mutate(hora === undefined ? { item, data: dia } : { item, data: dia, hora });
  }

  /** Marca do alvo do arraste: o dia, e a linha de horário quando há uma. */
  const chaveDoAlvo = (dia: string, faixa: Faixa) => (faixa === undefined ? dia : `${dia}|${faixa}`);

  const soltavel = (dia: string, faixa?: Faixa) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      const chave = chaveDoAlvo(dia, faixa);
      if (alvo !== chave) setAlvo(chave);
    },
    onDragLeave: () => setAlvo((a) => (a === chaveDoAlvo(dia, faixa) ? null : a)),
    onDrop: (e: DragEvent) => soltar(e, dia, faixa),
    // Duplo clique no vazio: cria naquele dia (e naquela hora, se houver).
    onDoubleClick: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      novaNoDia(dia, typeof faixa === "number" ? `${doisDigitos(faixa)}:00` : null);
    },
  });

  if (!projeto) {
    return (
      <div className="flex flex-col gap-5">
        <TopBar titulo={tituloDaTela} />
        <Card>
          <EmptyState icone={<CalendarDays size={20} strokeWidth={1.8} aria-hidden />} titulo="Nenhum cliente escolhido">
            Escolha um cliente no menu para ver o calendário dele.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const unidade = UNIDADE[visao];
  const diaPadrao = periodo.includes(hoje) ? hoje : visao === "mes" ? `${prefixoMes}-01` : periodo[0]!;
  const nomeDoMes = fmt(ref, { month: "long" });
  // "Outubro 2026" no mês; na semana e no dia, o intervalo por extenso.
  const titulo =
    visao === "mes" ? `${capitalizar(nomeDoMes)} ${ref.slice(0, 4)}` : tituloPeriodo(visao, ref).replace(" – ", " a ");

  const celula = (dia: string) => ({
    dia,
    hoje: dia === hoje,
    alvo: alvo === dia,
    eventos: eventosDoDia(dia),
    itens: doDia(dia),
    soltavel: soltavel(dia),
    onAbrirDia: () => {
      setRef(dia);
      setVisao("dia");
    },
    onNova: () => novaNoDia(dia),
    oQueCria: criaPost ? ("postagem" as const) : ("tarefa" as const),
    onAbrir: abrirItem,
    onAbrirEvento: abrirEvento,
  });

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo={tituloDaTela}
        subtitulo={
          mods.conteudo
            ? `Posts programados e tarefas avulsas de ${projeto.nome}`
            : `Tarefas avulsas de ${projeto.nome}`
        }
        acoes={
          <>
            <button type="button" onClick={() => setEdicao({ modo: "novo", data: diaPadrao })} className="btn btn-secundario">
              <Plus size={16} strokeWidth={2.2} aria-hidden />
              Nova tarefa
            </button>
            {mods.conteudo && (
              <Link to={rota} search={{ novo: true, data: diaPadrao }} className="btn btn-primario">
                <Plus size={16} strokeWidth={2.2} aria-hidden />
                Nova postagem
              </Link>
            )}
          </>
        }
      />

      {resumoDePosts && mods.conteudo && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
          {STATUS_POST.map((s) => {
            const n = doMes.filter((p) => p.status === s).length;
            return (
              <div key={s} className="flex flex-col gap-2 rounded-[18px] border border-borda bg-white px-[18px] py-4">
                <span
                  className="self-start rounded-lg px-2.5 py-1 text-[12px] font-bold"
                  style={{ background: COR_POST[s].fundo, color: COR_POST[s].texto }}
                >
                  {STATUS_CONTEUDO_LABEL[s]}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <strong className="text-[24px] font-extrabold leading-tight">{n}</strong>
                  <span className="text-[12px] text-texto-3">
                    {n === 1 ? "post" : "posts"} em {nomeDoMes}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {erroTarefas && faltaTabelaTarefas(erroTarefas) && (
        <p className="m-0 rounded-[14px] bg-alerta-fundo px-4 py-3 text-[13px] text-alerta">
          As tarefas avulsas ainda não foram ativadas no banco deste portal. Posts e eventos aparecem normalmente.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <section aria-label={titulo} className="flex min-w-0 flex-col gap-4 rounded-[20px] border border-borda bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => andar(-1)}
                aria-label={`${capitalizar(unidade)} anterior`}
                className="btn btn-secundario w-11 p-0"
              >
                <ChevronLeft size={18} strokeWidth={2} aria-hidden />
              </button>
              <h2 className="mx-1.5 my-0 text-[18px] font-extrabold">{titulo}</h2>
              <button
                type="button"
                onClick={() => andar(1)}
                aria-label={`Próxim${visao === "semana" ? "a" : "o"} ${unidade}`}
                className="btn btn-secundario w-11 p-0"
              >
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </button>
              <button type="button" onClick={() => setRef(hoje)} className="btn btn-secundario ml-1 px-3.5">
                Hoje
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {mods.eventos ? (
                <button
                  type="button"
                  onClick={() => setComEventos((v) => !v)}
                  aria-pressed={comEventos}
                  title={comEventos ? "Esconder os eventos do calendário" : "Mostrar os eventos no calendário"}
                  className={`btn btn-secundario gap-1.5 px-3 text-[12px] ${comEventos ? "!border-azul !bg-azul-claro text-azul" : ""}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${comEventos ? "bg-azul" : "bg-nevoa"}`} />
                  Eventos
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Módulo Eventos não contratado"
                  className="flex min-h-11 items-center gap-1.5 rounded-[12px] border border-dashed border-nevoa bg-transparent px-3 text-[12px] font-semibold text-[#6B7682]"
                >
                  <Lock size={14} strokeWidth={2} aria-hidden />
                  Eventos
                </button>
              )}
              <SegmentedControl rotulo="Visualização" opcoes={VISOES} valor={visao} onChange={setVisao} className="[&>button]:px-4" />
            </div>
          </div>

          {visao === "mes" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[760px] overflow-hidden rounded-[14px] border border-borda">
                <div className="grid grid-cols-7 border-b border-borda bg-superficie-2">
                  {DIAS_DA_SEMANA.map((d) => (
                    <span key={d} className="px-3 py-[11px] text-[11px] font-bold tracking-[0.1em] text-texto-3">
                      {d}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {periodo.map((dia) => (
                    <Celula key={dia} {...celula(dia)} fora={!dia.startsWith(prefixoMes)} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <GradeHorarios
              dias={periodo}
              hoje={hoje}
              alvo={alvo}
              itensDoDia={doDia}
              eventosDoDia={eventosDoDia}
              soltavel={soltavel}
              chaveDoAlvo={chaveDoAlvo}
              onAbrirDia={(dia) => {
                setRef(dia);
                setVisao("dia");
              }}
              onAbrir={abrirItem}
              onAbrirEvento={abrirEvento}
            />
          )}

          <span className="text-[12px] text-texto-3">
            {visao === "mes"
              ? `Arraste um post ou uma tarefa para outro dia para remarcar. Dois cliques num espaço vazio criam uma ${criaPost ? "postagem" : "tarefa"}.`
              : `Arraste um post ou uma tarefa para outro dia ou horário para remarcar. Dois cliques num espaço vazio criam uma ${criaPost ? "postagem" : "tarefa"} naquele horário.`}
          </span>
        </section>

        {resumoDePosts && mods.conteudo && (
          <div className="flex flex-wrap items-stretch gap-4">
            <section className="flex min-w-0 flex-[3_1_602px] flex-col gap-3 rounded-[20px] border border-borda bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[16px] font-bold">Esperando aprovação</h2>
                <span
                  className="rounded-full px-[9px] py-[3px] text-[12px] font-bold"
                  style={{ background: COR_POST.aprovacao.fundo, color: COR_POST.aprovacao.texto }}
                >
                  {emAprovacao.length}
                </span>
              </div>
              {emAprovacao.length === 0 ? (
                <p className="m-0 text-[13px] text-texto-3">Nenhum post de {nomeDoMes} esperando o cliente aprovar.</p>
              ) : (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
                  {emAprovacao.map((p) => {
                    const recado = recados[p.id];
                    return (
                      <Link
                        key={p.id}
                        to={rota}
                        search={{ abrir: p.id }}
                        className="flex flex-col gap-1.5 rounded-[14px] bg-superficie-2 p-3.5 text-marinho no-underline transition-colors hover:bg-gelo"
                      >
                        <span className="text-[11px] font-bold tracking-[0.04em] text-texto-3">{metaDoPost(p)}</span>
                        <span className="text-[13px] font-bold leading-[1.35]">{p.titulo}</span>
                        {recado && (
                          <span className="flex gap-2 rounded-[10px] bg-white px-2.5 py-2 text-[12px] leading-[1.45] text-texto-2">
                            <strong className="flex-none font-bold text-marinho">{recado.autor_nome.split(" ")[0] || "Recado"}:</strong>
                            <span className="line-clamp-3 [overflow-wrap:anywhere]">{separarCard(recado.texto).texto}</span>
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="flex min-w-0 flex-[2_1_420px] flex-col gap-3 rounded-[20px] bg-marinho p-5 text-gelo">
              <h2 className="m-0 text-[16px] font-bold">Sem arte anexada</h2>
              <span className="text-[12px] text-[#C9D6E6]">Posts agendados que ainda não têm imagem ou vídeo</span>
              {semArte.length === 0 ? (
                <p className="m-0 rounded-[14px] bg-[#24395A] px-3 py-3.5 text-[13px] text-[#C9D6E6]">
                  Todos os posts agendados de {nomeDoMes} já têm arte.
                </p>
              ) : (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
                  {semArte.map((p) => (
                    <Link
                      key={p.id}
                      to={rota}
                      search={{ abrir: p.id }}
                      className="flex min-h-14 items-center gap-3 rounded-[14px] bg-[#24395A] px-3 py-2.5 text-white no-underline transition-colors hover:bg-marinho-hover focus-visible:outline-white"
                    >
                      <span className="flex h-[42px] w-[42px] flex-none flex-col items-center justify-center rounded-[10px] bg-white text-marinho">
                        <span className="text-[9px] font-bold">{fmt(p.data, { weekday: "short" }).replace(".", "").toUpperCase()}</span>
                        <span className="text-[15px] font-extrabold leading-tight">{p.data.slice(8, 10)}</span>
                      </span>
                      <span className="flex-1 text-[13px] font-semibold leading-[1.35]">{p.titulo}</span>
                      <ChevronRight size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {novo && mods.conteudo && (
        <NovaPostagem
          projeto={projeto}
          // key: abrir de novo em outro dia ou hora recomeça o formulário.
          key={`${dataDoLink ?? ""}-${horaDoLink ?? ""}`}
          dataInicial={dataDoLink ?? diaPadrao}
          horaInicial={horaDoLink ?? null}
          onFechar={fecharPopup}
        />
      )}

      {postAberto &&
        mods.conteudo &&
        (editar ? (
          <NovaPostagem
            key={`editar-${postAberto.id}`}
            projeto={projeto}
            conteudo={postAberto}
            dataInicial={postAberto.data}
            // Sair da edição volta para os detalhes do mesmo post.
            onFechar={() => void router.navigate({ to: rota, search: { abrir: postAberto.id }, replace: true })}
          />
        ) : (
          <PostDetalhe
            key={postAberto.id}
            conteudo={postAberto}
            projeto={projeto}
            onEditar={() => void router.navigate({ to: rota, search: { abrir: postAberto.id, editar: true } })}
            onFechar={fecharPopup}
          />
        ))}

      {edicao && (
        <FormTarefa
          key={edicao.modo === "editar" ? edicao.tarefa.id : `novo-${edicao.data}-${edicao.hora ?? ""}`}
          edicao={edicao}
          projectId={projeto.id}
          cliente={projeto.nome}
          onFechar={() => setEdicao(null)}
        />
      )}
    </div>
  );
}

/* ── Peças da grade ─────────────────────────────────────────────── */

type PropsDia = {
  dia: string;
  hoje: boolean;
  alvo: boolean;
  eventos: Evento[];
  itens: Item[];
  soltavel: Record<string, unknown>;
  onAbrirDia: () => void;
  onNova: () => void;
  /** O que o "+" do dia cria: muda só o texto do botão. */
  oQueCria: "tarefa" | "postagem";
  onAbrir: (i: Item) => void;
  onAbrirEvento: (e: Evento) => void;
};

/** Um dia na grade do mês. */
function Celula({ fora, ...p }: PropsDia & { fora: boolean }) {
  return (
    <div
      {...p.soltavel}
      className={`group box-border flex min-h-[156px] flex-col gap-1.5 border-b border-r border-gelo p-2.5 transition-colors ${p.alvo ? "bg-azul-claro-2 shadow-[inset_0_0_0_2px_#1A66C2]" : fora ? "bg-superficie-3" : p.hoje ? "bg-azul-claro" : "bg-white"}`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={p.onAbrirDia}
          title="Abrir o dia"
          aria-label={`Abrir ${diaExtenso(p.dia)}`}
          aria-current={p.hoje ? "date" : undefined}
          className={`flex h-7 w-7 items-center justify-center rounded-full border-0 text-[13px] font-bold transition-colors ${
            p.hoje ? "bg-azul text-white" : fora ? "bg-transparent text-texto-4 hover:bg-gelo" : "bg-transparent text-marinho hover:bg-gelo"
          }`}
        >
          {deYmd(p.dia).getDate()}
        </button>
        <button
          type="button"
          onClick={p.onNova}
          aria-label={`Nova ${p.oQueCria} em ${deYmd(p.dia).toLocaleDateString("pt-BR")}`}
          title={`Nova ${p.oQueCria} neste dia`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent text-texto-3 opacity-0 transition hover:bg-gelo hover:text-marinho focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Plus size={14} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      {p.eventos.map((e) => (
        <FaixaEvento key={e.id} e={e} dia={p.dia} onAbrir={() => p.onAbrirEvento(e)} />
      ))}
      {p.itens.map((it) => (
        <ChipItem key={`${it.tipo}-${it.id}`} item={it} onAbrir={() => p.onAbrir(it)} />
      ))}
    </div>
  );
}

/**
 * Semana e dia: uma coluna de horários na lateral e uma coluna por dia.
 * Cada item fica na linha da sua hora; o que não tem horário (e os eventos,
 * que valem o dia inteiro) fica na primeira linha, "Sem horário".
 */
function GradeHorarios({
  dias,
  hoje,
  alvo,
  itensDoDia,
  eventosDoDia,
  soltavel,
  chaveDoAlvo,
  onAbrirDia,
  onAbrir,
  onAbrirEvento,
}: {
  dias: string[];
  hoje: string;
  alvo: string | null;
  itensDoDia: (dia: string) => Item[];
  eventosDoDia: (dia: string) => Evento[];
  soltavel: (dia: string, faixa: Faixa) => Record<string, unknown>;
  chaveDoAlvo: (dia: string, faixa: Faixa) => string;
  onAbrirDia: (dia: string) => void;
  onAbrir: (i: Item) => void;
  onAbrirEvento: (e: Evento) => void;
}) {
  const porDia = dias.map((dia) => ({ dia, itens: itensDoDia(dia), eventos: eventosDoDia(dia) }));

  // A faixa padrão vai das 7h às 21h; um item às 5h ou às 23h a estica.
  const comHora = porDia.flatMap((d) => d.itens.map((i) => horaDoItem(i.hora))).filter((h): h is number => h != null);
  const primeira = Math.min(HORA_INICIAL, ...comHora);
  const ultima = Math.max(HORA_FINAL, ...comHora);
  const horas = Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i);

  const umDia = dias.length === 1;
  const colunas = { gridTemplateColumns: `76px repeat(${dias.length}, minmax(0, 1fr))` };
  const rotuloDaLinha = "border-r border-gelo px-2 py-2.5 text-right text-[11px] font-bold tabular-nums text-texto-3";

  const fundo = (dia: string, faixa: Faixa) =>
    alvo === chaveDoAlvo(dia, faixa)
      ? "bg-azul-claro-2 shadow-[inset_0_0_0_2px_#1A66C2]"
      : dia === hoje
        ? "bg-azul-claro"
        : "bg-white";

  return (
    <div className="overflow-x-auto">
      <div className={`overflow-hidden rounded-[14px] border border-borda ${umDia ? "" : "min-w-[860px]"}`} role="grid" aria-label="Agenda por horário">
        <div className="grid border-b border-borda bg-superficie-2" style={colunas} role="row">
          <span className="border-r border-borda px-2 py-[11px] text-right text-[11px] font-bold tracking-[0.1em] text-texto-3">HORA</span>
          {dias.map((dia) => {
            const eHoje = dia === hoje;
            return (
              <button
                key={dia}
                type="button"
                onClick={() => onAbrirDia(dia)}
                disabled={umDia}
                title={umDia ? undefined : "Abrir o dia"}
                aria-label={diaExtenso(dia)}
                aria-current={eHoje ? "date" : undefined}
                className="flex items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left transition-colors enabled:hover:bg-gelo"
              >
                <span className={`text-[11px] font-bold tracking-[0.1em] ${eHoje ? "text-azul" : "text-texto-3"}`}>
                  {DIAS_DA_SEMANA[deYmd(dia).getDay()]}
                </span>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                    eHoje ? "bg-azul text-white" : "text-marinho"
                  }`}
                >
                  {deYmd(dia).getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid border-b border-borda" style={colunas} role="row">
          <span className={`${rotuloDaLinha} leading-tight`}>
            Sem
            <br />
            horário
          </span>
          {porDia.map(({ dia, itens, eventos }) => (
            <div
              key={dia}
              {...soltavel(dia, "sem")}
              role="gridcell"
              className={`flex min-h-[56px] flex-col gap-1.5 border-r border-gelo p-1.5 transition-colors ${fundo(dia, "sem")}`}
            >
              {eventos.map((e) => (
                <FaixaEvento key={e.id} e={e} dia={dia} onAbrir={() => onAbrirEvento(e)} />
              ))}
              {itens
                .filter((i) => !i.hora)
                .map((it) => (
                  <ChipItem key={`${it.tipo}-${it.id}`} item={it} onAbrir={() => onAbrir(it)} solto />
                ))}
            </div>
          ))}
        </div>

        {horas.map((h) => (
          <div key={h} className="grid border-b border-gelo last:border-b-0" style={colunas} role="row">
            <span className={rotuloDaLinha}>{doisDigitos(h)}:00</span>
            {porDia.map(({ dia, itens }) => (
              <div
                key={dia}
                {...soltavel(dia, h)}
                role="gridcell"
                aria-label={`${diaExtenso(dia)}, ${doisDigitos(h)}h`}
                className={`flex min-h-[60px] flex-col gap-1.5 border-r border-gelo p-1.5 transition-colors ${fundo(dia, h)}`}
              >
                {itens
                  .filter((i) => horaDoItem(i.hora) === h)
                  .map((it) => (
                    <ChipItem key={`${it.tipo}-${it.id}`} item={it} onAbrir={() => onAbrir(it)} solto />
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Faixa do evento no dia: o nome só no 1º dia (ou no domingo), pra ler como uma barra contínua. */
function FaixaEvento({ e, dia, onAbrir }: { e: Evento; dia: string; onAbrir: () => void }) {
  const inicio = dia === e.data_inicio || deYmd(dia).getDay() === 0;
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`Evento: ${e.nome}`}
      className="flex flex-col gap-0.5 rounded-[10px] border-0 bg-marinho px-2 py-1.5 text-left text-white transition-colors hover:bg-marinho-hover"
    >
      <span className="text-[10px] font-bold tracking-[0.04em] text-[#C9D6E6]">{inicio ? "EVENTO" : "EVENTO · CONTINUA"}</span>
      <span className="line-clamp-2 text-[12px] font-semibold leading-[1.3]">{e.nome}</span>
    </button>
  );
}

/**
 * Post ou tarefa. Post leva a cor do status; tarefa é branca com contorno
 * tracejado. `solto` = sem cortar o título em duas linhas (semana e dia).
 */
function ChipItem({ item, onAbrir, solto = false }: { item: Item; onAbrir: () => void; solto?: boolean }) {
  const hora = hhmm(item.hora);
  const post = item.tipo === "post" ? item.post : null;
  const concluida = item.tipo === "tarefa" && item.tarefa.status === "concluido";
  const cor = post ? COR_POST[post.status] : null;

  const meta = post
    ? [hora, FORMATO_LABEL[post.formato].toUpperCase()].filter(Boolean).join(" · ")
    : [hora, "TAREFA"].filter(Boolean).join(" · ");
  const dica = post
    ? `Post · ${STATUS_CONTEUDO_LABEL[post.status]}\n${item.titulo}`
    : `Tarefa · ${STATUS_TAREFA_LABEL[(item as Extract<Item, { tipo: "tarefa" }>).tarefa.status]}\n${item.titulo}`;

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/item", `${item.tipo}:${item.id}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onAbrir}
      title={dica}
      className={`chip-post flex cursor-grab flex-col gap-0.5 rounded-[10px] border px-2 py-1.5 text-left active:cursor-grabbing ${
        post ? "" : "border-dashed border-nevoa bg-white text-[#4A5868]"
      }`}
      style={cor ? { background: cor.fundo, color: cor.texto, borderColor: cor.fundo } : undefined}
    >
      <span className="text-[10px] font-bold tracking-[0.04em]">{meta}</span>
      <span className={`text-[12px] font-semibold leading-[1.3] ${solto ? "" : "line-clamp-2"} ${concluida ? "line-through opacity-70" : ""}`}>
        {item.titulo}
      </span>
    </button>
  );
}

/* ── Tarefa: criar / editar ─────────────────────────────────────── */

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-[13px] font-bold">
      {rotulo}
      {children}
    </label>
  );
}

function FormTarefa({
  edicao,
  projectId,
  cliente,
  onFechar,
}: {
  edicao: EdicaoTarefa;
  projectId: string;
  cliente: string;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const editando = edicao.modo === "editar" ? edicao.tarefa : null;
  const [f, setF] = useState<TarefaEntrada>(() =>
    editando
      ? {
          titulo: editando.titulo,
          descricao: editando.descricao,
          data: editando.data,
          hora: editando.hora,
          status: editando.status,
          responsavel: editando.responsavel,
        }
      : {
          titulo: "",
          descricao: null,
          data: edicao.modo === "novo" ? edicao.data : "",
          hora: edicao.modo === "novo" ? (edicao.hora ?? null) : null,
          status: "a_fazer",
          responsavel: null,
        },
  );
  const [confirmando, setConfirmando] = useState(false);
  const set = <K extends keyof TarefaEntrada>(k: K, v: TarefaEntrada[K]) => setF((a) => ({ ...a, [k]: v }));

  const salvar = useMutation({
    mutationFn: () => {
      const limpo = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const dados: TarefaEntrada = {
        ...f,
        titulo: f.titulo.trim(),
        hora: f.hora || null,
        descricao: limpo(f.descricao),
        responsavel: limpo(f.responsavel),
      };
      return editando ? atualizarTarefa(editando.id, dados) : criarTarefa(projectId, dados);
    },
    onSuccess: () => {
      toast(editando ? "Tarefa atualizada." : "Tarefa criada.");
      void qc.invalidateQueries({ queryKey: ["tarefas"] });
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const excluir = useMutation({
    mutationFn: () => excluirTarefa(editando!.id),
    onSuccess: () => {
      toast("Tarefa excluída.");
      void qc.invalidateQueries({ queryKey: ["tarefas"] });
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const valido = Boolean(f.titulo.trim() && f.data);

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      largura={620}
      icone={<SquareCheckBig size={26} strokeWidth={1.8} aria-hidden />}
      titulo={editando ? "Tarefa" : "Nova tarefa"}
      selo={cliente}
      contexto="Um lembrete avulso no calendário"
      rodape={
        <>
          {editando ? (
            confirmando ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold text-erro-texto">Excluir para sempre?</span>
                <button
                  type="button"
                  onClick={() => excluir.mutate()}
                  disabled={excluir.isPending}
                  className="btn btn-40 bg-erro text-white hover:bg-erro-texto"
                >
                  {excluir.isPending ? "Excluindo…" : "Sim, excluir"}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} className="btn btn-secundario btn-40">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex min-h-11 items-center gap-2 rounded-[12px] border-0 bg-transparent px-3 text-[13px] font-bold text-erro-texto transition-colors hover:bg-erro-fundo"
              >
                <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                Excluir tarefa
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <button type="button" onClick={onFechar} className="btn btn-secundario min-h-[46px] font-bold">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => valido && salvar.mutate()}
              disabled={!valido || salvar.isPending}
              className="btn btn-primario min-h-[46px] px-5"
            >
              {salvar.isPending ? "Salvando…" : editando ? "Salvar alterações" : "Criar tarefa"}
            </button>
          </div>
        </>
      }
    >
      <Campo rotulo="Título">
        <input
          autoFocus
          value={f.titulo}
          onChange={(e) => set("titulo", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valido) salvar.mutate();
          }}
          placeholder="Ex.: Reunião de alinhamento com o cliente"
          className="campo font-medium"
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data">
          <input type="date" required value={f.data} onChange={(e) => set("data", e.target.value)} className="campo font-medium" />
        </Campo>
        <Campo rotulo="Horário (opcional)">
          <input
            type="time"
            value={hhmm(f.hora) ?? ""}
            onChange={(e) => set("hora", e.target.value || null)}
            className="campo font-medium"
          />
        </Campo>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-bold">Status</span>
        <SegmentedControl
          rotulo="Status da tarefa"
          valor={f.status}
          onChange={(s) => set("status", s)}
          opcoes={(Object.keys(STATUS_TAREFA_LABEL) as StatusTarefa[]).map((s) => ({ id: s, rotulo: STATUS_TAREFA_LABEL[s] }))}
        />
      </div>

      <Campo rotulo="Responsável">
        <input
          value={f.responsavel ?? ""}
          onChange={(e) => set("responsavel", e.target.value)}
          placeholder="Ex.: Carol"
          className="campo font-medium"
        />
      </Campo>

      <Campo rotulo="Descrição">
        <textarea
          rows={4}
          value={f.descricao ?? ""}
          onChange={(e) => set("descricao", e.target.value)}
          placeholder="Detalhes, pauta, links…"
          className="campo resize-y py-3 font-medium"
        />
      </Campo>

      {editando?.criado_por_nome && (
        <span className="text-[12px] text-texto-3">
          Criada por <strong className="text-marinho">{editando.criado_por_nome}</strong> em{" "}
          {new Date(editando.criado_em).toLocaleDateString("pt-BR")}
        </span>
      )}
    </ModalDegrade>
  );
}
