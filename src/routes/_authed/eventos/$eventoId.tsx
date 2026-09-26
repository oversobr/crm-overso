import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  ImageIcon,
  Link2,
  Loader2,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useRef, useState } from "react";

import { PilulasConteudo, StatusConteudoBadge } from "@/components/conteudo";
import { contagem, FormEvento, periodoEvento, StatusEventoBadge } from "@/components/eventos";
import { Modal } from "@/components/modal";
import { ModuloDesativado } from "@/components/modulo";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { deYmd, fmt, hhmm, somarDias, ymd } from "@/lib/datas";
import {
  adicionarLinkMaterial,
  atualizarDemanda,
  criarDemanda,
  demandasQuery,
  enviarMaterial,
  eventoQuery,
  excluirDemanda,
  excluirMaterial,
  faltaTabelaEventos,
  materiaisQuery,
  MAX_MATERIAL_MB,
  postsDoEventoQuery,
  urlDoMaterial,
} from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { CategoriaMaterial, Demanda, DemandaEntrada, Evento, Material, StatusDemanda } from "@/lib/types";
import { CATEGORIA_MATERIAL_LABEL, modulosDe, STATUS_DEMANDA_LABEL } from "@/lib/types";

export const Route = createFileRoute("/_authed/eventos/$eventoId")({ component: PaginaEvento });

type Aba = "geral" | "demandas" | "materiais" | "divulgacao";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "geral", rotulo: "Visão geral" },
  { id: "demandas", rotulo: "Demandas" },
  { id: "materiais", rotulo: "Materiais" },
  { id: "divulgacao", rotulo: "Divulgação" },
];

function PaginaEvento() {
  const { projeto } = usePainel();
  if (!modulosDe(projeto).eventos) {
    return (
      <>
        <Cabecalho titulo="Eventos" comCampanha={false} />
        <ModuloDesativado modulo="eventos" />
      </>
    );
  }
  return <EventoTela />;
}

function Voltar() {
  return (
    <Link
      to="/eventos"
      className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
    >
      <ArrowLeft size={14} /> Eventos
    </Link>
  );
}

function EventoTela() {
  const { eventoId } = Route.useParams();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("geral");
  const [editando, setEditando] = useState(false);
  const { data: evento, isLoading, error } = useQuery(eventoQuery(eventoId));

  if (error || isLoading || !evento) {
    return (
      <>
        <Voltar />
        <Card>
          {isLoading ? (
            <Vazio>Carregando…</Vazio>
          ) : (
            <p className="py-6 text-center text-sm text-muted">
              {error
                ? faltaTabelaEventos(error)
                  ? "Os eventos ainda não foram ativados no banco (supabase/24_eventos.sql)."
                  : `Não consegui carregar o evento: ${(error as Error).message}`
                : "Evento não encontrado — ele pode ter sido excluído ou ser de outro cliente."}
            </p>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <Voltar />
      <Cabecalho titulo={evento.nome} comCampanha={false}>
        <button
          onClick={() => setEditando(true)}
          className="flex items-center gap-2 rounded-full border border-line/70 bg-surface px-4 py-2 text-sm text-ink transition hover:border-gold/50"
        >
          <Pencil size={14} /> Editar evento
        </button>
      </Cabecalho>

      {/* Faixa de identificação: quando, onde, em que pé, quanto falta. */}
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <CalendarClock size={15} /> {periodoEvento(evento)}
        </span>
        {evento.local && (
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin size={15} className="shrink-0" /> <span className="truncate">{evento.local}</span>
          </span>
        )}
        <StatusEventoBadge status={evento.status} />
        <span className="inline-flex h-6 items-center rounded-full bg-gold/10 px-2.5 text-xs font-medium leading-none text-accent">
          {contagem(evento)}
        </span>
        {evento.criado_por_nome && (
          <span className="flex items-center gap-1.5 text-xs">
            <UserRound size={13} /> criado por {evento.criado_por_nome}
          </span>
        )}
      </div>

      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line/60">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm transition ${
              aba === a.id ? "border-gold font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "geral" && <VisaoGeral evento={evento} onEditar={() => setEditando(true)} irPara={setAba} />}
      {aba === "demandas" && <Kanban evento={evento} />}
      {aba === "materiais" && <Materiais evento={evento} />}
      {aba === "divulgacao" && <Divulgacao evento={evento} />}

      {editando && (
        <FormEvento
          projectId={evento.project_id}
          evento={evento}
          onFechar={() => setEditando(false)}
          onExcluido={() => void router.navigate({ to: "/eventos" })}
        />
      )}
    </>
  );
}

/* ── Visão geral ────────────────────────────────────────────────── */

const COR_COLUNA: Record<StatusDemanda, { ponto: string; barra: string }> = {
  a_fazer: { ponto: "bg-slate-400", barra: "bg-slate-400" },
  fazendo: { ponto: "bg-sky-500", barra: "bg-sky-500" },
  revisao: { ponto: "bg-violet-500", barra: "bg-violet-500" },
  concluido: { ponto: "bg-emerald-500", barra: "bg-emerald-500" },
};

function VisaoGeral({ evento, onEditar, irPara }: { evento: Evento; onEditar: () => void; irPara: (a: Aba) => void }) {
  const { data: demandas = [] } = useQuery(demandasQuery(evento.id));
  const { data: materiais = [] } = useQuery(materiaisQuery(evento.id));
  const { data: posts = [] } = useQuery(postsDoEventoQuery(evento.id));
  const hoje = ymd(new Date());
  const abertas = demandas
    .filter((d) => d.status !== "concluido")
    .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"))
    .slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        className="lg:col-span-2"
        titulo="Briefing"
        acao={
          <button onClick={onEditar} className="text-xs text-muted transition hover:text-ink">
            Editar
          </button>
        }
      >
        {evento.descricao ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{evento.descricao}</p>
        ) : (
          <Vazio>Sem briefing ainda. Registre objetivo, público, programação e contatos em “Editar”.</Vazio>
        )}
      </Card>

      <Card titulo="Andamento">
        <div className="space-y-3">
          {(Object.keys(STATUS_DEMANDA_LABEL) as StatusDemanda[]).map((s) => {
            const n = demandas.filter((d) => d.status === s).length;
            return (
              <div key={s}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <span className={`h-2 w-2 rounded-full ${COR_COLUNA[s].ponto}`} />
                    {STATUS_DEMANDA_LABEL[s]}
                  </span>
                  <span className="font-semibold text-ink">{n}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${COR_COLUNA[s].barra}`}
                    style={{ width: `${demandas.length ? (100 * n) / demandas.length : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line/70 pt-4 text-center">
          <button onClick={() => irPara("materiais")} className="rounded-xl bg-surface-2/60 py-2 transition hover:bg-surface-2">
            <p className="text-lg font-semibold text-ink">{materiais.length}</p>
            <p className="text-[11px] text-muted">materiais</p>
          </button>
          <button onClick={() => irPara("divulgacao")} className="rounded-xl bg-surface-2/60 py-2 transition hover:bg-surface-2">
            <p className="text-lg font-semibold text-ink">{posts.length}</p>
            <p className="text-[11px] text-muted">posts de divulgação</p>
          </button>
        </div>
      </Card>

      <Card
        className="lg:col-span-3"
        titulo="Próximos prazos"
        acao={
          <button onClick={() => irPara("demandas")} className="text-xs text-muted transition hover:text-ink">
            Ver quadro
          </button>
        }
      >
        {abertas.length === 0 ? (
          <Vazio>{demandas.length ? "Tudo concluído por aqui." : "Nenhuma demanda ainda. Crie no quadro de Demandas."}</Vazio>
        ) : (
          <div className="divide-y divide-line/50">
            {abertas.map((d) => (
              <button
                key={d.id}
                onClick={() => irPara("demandas")}
                className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-surface-2/40"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${COR_COLUNA[d.status].ponto}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.titulo}</span>
                {d.responsavel && <span className="hidden shrink-0 text-xs text-muted sm:inline">{d.responsavel}</span>}
                <SeloPrazo prazo={d.prazo} hoje={hoje} concluida={false} />
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Prazo com urgência: vermelho vencido, âmbar em até 2 dias. */
function SeloPrazo({ prazo, hoje, concluida }: { prazo: string | null; hoje: string; concluida: boolean }) {
  if (!prazo) return <span className="shrink-0 text-xs text-muted/70">sem prazo</span>;
  const vencido = !concluida && prazo < hoje;
  const perto = !concluida && !vencido && prazo <= somarDias(hoje, 2);
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-none ${
        vencido
          ? "bg-rose-500/12 text-rose-600 dark:text-rose-300"
          : perto
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-surface-2 text-muted"
      }`}
    >
      <CalendarClock size={11} />
      {prazo === hoje ? "hoje" : fmt(prazo, { day: "2-digit", month: "2-digit" })}
    </span>
  );
}

/* ── Demandas: Kanban ───────────────────────────────────────────── */

const COLUNAS = Object.keys(STATUS_DEMANDA_LABEL) as StatusDemanda[];

function Kanban({ evento }: { evento: Evento }) {
  const qc = useQueryClient();
  const chave = demandasQuery(evento.id).queryKey;
  const { data: demandas = [], isLoading, error } = useQuery(demandasQuery(evento.id));
  const [editando, setEditando] = useState<Demanda | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const hoje = ymd(new Date());

  const daColuna = (s: StatusDemanda) => demandas.filter((d) => d.status === s).sort((a, b) => a.ordem - b.ordem);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["demandas", evento.id] });
    void qc.invalidateQueries({ queryKey: ["demandas-resumo"] });
  };

  // Mover muda a tela na hora; se o banco recusar, volta.
  const mover = useMutation({
    mutationFn: ({ id, status, ordem }: { id: string; status: StatusDemanda; ordem: number }) =>
      atualizarDemanda(id, { status, ordem }),
    onMutate: async ({ id, status, ordem }) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData(chave);
      qc.setQueryData(chave, (l = []) => l.map((d) => (d.id === id ? { ...d, status, ordem } : d)));
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
      toast((e as Error).message, "error");
    },
    onSettled: recarregar,
  });

  /**
   * Soltar numa coluna (vai pro fim) ou em cima de um card (entra antes dele).
   * A ordem nova é a média entre os vizinhos — sem renumerar a coluna.
   */
  function soltar(e: DragEvent, status: StatusDemanda, antesDe?: Demanda) {
    e.preventDefault();
    e.stopPropagation();
    setAlvo(null);
    const id = e.dataTransfer.getData("text/demanda");
    const d = demandas.find((x) => x.id === id);
    if (!d || d.id === antesDe?.id) return;
    const coluna = daColuna(status).filter((x) => x.id !== id);
    let ordem: number;
    if (antesDe) {
      const i = coluna.findIndex((x) => x.id === antesDe.id);
      const anterior = coluna[i - 1];
      ordem = anterior ? (anterior.ordem + antesDe.ordem) / 2 : antesDe.ordem - 1;
    } else {
      ordem = (coluna.at(-1)?.ordem ?? 0) + 1;
    }
    if (d.status === status && d.ordem === ordem) return;
    mover.mutate({ id, status, ordem });
  }

  if (error) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">
          {faltaTabelaEventos(error)
            ? "As demandas ainda não foram ativadas no banco (supabase/24_eventos.sql)."
            : `Não consegui carregar as demandas: ${(error as Error).message}`}
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[56rem] grid-cols-4 gap-3">
          {COLUNAS.map((s) => {
            const cards = daColuna(s);
            return (
              <div
                key={s}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (alvo !== s) setAlvo(s);
                }}
                onDragLeave={() => setAlvo((a) => (a === s ? null : a))}
                onDrop={(e) => soltar(e, s)}
                className={`flex min-h-[24rem] flex-col rounded-2xl border p-2 transition-colors ${
                  alvo === s ? "border-gold/60 bg-gold/5" : "border-line/60 bg-surface-2/40"
                }`}
              >
                <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                  <span className={`h-2 w-2 rounded-full ${COR_COLUNA[s].ponto}`} />
                  <span className="text-sm font-semibold text-ink">{STATUS_DEMANDA_LABEL[s]}</span>
                  <span className="ml-auto rounded-full bg-surface px-2 text-xs text-muted">{cards.length}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {isLoading && s === "a_fazer" && <Vazio>Carregando…</Vazio>}
                  {cards.map((d) => (
                    <button
                      key={d.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/demanda", d.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => soltar(e, s, d)}
                      onClick={() => setEditando(d)}
                      className="flex cursor-grab flex-col gap-2 rounded-xl border border-line/60 bg-surface p-3 text-left shadow-sm shadow-black/5 transition hover:border-gold/40 active:cursor-grabbing"
                    >
                      <span className={`text-sm font-medium text-ink ${s === "concluido" ? "line-through opacity-60" : ""}`}>
                        {d.titulo}
                      </span>
                      {d.descricao && <span className="line-clamp-2 text-xs text-muted">{d.descricao}</span>}
                      <span className="flex flex-wrap items-center gap-1.5">
                        {d.responsavel && (
                          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-gold/10 px-2 text-[11px] font-medium leading-none text-accent">
                            <UserRound size={11} /> {d.responsavel}
                          </span>
                        )}
                        {(d.prazo || s !== "concluido") && (
                          <SeloPrazo prazo={d.prazo} hoje={hoje} concluida={s === "concluido"} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                <NovaDemanda
                  evento={evento}
                  status={s}
                  proximaOrdem={(cards.at(-1)?.ordem ?? 0) + 1}
                  onCriada={recarregar}
                />
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Dica: arraste os cards entre as colunas (ou para cima e para baixo) para organizar.</p>

      {editando && (
        <FormDemanda demanda={editando} onFechar={() => setEditando(null)} onSalvo={recarregar} />
      )}
    </>
  );
}

/** "+ Adicionar demanda" no pé da coluna: digita o título e Enter. */
function NovaDemanda({
  evento,
  status,
  proximaOrdem,
  onCriada,
}: {
  evento: Evento;
  status: StatusDemanda;
  proximaOrdem: number;
  onCriada: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");

  const criar = useMutation({
    mutationFn: () =>
      criarDemanda(evento.id, { titulo: titulo.trim(), descricao: null, status, responsavel: null, prazo: null, ordem: proximaOrdem }),
    onSuccess: () => {
      setTitulo("");
      onCriada();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-surface hover:text-ink"
      >
        <Plus size={14} /> Adicionar demanda
      </button>
    );
  }

  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (titulo.trim()) criar.mutate();
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (titulo.trim()) criar.mutate();
          }
          if (e.key === "Escape") setAberto(false);
        }}
        placeholder="Título da demanda…"
        className="w-full resize-none rounded-xl border border-gold/50 bg-surface px-3 py-2 text-sm text-ink outline-none"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="submit"
          disabled={!titulo.trim() || criar.isPending}
          className="rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gold-dim disabled:opacity-50"
        >
          {criar.isPending ? "Criando…" : "Adicionar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setTitulo("");
          }}
          className="px-2 text-xs text-muted hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

const campo =
  "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent/70 dark:[color-scheme:dark]";

function FormDemanda({ demanda, onFechar, onSalvo }: { demanda: Demanda; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState<DemandaEntrada>({
    titulo: demanda.titulo,
    descricao: demanda.descricao,
    status: demanda.status,
    responsavel: demanda.responsavel,
    prazo: demanda.prazo,
  });
  const [confirmando, setConfirmando] = useState(false);
  const set = <K extends keyof DemandaEntrada>(k: K, v: DemandaEntrada[K]) => setF((a) => ({ ...a, [k]: v }));

  const salvar = useMutation({
    mutationFn: () => {
      const limpo = (s: string | null) => (s && s.trim() ? s.trim() : null);
      return atualizarDemanda(demanda.id, {
        ...f,
        titulo: f.titulo.trim(),
        descricao: limpo(f.descricao),
        responsavel: limpo(f.responsavel),
        prazo: f.prazo || null,
      });
    },
    onSuccess: () => {
      toast("Demanda atualizada.");
      onSalvo();
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const excluir = useMutation({
    mutationFn: () => excluirDemanda(demanda.id),
    onSuccess: () => {
      toast("Demanda excluída.");
      onSalvo();
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <Modal aberto onFechar={onFechar} titulo="Demanda" maxW="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (f.titulo.trim()) salvar.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Título</span>
          <input autoFocus value={f.titulo} onChange={(e) => set("titulo", e.target.value)} className={campo} />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {COLUNAS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                aria-pressed={f.status === s}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                  f.status === s
                    ? "border-gold bg-gold/10 font-medium text-accent"
                    : "border-line/70 text-muted hover:border-gold/40 hover:text-ink"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${COR_COLUNA[s].ponto}`} />
                {STATUS_DEMANDA_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <span className="mb-1.5 block text-xs font-medium text-muted">Prazo</span>
            <input type="date" value={f.prazo ?? ""} onChange={(e) => set("prazo", e.target.value || null)} className={campo} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Descrição</span>
          <textarea
            rows={5}
            value={f.descricao ?? ""}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="O que precisa ser feito, detalhes, links…"
            className={`${campo} resize-y`}
          />
        </label>

        {demanda.criado_por_nome && (
          <p className="text-xs text-muted">
            Criada por <span className="text-ink">{demanda.criado_por_nome}</span> em{" "}
            {new Date(demanda.criado_em).toLocaleDateString("pt-BR")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-4">
          {confirmando ? (
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
              className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-rose-600 dark:text-rose-400 transition hover:bg-rose-500/10"
            >
              <Trash2 size={14} /> Excluir
            </button>
          )}
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
              disabled={!f.titulo.trim() || salvar.isPending}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
            >
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ── Materiais ──────────────────────────────────────────────────── */

const CATEGORIAS = Object.keys(CATEGORIA_MATERIAL_LABEL) as CategoriaMaterial[];

const tamanho = (b: number | null) =>
  b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

function IconeMaterial({ m }: { m: Material }) {
  const Icone = m.tipo === "link" ? Link2 : m.mime?.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-accent">
      <Icone size={17} />
    </div>
  );
}

function Materiais({ evento }: { evento: Evento }) {
  const qc = useQueryClient();
  const { data: materiais = [], isLoading, error } = useQuery(materiaisQuery(evento.id));
  const [filtro, setFiltro] = useState<CategoriaMaterial | "todas">("todas");
  const [categoria, setCategoria] = useState<CategoriaMaterial>("artes");
  const [enviando, setEnviando] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [linkNome, setLinkNome] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const recarregar = () => void qc.invalidateQueries({ queryKey: ["materiais", evento.id] });

  async function enviar(arquivos: FileList | File[]) {
    const lista = [...arquivos];
    if (!lista.length) return;
    setEnviando((n) => n + lista.length);
    for (const a of lista) {
      try {
        await enviarMaterial(evento.project_id, evento.id, a, categoria);
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    recarregar();
    toast(`${lista.length === 1 ? "Arquivo enviado" : "Arquivos enviados"} em ${CATEGORIA_MATERIAL_LABEL[categoria]}.`);
  }

  const linkValido = /^https?:\/\/\S+$/i.test(linkUrl.trim());
  const addLink = useMutation({
    mutationFn: () => adicionarLinkMaterial(evento.id, categoria, linkNome.trim() || linkUrl.trim(), linkUrl.trim()),
    onSuccess: () => {
      setLinkNome("");
      setLinkUrl("");
      recarregar();
      toast("Link adicionado.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const remover = useMutation({
    mutationFn: (m: Material) => excluirMaterial(m),
    onSuccess: () => {
      setExcluindo(null);
      recarregar();
      toast("Material removido.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  // Popup aberto ANTES do await: aberto depois, o navegador bloqueia.
  async function abrir(m: Material, baixar = false) {
    const janela = baixar ? null : window.open("", "_blank");
    try {
      const url = await urlDoMaterial(m, baixar);
      if (janela) janela.location.href = url;
      else window.location.href = url;
    } catch (e) {
      janela?.close();
      toast((e as Error).message, "error");
    }
  }

  if (error) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-muted">
          {faltaTabelaEventos(error)
            ? "Os materiais ainda não foram ativados no banco (supabase/24_eventos.sql)."
            : `Não consegui carregar os materiais: ${(error as Error).message}`}
        </p>
      </Card>
    );
  }

  const visiveis = filtro === "todas" ? materiais : materiais.filter((m) => m.categoria === filtro);
  const grupos = CATEGORIAS.map((c) => ({ c, itens: visiveis.filter((m) => m.categoria === c) })).filter((g) => g.itens.length);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Adicionar: escolhe a pasta e sobe arquivo ou cola link. */}
      <Card titulo="Adicionar material" className="lg:order-2">
        <span className="mb-1.5 block text-xs font-medium text-muted">Categoria</span>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              aria-pressed={categoria === c}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                categoria === c
                  ? "border-gold bg-gold/10 font-medium text-accent"
                  : "border-line/70 text-muted hover:border-gold/40 hover:text-ink"
              }`}
            >
              {CATEGORIA_MATERIAL_LABEL[c]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            void enviar(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center text-sm transition ${
            arrastando ? "border-gold bg-gold/10 text-accent" : "border-line text-muted hover:border-gold/50 hover:text-ink"
          }`}
        >
          {enviando > 0 ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
          <span className="font-medium text-ink">
            {enviando > 0 ? `Enviando ${enviando}…` : "Clique ou arraste arquivos"}
          </span>
          <span className="text-xs">PDF, imagens, planilhas, documentos · até {MAX_MATERIAL_MB} MB cada</span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void enviar(e.target.files);
            e.target.value = "";
          }}
        />

        <form
          className="mt-4 space-y-2 border-t border-line/70 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (linkValido) addLink.mutate();
          }}
        >
          <span className="block text-xs font-medium text-muted">Ou um link (Drive, Canva, Figma…)</span>
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className={campo}
          />
          <div className="flex gap-2">
            <input
              value={linkNome}
              onChange={(e) => setLinkNome(e.target.value)}
              placeholder="Nome (opcional)"
              className={campo}
            />
            <button
              type="submit"
              disabled={!linkValido || addLink.isPending}
              className="shrink-0 rounded-xl bg-gold px-4 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-40"
            >
              Adicionar
            </button>
          </div>
        </form>
      </Card>

      <Card className="lg:order-1 lg:col-span-2">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(["todas", ...CATEGORIAS] as const).map((c) => {
            const n = c === "todas" ? materiais.length : materiais.filter((m) => m.categoria === c).length;
            if (c !== "todas" && n === 0) return null;
            return (
              <button
                key={c}
                onClick={() => setFiltro(c)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs transition ${
                  filtro === c ? "bg-gold font-medium text-white" : "bg-surface-2 text-muted hover:text-ink"
                }`}
              >
                {c === "todas" ? "Todos" : CATEGORIA_MATERIAL_LABEL[c]}
                <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <Vazio>Carregando…</Vazio>
        ) : materiais.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
            <FolderOpen size={22} className="opacity-60" />
            Nenhum material ainda. Suba artes, contratos, roteiros e o que mais o evento precisar.
          </div>
        ) : (
          <div className="space-y-5">
            {grupos.map(({ c, itens }) => (
              <section key={c}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {CATEGORIA_MATERIAL_LABEL[c]}
                </h3>
                <div className="divide-y divide-line/50 rounded-xl border border-line/60">
                  {itens.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 p-3">
                      <IconeMaterial m={m} />
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => void abrir(m)}
                          className="block max-w-full truncate text-left text-sm font-medium text-ink hover:underline"
                        >
                          {m.nome}
                        </button>
                        <p className="truncate text-xs text-muted">
                          {[m.tipo === "link" ? "link" : tamanho(m.tamanho), m.criado_por_nome && `por ${m.criado_por_nome}`, new Date(m.criado_em).toLocaleDateString("pt-BR")]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {excluindo === m.id ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => remover.mutate(m)}
                            disabled={remover.isPending}
                            className="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                          >
                            Remover
                          </button>
                          <button onClick={() => setExcluindo(null)} className="px-1 text-xs text-muted hover:text-ink">
                            Não
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <BotaoAcao titulo="Abrir" onClick={() => void abrir(m)}>
                            <ExternalLink size={15} />
                          </BotaoAcao>
                          {m.tipo === "arquivo" && (
                            <BotaoAcao titulo="Baixar" onClick={() => void abrir(m, true)}>
                              <Download size={15} />
                            </BotaoAcao>
                          )}
                          <BotaoAcao titulo="Remover" perigo onClick={() => setExcluindo(m.id)}>
                            <Trash2 size={15} />
                          </BotaoAcao>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BotaoAcao({
  titulo,
  onClick,
  perigo = false,
  children,
}: {
  titulo: string;
  onClick: () => void;
  perigo?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className={`rounded-lg p-2 text-muted transition ${
        perigo ? "hover:bg-rose-500/10 hover:text-rose-500" : "hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Divulgação: posts do Calendário ligados ao evento ──────────── */

function Divulgacao({ evento }: { evento: Evento }) {
  const { data: posts = [], isLoading } = useQuery(postsDoEventoQuery(evento.id));
  const hoje = ymd(new Date());

  return (
    <Card
      titulo="Posts de divulgação"
      acao={
        <Link
          to="/postagens"
          className="flex items-center gap-1.5 rounded-full border border-line/70 px-3 py-1.5 text-xs text-ink transition hover:border-gold/50"
        >
          Abrir programação
        </Link>
      }
    >
      {isLoading ? (
        <Vazio>Carregando…</Vazio>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
          <Megaphone size={22} className="opacity-60" />
          <p>Nenhum post ligado a este evento ainda.</p>
          <p className="max-w-md text-xs">
            Na Programação de Postagem, abra (ou crie) um post e escolha <span className="text-ink">{evento.nome}</span> no
            campo “Evento”. Ele aparece aqui.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line/50">
          {posts.map((c) => (
            <Link key={c.id} to="/postagens" search={{ abrir: c.id }} className="flex items-center gap-3 py-3 transition hover:bg-surface-2/40">
              <div
                className={`flex w-12 shrink-0 flex-col items-center rounded-lg border py-1 ${
                  c.data < hoje ? "border-line/40 opacity-60" : "border-line/60"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase text-muted">
                  {fmt(c.data, { month: "short" }).replace(".", "")}
                </span>
                <span className="text-base font-bold leading-tight text-ink">{deYmd(c.data).getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{c.titulo}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">{hhmm(c.hora) ?? "sem horário"}</span>
                  <StatusConteudoBadge status={c.status} />
                  <PilulasConteudo c={c} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
