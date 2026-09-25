import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  PartyPopper,
  Plus,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import { COR_STATUS_CAL } from "@/components/conteudo";
import { Modal } from "@/components/modal";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import {
  capitalizar,
  deYmd,
  diaExtenso,
  gradeDoMes,
  hhmm,
  SEMANA,
  semanaDe,
  somarDias,
  tituloPeriodo,
  ymd,
} from "@/lib/datas";
import {
  atualizarConteudo,
  atualizarTarefa,
  conteudosQuery,
  criarTarefa,
  eventosQuery,
  excluirTarefa,
  faltaTabelaTarefas,
  tarefasQuery,
} from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Conteudo, Evento, StatusTarefa, Tarefa, TarefaEntrada } from "@/lib/types";
import { modulosDe, STATUS_CONTEUDO_LABEL, STATUS_TAREFA_LABEL } from "@/lib/types";

/**
 * Calendário geral do cliente: tudo o que está sendo feito, num lugar só —
 * os eventos (nos dias em que acontecem), os posts programados e as tarefas
 * avulsas. Clicar abre o item onde ele é editado: o post na Programação de
 * Postagem, o evento na página dele, a tarefa aqui mesmo.
 */
export const Route = createFileRoute("/_authed/calendario")({ component: Calendario });

type Visao = "mes" | "semana" | "dia";
type Tipo = "todos" | "posts" | "tarefas" | "eventos";

/** Post ou tarefa, com o que a grade precisa pra desenhar e ordenar. */
type Item =
  | { tipo: "post"; id: string; data: string; hora: string | null; titulo: string; post: Conteudo }
  | { tipo: "tarefa"; id: string; data: string; hora: string | null; titulo: string; tarefa: Tarefa };

type EdicaoTarefa = { modo: "novo"; data: string } | { modo: "editar"; tarefa: Tarefa };

const UNIDADE = { mes: "mês", semana: "semana", dia: "dia" } as const;
const NOME_VISAO = { mes: "Mês", semana: "Semana", dia: "Dia" } as const;

const COR_TAREFA: Record<StatusTarefa, string> = {
  a_fazer: "text-slate-500",
  fazendo: "text-sky-500",
  concluido: "text-emerald-500",
};

/** Um evento cobre o dia se ele cai entre o início e o fim. */
const cobre = (e: Evento, dia: string) => e.data_inicio <= dia && dia <= (e.data_fim ?? e.data_inicio);

function Calendario() {
  const { projeto } = usePainel();
  const router = useRouter();
  const qc = useQueryClient();
  const mods = modulosDe(projeto);

  const hoje = ymd(new Date());
  const [ref, setRef] = useState(hoje);
  // Abre no mês: o Calendário é a visão geral, e o mês mostra o todo.
  const [visao, setVisao] = useState<Visao>("mes");
  const [tipo, setTipo] = useState<Tipo>("todos");
  const [edicao, setEdicao] = useState<EdicaoTarefa | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const periodo = useMemo(
    () => (visao === "mes" ? gradeDoMes(deYmd(ref)) : visao === "semana" ? semanaDe(ref) : [ref]),
    [visao, ref],
  );
  const de = periodo[0]!;
  const ate = periodo[periodo.length - 1]!;

  // Cada fonte só é buscada se o módulo dela está ligado pro cliente.
  const consultaPosts = conteudosQuery(projeto?.id, de, ate);
  const { data: posts = [] } = useQuery({ ...consultaPosts, enabled: Boolean(projeto?.id) && mods.conteudo });
  const consultaTarefas = tarefasQuery(projeto?.id, de, ate);
  const { data: tarefas = [], error: erroTarefas } = useQuery(consultaTarefas);
  const { data: eventos = [] } = useQuery({
    ...eventosQuery(projeto?.id),
    enabled: Boolean(projeto?.id) && mods.eventos,
  });

  const mostra = (t: Exclude<Tipo, "todos">) => tipo === "todos" || tipo === t;

  const itens: Item[] = [
    ...(mostra("posts")
      ? posts.map((p) => ({ tipo: "post" as const, id: p.id, data: p.data, hora: p.hora, titulo: p.titulo, post: p }))
      : []),
    ...(mostra("tarefas")
      ? tarefas.map((t) => ({ tipo: "tarefa" as const, id: t.id, data: t.data, hora: t.hora, titulo: t.titulo, tarefa: t }))
      : []),
  ];
  // Sem horário vai pro fim do dia, como na Programação.
  const doDia = (dia: string) =>
    itens
      .filter((i) => i.data === dia)
      .sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
  const eventosDoDia = (dia: string) =>
    mostra("eventos") ? eventos.filter((e) => e.status !== "cancelado" && cobre(e, dia)) : [];

  const prefixoMes = ref.slice(0, 7);

  function andar(delta: number) {
    setRef((r) => {
      if (visao === "semana") return somarDias(r, 7 * delta);
      if (visao === "dia") return somarDias(r, delta);
      const d = deYmd(r);
      return ymd(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    });
  }

  function abrirItem(i: Item) {
    if (i.tipo === "post") void router.navigate({ to: "/postagens", search: { abrir: i.id } });
    else setEdicao({ modo: "editar", tarefa: i.tarefa });
  }
  const abrirEvento = (e: Evento) => void router.navigate({ to: "/eventos/$eventoId", params: { eventoId: e.id } });

  // Arrastar pra outro dia remarca (a hora fica). A tela muda na hora; se o
  // banco recusar, volta.
  const mover = useMutation({
    mutationFn: ({ item, data }: { item: Item; data: string }) =>
      item.tipo === "post" ? atualizarConteudo(item.id, { data }) : atualizarTarefa(item.id, { data }),
    onMutate: async ({ item, data }) => {
      // Chave sem tipo: a lista é de posts ou de tarefas, e as duas têm id/data.
      const chave: readonly unknown[] = item.tipo === "post" ? consultaPosts.queryKey : consultaTarefas.queryKey;
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData(chave);
      qc.setQueryData<{ id: string; data: string }[]>(chave, (l = []) =>
        l.map((x) => (x.id === item.id ? { ...x, data } : x)),
      );
      return { antes, chave };
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.chave, ctx.antes);
      toast((e as Error).message, "error");
    },
    onSuccess: (_r, { data }) => toast(`Remarcado para ${deYmd(data).toLocaleDateString("pt-BR")}.`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["conteudos"] });
      void qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
  });

  function soltar(e: DragEvent, dia: string) {
    e.preventDefault();
    setAlvo(null);
    const [t, id] = e.dataTransfer.getData("text/item").split(":");
    const item = itens.find((i) => i.tipo === t && i.id === id);
    if (item && item.data !== dia) mover.mutate({ item, data: dia });
  }

  const soltavel = (dia: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (alvo !== dia) setAlvo(dia);
    },
    onDragLeave: () => setAlvo((a) => (a === dia ? null : a)),
    onDrop: (e: DragEvent) => soltar(e, dia),
    // Duplo clique no vazio: nova tarefa naquele dia.
    onDoubleClick: (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest("button, a")) setEdicao({ modo: "novo", data: dia });
    },
  });

  if (!projeto) {
    return (
      <>
        <Cabecalho titulo="Calendário" comCampanha={false} />
        <Card>
          <Vazio>Escolha um cliente no menu para ver o calendário dele.</Vazio>
        </Card>
      </>
    );
  }

  const tipos: { id: Tipo; rotulo: string }[] = [
    { id: "todos", rotulo: "Tudo" },
    ...(mods.conteudo ? [{ id: "posts" as const, rotulo: "Posts" }] : []),
    { id: "tarefas", rotulo: "Tarefas" },
    ...(mods.eventos ? [{ id: "eventos" as const, rotulo: "Eventos" }] : []),
  ];

  const unidade = UNIDADE[visao];
  const diaPadrao = periodo.includes(hoje) && (visao !== "mes" || hoje.startsWith(prefixoMes)) ? hoje : visao === "mes" ? `${prefixoMes}-01` : de;
  const noPeriodo = visao === "mes" ? periodo.filter((d) => d.startsWith(prefixoMes)) : periodo;

  return (
    <>
      <Cabecalho titulo="Calendário" comCampanha={false}>
        <button
          onClick={() => setEdicao({ modo: "novo", data: diaPadrao })}
          className="flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim"
        >
          <Plus size={15} /> Nova tarefa
        </button>
      </Cabecalho>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <BotaoIcone rotulo={`${capitalizar(unidade)} anterior`} onClick={() => andar(-1)}>
            <ChevronLeft size={16} />
          </BotaoIcone>
          <h2 className="display min-w-40 px-1 text-center text-base font-semibold text-ink">
            {tituloPeriodo(visao, ref)}
          </h2>
          <BotaoIcone rotulo={`Próxim${visao === "semana" ? "a" : "o"} ${unidade}`} onClick={() => andar(1)}>
            <ChevronRight size={16} />
          </BotaoIcone>
        </div>
        <button
          onClick={() => setRef(hoje)}
          className="rounded-full border border-line/70 bg-surface px-3 py-1.5 text-sm text-ink transition hover:border-gold/50"
        >
          Hoje
        </button>

        <div className="flex flex-wrap gap-3 sm:ml-auto">
          <Alternador valores={tipos} ativo={tipo} onEscolher={setTipo} />
          <Alternador
            valores={(["mes", "semana", "dia"] as const).map((v) => ({ id: v, rotulo: NOME_VISAO[v] }))}
            ativo={visao}
            onEscolher={setVisao}
          />
        </div>
      </div>

      <Legenda mods={mods} />

      {erroTarefas && faltaTabelaTarefas(erroTarefas) && (
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          As tarefas avulsas ainda não foram ativadas no banco (supabase/26_tarefas.sql). Eventos e posts aparecem
          normalmente.
        </p>
      )}

      {/* ── Mês ── */}
      {visao === "mes" && (
        <div className="hidden md:block">
          <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm shadow-black/5">
            <div className="grid grid-cols-7 border-b border-line/70">
              {SEMANA.map((d) => (
                <div key={d} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {periodo.map((dia, i) => {
                const fora = !dia.startsWith(prefixoMes);
                return (
                  <div
                    key={dia}
                    {...soltavel(dia)}
                    className={`group relative min-h-32 border-line/50 p-1.5 transition-colors ${
                      i % 7 !== 6 ? "border-r" : ""
                    } ${i < periodo.length - 7 ? "border-b" : ""} ${fora ? "bg-surface-2/40" : ""} ${
                      alvo === dia ? "bg-gold/10 ring-2 ring-inset ring-gold/50" : ""
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <NumeroDia
                        dia={dia}
                        hoje={hoje}
                        apagado={fora}
                        onClick={() => {
                          setRef(dia);
                          setVisao("dia");
                        }}
                      />
                      <BotaoNovo dia={dia} onClick={() => setEdicao({ modo: "novo", data: dia })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      {eventosDoDia(dia).map((e) => (
                        <FaixaEvento key={e.id} e={e} dia={dia} onAbrir={() => abrirEvento(e)} />
                      ))}
                      {doDia(dia).map((it) => (
                        <ChipItem key={`${it.tipo}-${it.id}`} item={it} onAbrir={() => abrirItem(it)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Semana: uma coluna por dia ── */}
      {visao === "semana" && (
        <div className="hidden md:block">
          <div className="grid grid-cols-7 overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm shadow-black/5">
            {periodo.map((dia, i) => (
              <div
                key={dia}
                {...soltavel(dia)}
                className={`group flex min-h-[28rem] flex-col ${i < 6 ? "border-r border-line/50" : ""} ${
                  dia === hoje ? "bg-gold/[0.04]" : ""
                } ${alvo === dia ? "bg-gold/10 ring-2 ring-inset ring-gold/50" : ""}`}
              >
                <div className="flex items-center justify-between border-b border-line/50 px-2 py-2">
                  <button
                    onClick={() => {
                      setRef(dia);
                      setVisao("dia");
                    }}
                    title="Abrir o dia"
                    className="flex items-center gap-1.5 rounded-lg px-1 transition hover:bg-surface-2"
                  >
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
                  </button>
                  <BotaoNovo dia={dia} onClick={() => setEdicao({ modo: "novo", data: dia })} />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                  {eventosDoDia(dia).map((e) => (
                    <FaixaEvento key={e.id} e={e} dia={dia} onAbrir={() => abrirEvento(e)} />
                  ))}
                  {doDia(dia).map((it) => (
                    <ChipItem key={`${it.tipo}-${it.id}`} item={it} onAbrir={() => abrirItem(it)} bloco />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dia (e a lista do celular no mês/semana) ── */}
      <div className={visao === "dia" ? "" : "md:hidden"}>
        <Lista
          dias={noPeriodo}
          hoje={hoje}
          eventosDoDia={eventosDoDia}
          doDia={doDia}
          onAbrir={abrirItem}
          onAbrirEvento={abrirEvento}
          onNova={(dia) => setEdicao({ modo: "novo", data: dia })}
          soltavel={soltavel}
          alvo={alvo}
          unDia={visao === "dia"}
        />
      </div>

      <p className="mt-3 text-xs text-muted">
        Dica: arraste um post ou tarefa para outro dia para remarcar. Dê dois cliques num espaço vazio para criar uma
        tarefa.
      </p>

      {edicao && (
        <FormTarefa
          key={edicao.modo === "editar" ? edicao.tarefa.id : `novo-${edicao.data}`}
          edicao={edicao}
          projectId={projeto.id}
          onFechar={() => setEdicao(null)}
        />
      )}
    </>
  );
}

/* ── Peças da grade ─────────────────────────────────────────────── */

function BotaoIcone({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      className="rounded-full border border-line/70 bg-surface p-1.5 text-muted transition hover:border-gold/50 hover:text-ink"
    >
      {children}
    </button>
  );
}

function Alternador<T extends string>({
  valores,
  ativo,
  onEscolher,
}: {
  valores: { id: T; rotulo: string }[];
  ativo: T;
  onEscolher: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-line/70 bg-surface-2 p-1">
      {valores.map((v) => (
        <button
          key={v.id}
          onClick={() => onEscolher(v.id)}
          aria-pressed={ativo === v.id}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            ativo === v.id ? "bg-surface font-medium text-ink shadow-sm shadow-black/5" : "text-muted hover:text-ink"
          }`}
        >
          {v.rotulo}
        </button>
      ))}
    </div>
  );
}

/** O que cada marca significa — são três tipos de coisa na mesma grade. */
function Legenda({ mods }: { mods: ReturnType<typeof modulosDe> }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
      {mods.eventos && (
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-gold" /> Evento
        </span>
      )}
      {mods.conteudo && (
        <span className="flex items-center gap-1.5">
          <Megaphone size={12} /> Post (cor = status)
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Square size={12} /> Tarefa
      </span>
    </div>
  );
}

function NumeroDia({ dia, hoje, apagado, onClick }: { dia: string; hoje: string; apagado: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Abrir o dia"
      className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs transition ${
        dia === hoje
          ? "bg-gold font-semibold text-white"
          : apagado
            ? "text-muted/60 hover:bg-surface-2"
            : "font-medium text-ink hover:bg-surface-2"
      }`}
    >
      {deYmd(dia).getDate()}
    </button>
  );
}

function BotaoNovo({ dia, onClick }: { dia: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Nova tarefa em ${deYmd(dia).toLocaleDateString("pt-BR")}`}
      className="rounded-md p-0.5 text-muted opacity-0 transition hover:bg-surface-2 hover:text-ink focus:opacity-100 group-hover:opacity-100"
    >
      <Plus size={14} />
    </button>
  );
}

/** Faixa do evento no dia: o nome só no 1º dia (ou no domingo), pra ler como uma barra contínua. */
function FaixaEvento({ e, dia, onAbrir }: { e: Evento; dia: string; onAbrir: () => void }) {
  const inicio = dia === e.data_inicio || deYmd(dia).getDay() === 0;
  return (
    <button
      onClick={onAbrir}
      title={`Evento: ${e.nome}`}
      className="flex w-full items-center gap-1 truncate rounded-md bg-gold px-1.5 py-1 text-left text-[11px] font-semibold leading-tight text-white transition hover:bg-gold-dim"
    >
      <PartyPopper size={11} className="shrink-0" />
      <span className="truncate">{inicio ? e.nome : "↳ " + e.nome}</span>
    </button>
  );
}

/**
 * Post ou tarefa. Post leva a cor do status (a mesma da Programação) e o
 * megafone; tarefa é branca com a caixinha de status. `bloco` = versão mais
 * alta da semana, com o título em até duas linhas.
 */
function ChipItem({ item, onAbrir, bloco = false }: { item: Item; onAbrir: () => void; bloco?: boolean }) {
  const hora = hhmm(item.hora);
  const post = item.tipo === "post";
  const concluida = item.tipo === "tarefa" && item.tarefa.status === "concluido";
  const Icone = post ? Megaphone : concluida ? CheckSquare : Square;
  const cor = post
    ? COR_STATUS_CAL[item.post.status].chip
    : "bg-surface text-ink ring-1 ring-inset ring-line/70";
  const titulo = post
    ? `Post · ${STATUS_CONTEUDO_LABEL[item.post.status]}\n${item.titulo}`
    : `Tarefa · ${STATUS_TAREFA_LABEL[item.tarefa.status]}${item.tarefa.responsavel ? ` · ${item.tarefa.responsavel}` : ""}\n${item.titulo}`;

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/item", `${item.tipo}:${item.id}`);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onAbrir}
      title={titulo}
      className={`flex w-full cursor-grab gap-1.5 rounded-md text-left leading-tight transition hover:brightness-95 active:cursor-grabbing ${cor} ${
        bloco ? "flex-col px-2 py-1.5 text-xs" : "items-center px-1.5 py-1 text-[11px]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icone
          size={bloco ? 12 : 11}
          className={`shrink-0 ${post ? "" : COR_TAREFA[item.tarefa.status]}`}
        />
        {hora && <span className="shrink-0 font-semibold tabular-nums">{hora}</span>}
        {!bloco && <span className={`truncate ${concluida ? "text-muted line-through" : ""}`}>{item.titulo}</span>}
      </span>
      {bloco && (
        <span className={`line-clamp-2 font-medium ${concluida ? "text-muted line-through" : ""}`}>{item.titulo}</span>
      )}
    </button>
  );
}

/** Dia (ou mês/semana no celular): dias em lista, com cartões maiores. */
function Lista({
  dias,
  hoje,
  eventosDoDia,
  doDia,
  onAbrir,
  onAbrirEvento,
  onNova,
  soltavel,
  alvo,
  unDia,
}: {
  dias: string[];
  hoje: string;
  eventosDoDia: (d: string) => Evento[];
  doDia: (d: string) => Item[];
  onAbrir: (i: Item) => void;
  onAbrirEvento: (e: Evento) => void;
  onNova: (d: string) => void;
  soltavel: (d: string) => Record<string, unknown>;
  alvo: string | null;
  unDia: boolean;
}) {
  // No mês/semana (celular) só dias com algo; no Dia, sempre o dia.
  const comAlgo = unDia ? dias : dias.filter((d) => eventosDoDia(d).length || doDia(d).length);
  if (!comAlgo.length) {
    return (
      <Card>
        <Vazio>Nada neste período. Use “Nova tarefa” ou programe um post.</Vazio>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {comAlgo.map((dia) => {
        const evs = eventosDoDia(dia);
        const its = doDia(dia);
        return (
          <section
            key={dia}
            {...soltavel(dia)}
            className={`rounded-2xl border bg-surface p-4 shadow-sm shadow-black/5 transition-colors ${
              alvo === dia ? "border-gold/60 bg-gold/5" : "border-line/70"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-sm font-semibold ${dia === hoje ? "text-gold" : "text-ink"}`}>
                {dia === hoje ? "Hoje · " : ""}
                {diaExtenso(dia)}
              </h3>
              <button
                onClick={() => onNova(dia)}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <Plus size={13} /> Tarefa
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {evs.map((e) => (
                <FaixaEvento key={e.id} e={e} dia={dia} onAbrir={() => onAbrirEvento(e)} />
              ))}
              {its.map((it) => (
                <ChipItem key={`${it.tipo}-${it.id}`} item={it} onAbrir={() => onAbrir(it)} bloco />
              ))}
              {!evs.length && !its.length && <p className="text-xs text-muted">Nada programado para este dia.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── Tarefa: criar / editar ─────────────────────────────────────── */

const campo =
  "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-gold/50 dark:[color-scheme:dark]";

function FormTarefa({ edicao, projectId, onFechar }: { edicao: EdicaoTarefa; projectId: string; onFechar: () => void }) {
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
      : { titulo: "", descricao: null, data: edicao.modo === "novo" ? edicao.data : "", hora: null, status: "a_fazer", responsavel: null },
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

  const valido = f.titulo.trim() && f.data;

  return (
    <Modal aberto onFechar={onFechar} titulo={editando ? "Tarefa" : "Nova tarefa"} maxW="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) salvar.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Título</span>
          <input
            autoFocus
            value={f.titulo}
            onChange={(e) => set("titulo", e.target.value)}
            placeholder="Ex.: Reunião de alinhamento com o cliente"
            className={campo}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Data</span>
            <input type="date" required value={f.data} onChange={(e) => set("data", e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Horário (opcional)</span>
            <input
              type="time"
              value={hhmm(f.hora) ?? ""}
              onChange={(e) => set("hora", e.target.value || null)}
              className={campo}
            />
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_TAREFA_LABEL) as StatusTarefa[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                aria-pressed={f.status === s}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                  f.status === s
                    ? "border-gold bg-gold/10 font-medium text-gold"
                    : "border-line/70 text-muted hover:border-gold/40 hover:text-ink"
                }`}
              >
                {s === "concluido" ? <CheckSquare size={12} className={COR_TAREFA[s]} /> : <Square size={12} className={COR_TAREFA[s]} />}
                {STATUS_TAREFA_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Responsável</span>
          <input
            value={f.responsavel ?? ""}
            onChange={(e) => set("responsavel", e.target.value)}
            placeholder="Ex.: Carol"
            className={campo}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Descrição</span>
          <textarea
            rows={4}
            value={f.descricao ?? ""}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Detalhes, pauta, links…"
            className={`${campo} resize-y`}
          />
        </label>

        {editando?.criado_por_nome && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <UserRound size={13} /> Criada por <span className="text-ink">{editando.criado_por_nome}</span> em{" "}
            {new Date(editando.criado_em).toLocaleDateString("pt-BR")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line/50 pt-4">
          {editando &&
            (confirmando ? (
              <>
                <span className="text-sm text-muted">Excluir de vez?</span>
                <button
                  type="button"
                  onClick={() => excluir.mutate()}
                  disabled={excluir.isPending}
                  className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {excluir.isPending ? "Excluindo…" : "Sim, excluir"}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} className="px-2 text-sm text-muted hover:text-ink">
                  Não
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-rose-500 transition hover:bg-rose-500/10"
              >
                <Trash2 size={14} /> Excluir
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-full border border-line/70 px-4 py-2 text-sm text-ink transition hover:border-gold/50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valido || salvar.isPending}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
            >
              {salvar.isPending ? "Salvando…" : editando ? "Salvar" : "Criar tarefa"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
