import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  ImageIcon,
  ImagePlus,
  Loader2,
  PartyPopper,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  COR_FORMATO,
  COR_STATUS,
  COR_STATUS_CAL,
  ICONE_REDE,
  PilulasConteudo,
  SeloRede,
  StatusConteudoBadge,
} from "@/components/conteudo";
import { Comentarios } from "@/components/comentarios";
import { Dropdown } from "@/components/dropdown";
import { Modal } from "@/components/modal";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import {
  atualizarConteudo,
  conteudosQuery,
  comentar,
  buscarConteudo,
  criarConteudo,
  duplicarConteudo,
  eventosQuery,
  excluirConteudo,
  enviarMidia,
  faltaTabelaConteudos,
  MAX_MIDIA_MB,
  removerMidias,
  TIPOS_MIDIA,
  urlsMidiaQuery,
} from "@/lib/queries";
import {
  capitalizar,
  deYmd,
  diaExtenso,
  gradeDoMes,
  hhmm,
  horaDe,
  SEMANA,
  semanaDe,
  somarDias,
  tituloPeriodo,
  ymd,
} from "@/lib/datas";
import { toast } from "@/lib/toast";
import type { Conteudo, ConteudoEntrada, Evento, Formato, Rede, StatusConteudo } from "@/lib/types";
import { FORMATO_LABEL, REDE_LABEL, STATUS_CONTEUDO_LABEL } from "@/lib/types";
import { ModuloDesativado } from "@/components/modulo";
import { modulosDe } from "@/lib/types";

/**
 * Programação de Postagem: posts, stories, reels e vídeos de cada cliente.
 * (Era o "Calendário"; o Calendário agora é a visão geral de tudo que está
 * sendo feito — eventos, posts e tarefas.)
 *
 * `?abrir=<id>` abre direto o formulário daquele post: é assim que o
 * Calendário geral manda o clique num post pra cá.
 */
export const Route = createFileRoute("/_authed/postagens")({
  component: Calendario,
  validateSearch: (s: Record<string, unknown>): { abrir?: string } =>
    typeof s.abrir === "string" ? { abrir: s.abrir } : {},
});

const UNIDADE = { mes: "mês", semana: "semana", dia: "dia" } as const;
const NOME_VISAO = { mes: "Mês", semana: "Semana", dia: "Dia" } as const;



/** Só http(s) vira link clicável — um "javascript:" colado no campo não roda. */
const linkSeguro = (s: string | null) => (s && /^https?:\/\//i.test(s.trim()) ? s.trim() : null);

type Visao = "mes" | "semana" | "dia";

type Edicao = { modo: "novo"; data: string; hora?: string | null | undefined } | { modo: "editar"; conteudo: Conteudo };

/** Onde um conteúdo foi solto: só o dia (mês) ou dia + faixa de horário (semana/dia). */
type Faixa = number | "sem" | undefined;

/**
 * Portão do módulo: se o cliente não usa Conteúdo, a tela mostra o aviso
 * (e o botão de ativar) em vez de consultar dados que ele não tem.
 */
function Calendario() {
  const { projeto } = usePainel();
  if (!modulosDe(projeto).conteudo) {
    return (
      <>
        <Cabecalho titulo="Programação de Postagem" comCampanha={false} />
        <ModuloDesativado modulo="conteudo" />
      </>
    );
  }
  return <CalendarioTela />;
}

function CalendarioTela() {
  const { projeto } = usePainel();
  const qc = useQueryClient();

  const hoje = ymd(new Date());
  // Um dia de referência serve às três visões: o mês dele, a semana dele ou
  // ele mesmo. Trocar de visão mantém o lugar em vez de voltar pra hoje.
  const [ref, setRef] = useState(hoje);
  // Abre na semana: é a visão do dia a dia (o que sai e em que horário).
  const [visao, setVisao] = useState<Visao>("semana");
  const [formato, setFormato] = useState("");
  const [status, setStatus] = useState("");
  // "" = todos; "sem" = posts sem evento; senão o id do evento.
  const [filtroEvento, setFiltroEvento] = useState("");
  const [edicao, setEdicao] = useState<Edicao | null>(null);

  // Veio do Calendário geral com ?abrir=<id>: vai pro dia do post e abre o
  // formulário dele. Depois limpa o endereço, pra F5 não reabrir.
  const { abrir: abrirId } = Route.useSearch();
  const navegar = Route.useNavigate();
  useEffect(() => {
    if (!abrirId) return;
    let vivo = true;
    void buscarConteudo(abrirId).then((c) => {
      if (!vivo) return;
      if (c) {
        setRef(c.data);
        setEdicao({ modo: "editar", conteudo: c });
      } else {
        toast("Esse post não foi encontrado — pode ter sido excluído.", "error");
      }
      void navegar({ search: {}, replace: true });
    });
    return () => {
      vivo = false;
    };
  }, [abrirId, navegar]);
  // Menu do botão direito: qual conteúdo e onde o clique aconteceu.
  const [menu, setMenu] = useState<Menu | null>(null);
  // Célula sob o cursor durante um arraste, pra destacar onde vai cair.
  const [alvo, setAlvo] = useState<string | null>(null);

  const periodo = useMemo(
    () => (visao === "mes" ? gradeDoMes(deYmd(ref)) : visao === "semana" ? semanaDe(ref) : [ref]),
    [visao, ref],
  );
  // O período sempre tem ao menos um dia, então as pontas existem.
  const de = periodo[0]!;
  const ate = periodo[periodo.length - 1]!;
  const consulta = conteudosQuery(projeto?.id, de, ate);
  const { data = [], isLoading, error } = useQuery(consulta);
  // Eventos do cliente, pro filtro e pro campo "Evento" do formulário. Só
  // com o módulo ligado; se a tabela ainda não existe, fica vazio e some.
  const { data: eventos = [] } = useQuery({
    ...eventosQuery(projeto?.id),
    enabled: Boolean(projeto?.id) && modulosDe(projeto).eventos,
  });

  const visiveis = data.filter(
    (c) =>
      (!formato || c.formato === formato) &&
      (!status || c.status === status) &&
      (!filtroEvento || (filtroEvento === "sem" ? !c.evento_id : c.evento_id === filtroEvento)),
  );
  const porDia = new Map<string, Conteudo[]>();
  for (const c of visiveis) porDia.set(c.data, [...(porDia.get(c.data) ?? []), c]);

  // No mês a grade mostra pontas dos meses vizinhos; o resumo e a lista
  // contam só o mês em si. Semana e dia já consultam o período exato.
  const prefixoMes = ref.slice(0, 7);
  const doPeriodo = visao === "mes" ? visiveis.filter((c) => c.data.startsWith(prefixoMes)) : visiveis;
  const hojeNoPeriodo = visao === "mes" ? hoje.startsWith(prefixoMes) : periodo.includes(hoje);
  const diaPadrao = hojeNoPeriodo ? hoje : visao === "mes" ? `${prefixoMes}-01` : de;

  function andar(delta: number) {
    setRef((r) => {
      if (visao === "semana") return somarDias(r, 7 * delta);
      if (visao === "dia") return somarDias(r, delta);
      const d = deYmd(r);
      return ymd(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    });
  }

  function abrirDia(dia: string) {
    setRef(dia);
    setVisao("dia");
  }

  // Arrastar pra outro dia/horário: a tela muda na hora e o banco confirma
  // depois; se ele recusar, a peça volta pro lugar e o aviso diz por quê.
  // `hora` undefined = manter a hora (no mês só o dia muda).
  const mover = useMutation({
    mutationFn: ({ id, data, hora }: { id: string; data: string; hora?: string | null | undefined }) =>
      atualizarConteudo(id, hora === undefined ? { data } : { data, hora }),
    onMutate: async ({ id, data: novoDia, hora }) => {
      await qc.cancelQueries({ queryKey: consulta.queryKey });
      const antes = qc.getQueryData(consulta.queryKey);
      qc.setQueryData(consulta.queryKey, (lista = []) =>
        lista.map((c) => (c.id === id ? { ...c, data: novoDia, ...(hora === undefined ? {} : { hora }) } : c)),
      );
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(consulta.queryKey, ctx.antes);
      toast((e as Error).message, "error");
    },
    onSuccess: (_r, { data: novoDia, hora }) =>
      toast(
        `Remarcado para ${deYmd(novoDia).toLocaleDateString("pt-BR")}${
          hora ? ` às ${hhmm(hora)}` : hora === null ? ", sem horário" : ""
        }.`,
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ["conteudos"] }),
  });

  function soltar(e: DragEvent, dia: string, faixa?: Faixa) {
    e.preventDefault();
    setAlvo(null);
    const id = e.dataTransfer.getData("text/plain");
    const c = data.find((x) => x.id === id);
    if (!c) return;

    let hora: string | null | undefined;
    if (faixa === "sem") hora = null;
    else if (typeof faixa === "number") {
      // Mesma faixa de hora: preserva os minutos (18:30 continua 18:30).
      hora = c.hora && horaDe(c.hora) === faixa ? c.hora : `${String(faixa).padStart(2, "0")}:00:00`;
    }
    if (c.data === dia && (hora === undefined || hora === c.hora)) return;
    mover.mutate({ id, data: dia, hora });
  }

  const arraste: Arraste = {
    alvo,
    sobre: (chave) => (e) => {
      e.preventDefault();
      if (alvo !== chave) setAlvo(chave);
    },
    saiu: (chave) => () => setAlvo((a) => (a === chave ? null : a)),
    soltar,
  };

  if (!projeto) {
    return (
      <>
        <Cabecalho titulo="Programação de Postagem" comCampanha={false} />
        <Card>
          <Vazio>Escolha um cliente no menu para ver o calendário dele.</Vazio>
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Cabecalho titulo="Programação de Postagem" comCampanha={false} />
        <Card>
          <div className="py-8 text-center">
            {faltaTabelaConteudos(error) ? (
              <>
                <p className="text-sm font-medium text-ink">O calendário ainda não foi ativado no banco.</p>
                <p className="mx-auto mt-2 max-w-md text-xs text-muted">
                  Rode o arquivo <code className="text-ink">supabase/18_calendario.sql</code> no SQL Editor do
                  Supabase e recarregue esta página.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-rose-400">Não consegui carregar o calendário.</p>
                <p className="mt-1 text-xs text-muted">{(error as Error).message}</p>
              </>
            )}
          </div>
        </Card>
      </>
    );
  }

  const gatilho =
    "rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink hover:border-gold/40";
  const abrir = (c: Conteudo) => setEdicao({ modo: "editar", conteudo: c });
  const abrirMenu: AbrirMenu = (c, e) => setMenu({ conteudo: c, x: e.clientX, y: e.clientY });
  const novo = (dia: string, hora?: string | null) => setEdicao({ modo: "novo", data: dia, hora });
  const unidade = UNIDADE[visao];

  return (
    <>
      <Cabecalho titulo="Programação de Postagem" comCampanha={false}>
        <button
          onClick={() => novo(diaPadrao)}
          className="flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim"
        >
          <Plus size={15} /> Novo conteúdo
        </button>
      </Cabecalho>

      {/* Navegação do período + filtros + visão. */}
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
          <Dropdown
            value={formato}
            onChange={setFormato}
            options={[
              { value: "", label: "Formato: Todos" },
              ...Object.entries(FORMATO_LABEL).map(([k, v]) => ({ value: k, label: v })),
            ]}
            triggerClassName={gatilho}
          />
          <Dropdown
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "Status: Todos" },
              ...Object.entries(STATUS_CONTEUDO_LABEL).map(([k, v]) => ({ value: k, label: v })),
            ]}
            triggerClassName={gatilho}
          />
          {eventos.length > 0 && (
            <Dropdown
              value={filtroEvento}
              onChange={setFiltroEvento}
              options={[
                { value: "", label: "Evento: Todos" },
                ...eventos.map((e) => ({ value: e.id, label: e.nome })),
                { value: "sem", label: "Sem evento" },
              ]}
              triggerClassName={gatilho}
            />
          )}
          <div className="flex rounded-xl border border-line/70 bg-surface-2 p-1">
            {(["mes", "semana", "dia"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                aria-pressed={visao === v}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  visao === v ? "bg-surface font-medium text-ink shadow-sm shadow-black/5" : "text-muted hover:text-ink"
                }`}
              >
                {NOME_VISAO[v]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Resumo conteudos={doPeriodo} unidade={unidade} />

      {/* ── Mês (grade no md+) ── */}
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
                const foraDoMes = !dia.startsWith(prefixoMes);
                const itens = porDia.get(dia) ?? [];
                return (
                  <div
                    key={dia}
                    onDragOver={arraste.sobre(dia)}
                    onDragLeave={arraste.saiu(dia)}
                    onDrop={(e) => soltar(e, dia)}
                    onDoubleClick={(e) => noVazio(e) && novo(dia)}
                    className={`group relative min-h-32 border-line/50 p-1.5 transition-colors ${
                      i % 7 !== 6 ? "border-r" : ""
                    } ${i < periodo.length - 7 ? "border-b" : ""} ${foraDoMes ? "bg-surface-2/40" : ""} ${
                      alvo === dia ? "bg-gold/10 ring-2 ring-inset ring-gold/50" : ""
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <NumeroDia dia={dia} hoje={hoje} apagado={foraDoMes} onClick={() => abrirDia(dia)} />
                      <BotaoNovo onClick={() => novo(dia)} dia={dia} />
                    </div>
                    <div className="flex flex-col gap-1">
                      {itens.map((c) => (
                        <Chip key={c.id} c={c} onAbrir={() => abrir(c)} onMenu={abrirMenu} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Dica: arraste um conteúdo para outro dia para remarcar. Clique no número do dia para abrir a visão diária, ou dê dois cliques num espaço vazio para criar.
          </p>
        </div>
      )}

      {/* ── Semana (grade por horário no md+) ── */}
      {visao === "semana" && (
        <div className="hidden md:block">
          <GradeHorarios
            dias={periodo}
            porDia={porDia}
            hoje={hoje}
            arraste={arraste}
            onAbrir={abrir}
            onMenu={abrirMenu}
            onNovo={novo}
            onAbrirDia={abrirDia}
          />
        </div>
      )}

      {/* Mês e semana no celular: a grade não cabe, vira lista do período. */}
      {visao !== "dia" && (
        <div className="md:hidden">
          <Lista conteudos={doPeriodo} carregando={isLoading} onAbrir={abrir} onMenu={abrirMenu} unidade={unidade} />
        </div>
      )}

      {/* ── Dia (grade por horário, em qualquer tela) ── */}
      {visao === "dia" && (
        <GradeHorarios
          dias={periodo}
          porDia={porDia}
          hoje={hoje}
          arraste={arraste}
          onAbrir={abrir}
          onMenu={abrirMenu}
          onNovo={novo}
          detalhado
        />
      )}

      {isLoading && <p className="mt-3 hidden text-center text-xs text-muted md:block">Carregando…</p>}

      {menu && (
        <MenuConteudo
          key={`${menu.conteudo.id}-${menu.x}-${menu.y}`}
          menu={menu}
          consultaKey={consulta.queryKey}
          onEditar={abrir}
          onFechar={() => setMenu(null)}
        />
      )}

      {edicao && (
        <Formulario
          key={edicao.modo === "editar" ? edicao.conteudo.id : `novo-${edicao.data}-${edicao.hora ?? ""}`}
          edicao={edicao}
          projectId={projeto.id}
          eventos={eventos}
          onFechar={() => setEdicao(null)}
        />
      )}
    </>
  );
}

/* ── Menu do botão direito ──────────────────────────────────────── */

type Menu = { conteudo: Conteudo; x: number; y: number };
type AbrirMenu = (c: Conteudo, e: ReactMouseEvent) => void;

/**
 * Atalhos sem abrir o formulário: editar, duplicar, trocar o status e
 * excluir. Vai por portal no <body> (a grade corta o que passa da borda) e
 * fecha com clique fora, Esc, rolagem ou redimensionamento — a posição é a do
 * clique, e sairia do lugar.
 */
function MenuConteudo({
  menu,
  consultaKey,
  onEditar,
  onFechar,
}: {
  menu: Menu;
  consultaKey: ReturnType<typeof conteudosQuery>["queryKey"];
  onEditar: (c: Conteudo) => void;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const c = menu.conteudo;
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Excluir pede confirmação no próprio menu, sem abrir outra janela.
  const [confirmando, setConfirmando] = useState(false);

  // Abre no ponto do clique; se não couber, vira pra esquerda/cima.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const m = 8;
    const left = Math.max(m, Math.min(menu.x, window.innerWidth - el.offsetWidth - m));
    const top = Math.max(m, Math.min(menu.y, window.innerHeight - el.offsetHeight - m));
    setPos({ top, left });
  }, [menu.x, menu.y, confirmando]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) onFechar();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", onFechar, true);
    window.addEventListener("resize", onFechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", onFechar, true);
      window.removeEventListener("resize", onFechar);
    };
  }, [onFechar]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["conteudos"] });

  const duplicar = useMutation({
    mutationFn: () => duplicarConteudo(c),
    onSuccess: () => {
      toast("Conteúdo duplicado no mesmo dia.");
      void recarregar();
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  // Status muda na tela na hora; se o banco recusar, volta.
  const mudarStatus = useMutation({
    mutationFn: (status: StatusConteudo) => atualizarConteudo(c.id, { status }),
    onMutate: async (status) => {
      onFechar();
      await qc.cancelQueries({ queryKey: consultaKey });
      const antes = qc.getQueryData(consultaKey);
      qc.setQueryData(consultaKey, (lista = []) => lista.map((x) => (x.id === c.id ? { ...x, status } : x)));
      return { antes };
    },
    onError: (e, _s, ctx) => {
      if (ctx?.antes) qc.setQueryData(consultaKey, ctx.antes);
      toast((e as Error).message, "error");
    },
    onSuccess: (_r, status) => toast(`Status alterado para ${STATUS_CONTEUDO_LABEL[status]}.`),
    onSettled: () => void recarregar(),
  });

  const excluir = useMutation({
    mutationFn: () => excluirConteudo(c.id, c.midias ?? []),
    onSuccess: () => {
      toast("Conteúdo excluído.");
      void recarregar();
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition hover:bg-surface-2 disabled:opacity-60";

  return createPortal(
    <div
      ref={caixa}
      role="menu"
      // O menu nativo do navegador não abre por cima do nosso.
      onContextMenu={(e) => e.preventDefault()}
      style={{ top: pos?.top ?? menu.y, left: pos?.left ?? menu.x }}
      className={`toast-in fixed z-[90] w-56 rounded-xl border border-line/70 bg-surface p-1 shadow-2xl shadow-black/30 ${
        pos ? "" : "invisible"
      }`}
    >
      <p className="truncate px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted">{c.titulo}</p>

      <button
        role="menuitem"
        className={item}
        onClick={() => {
          onFechar();
          onEditar(c);
        }}
      >
        <Pencil size={15} className="text-muted" /> Editar
      </button>
      <button role="menuitem" className={item} disabled={duplicar.isPending} onClick={() => duplicar.mutate()}>
        {duplicar.isPending ? (
          <Loader2 size={15} className="animate-spin text-muted" />
        ) : (
          <Copy size={15} className="text-muted" />
        )}
        {duplicar.isPending ? "Duplicando…" : "Duplicar"}
      </button>

      <div className="my-1 border-t border-line/50" />
      <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Status</p>
      {(Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[]).map((s) => (
        <button
          key={s}
          role="menuitemradio"
          aria-checked={c.status === s}
          className={item}
          onClick={() => (s === c.status ? onFechar() : mudarStatus.mutate(s))}
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_STATUS_CAL[s].ponto}`} />
          <span className="flex-1">{STATUS_CONTEUDO_LABEL[s]}</span>
          {c.status === s && <Check size={14} className="text-gold" />}
        </button>
      ))}

      <div className="my-1 border-t border-line/50" />
      {confirmando ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="flex-1 text-sm text-muted">Excluir de vez?</span>
          <button
            onClick={() => excluir.mutate()}
            disabled={excluir.isPending}
            className="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {excluir.isPending ? "Excluindo…" : "Excluir"}
          </button>
          <button onClick={() => setConfirmando(false)} className="text-xs text-muted hover:text-ink">
            Não
          </button>
        </div>
      ) : (
        <button
          role="menuitem"
          className={`${item} text-rose-500 hover:bg-rose-500/10`}
          onClick={() => setConfirmando(true)}
        >
          <Trash2 size={15} /> Excluir
        </button>
      )}
    </div>,
    document.body,
  );
}

/**
 * Duplo clique no espaço vazio de um dia/faixa cria conteúdo ali. Se o clique
 * caiu num conteúdo ou botão (número do dia, +), é deles — não abre nada.
 */
function noVazio(e: ReactMouseEvent) {
  return !(e.target as HTMLElement).closest("button, a");
}

function NumeroDia({
  dia,
  hoje,
  apagado = false,
  onClick,
}: {
  dia: string;
  hoje: string;
  apagado?: boolean;
  onClick: () => void;
}) {
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

function BotaoNovo({ onClick, dia, hora }: { onClick: () => void; dia: string; hora?: string | undefined }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Novo conteúdo em ${deYmd(dia).toLocaleDateString("pt-BR")}${hora ? ` às ${hora}` : ""}`}
      className="rounded-md p-0.5 text-muted opacity-0 transition hover:bg-surface-2 hover:text-ink focus:opacity-100 group-hover:opacity-100"
    >
      <Plus size={14} />
    </button>
  );
}

type Arraste = {
  alvo: string | null;
  sobre: (chave: string) => (e: DragEvent) => void;
  saiu: (chave: string) => () => void;
  soltar: (e: DragEvent, dia: string, faixa?: Faixa) => void;
};

/**
 * Semana e Dia: uma linha por hora, mais a linha "Sem horário" no topo pro
 * que ainda não tem hora marcada. As horas vão de 7h a 22h, esticando se
 * algum conteúdo cair antes ou depois — assim um post das 5h não some.
 */
function GradeHorarios({
  dias,
  porDia,
  hoje,
  arraste,
  onAbrir,
  onMenu,
  onNovo,
  onAbrirDia,
  detalhado = false,
}: {
  dias: string[];
  porDia: Map<string, Conteudo[]>;
  hoje: string;
  arraste: Arraste;
  onAbrir: (c: Conteudo) => void;
  onNovo: (dia: string, hora?: string | null) => void;
  onAbrirDia?: (dia: string) => void;
  onMenu: AbrirMenu;
  /** Visão diária: cartões com mais informação no lugar dos chips. */
  detalhado?: boolean;
}) {
  const itens = dias.flatMap((d) => porDia.get(d) ?? []);
  const usadas = itens.flatMap((c) => (c.hora ? [horaDe(c.hora)] : []));
  const inicio = Math.min(7, ...usadas);
  const fim = Math.max(22, ...usadas);
  const faixas: ("sem" | number)[] = ["sem", ...Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i)];

  const agora = new Date().getHours();
  const colunas = { gridTemplateColumns: `4.5rem repeat(${dias.length}, minmax(0, 1fr))` };

  const naFaixa = (dia: string, faixa: "sem" | number) =>
    (porDia.get(dia) ?? []).filter((c) => (faixa === "sem" ? !c.hora : c.hora && horaDe(c.hora) === faixa));

  return (
    <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm shadow-black/5">
      {/* Cabeçalho dos dias (só na semana; no dia o título já diz qual é). */}
      {!detalhado && (
        <div className="grid border-b border-line/70" style={colunas}>
          <div />
          {dias.map((dia) => (
            <button
              key={dia}
              onClick={() => onAbrirDia?.(dia)}
              title="Abrir o dia"
              className="flex items-center gap-2 border-l border-line/50 px-3 py-2 text-left transition hover:bg-surface-2/60"
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
          ))}
        </div>
      )}

      {faixas.map((faixa, i) => {
        const rotuloHora = faixa === "sem" ? null : `${String(faixa).padStart(2, "0")}:00`;
        const agoraAqui = faixa === agora && dias.includes(hoje);
        return (
          <div
            key={faixa}
            className={`grid ${i < faixas.length - 1 ? "border-b" : ""} ${
              faixa === "sem" ? "border-line/70 bg-surface-2/30" : "border-line/40"
            }`}
            style={colunas}
          >
            <div
              className={`px-3 py-2 text-right text-[11px] tabular-nums ${
                agoraAqui ? "font-semibold text-gold" : "text-muted"
              }`}
            >
              {rotuloHora ?? "Sem horário"}
            </div>
            {dias.map((dia) => {
              const chave = `${dia}|${faixa}`;
              const aqui = naFaixa(dia, faixa);
              return (
                <div
                  key={dia}
                  onDragOver={arraste.sobre(chave)}
                  onDragLeave={arraste.saiu(chave)}
                  onDrop={(e) => arraste.soltar(e, dia, faixa)}
                  onDoubleClick={(e) => noVazio(e) && onNovo(dia, rotuloHora ? `${rotuloHora}:00` : null)}
                  className={`group relative flex flex-col gap-1 border-l border-line/40 transition-colors ${
                    detalhado ? "min-h-16 p-1.5" : "min-h-16 p-1"
                  } ${dia === hoje && !detalhado ? "bg-gold/[0.04]" : ""} ${
                    arraste.alvo === chave ? "bg-gold/10 ring-2 ring-inset ring-gold/50" : ""
                  }`}
                >
                  {aqui.map((c) =>
                    detalhado ? (
                      <CartaoHorario key={c.id} c={c} onAbrir={() => onAbrir(c)} onMenu={onMenu} />
                    ) : (
                      <Chip key={c.id} c={c} onAbrir={() => onAbrir(c)} onMenu={onMenu} bloco />
                    ),
                  )}
                  {/* O + só aparece em faixa vazia (no hover): com conteúdo,
                      o bloco ocupa tudo e o botão ficaria por cima do título. */}
                  {aqui.length === 0 && (
                    <div className="absolute right-1 top-1">
                      <BotaoNovo
                        dia={dia}
                        hora={rotuloHora ?? undefined}
                        onClick={() => onNovo(dia, rotuloHora ? `${rotuloHora}:00` : null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <p className="border-t border-line/50 px-4 py-2.5 text-xs text-muted">
        Dica: arraste um conteúdo para outro {detalhado ? "horário" : "dia ou horário"} para remarcar. Dê dois cliques
        numa faixa vazia (ou use o +) para criar já com a hora marcada.
      </p>
    </div>
  );
}

/** Cartão da visão diária: tudo que importa sem abrir o conteúdo. */
function CartaoHorario({ c, onAbrir, onMenu }: { c: Conteudo; onAbrir: () => void; onMenu: AbrirMenu }) {
  const cor = COR_STATUS_CAL[c.status];
  const { ref, gatilho, preview } = usePreview(c);
  return (
    <button
      ref={ref}
      {...gatilho}
      draggable
      onDragStart={(e) => {
        gatilho.onMouseLeave();
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => {
        gatilho.onMouseLeave();
        onAbrir();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        gatilho.onMouseLeave();
        onMenu(c, e);
      }}
      className={`flex w-full flex-1 cursor-grab items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:brightness-95 active:cursor-grabbing ${cor.chip}`}
    >
      {preview}
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cor.ponto}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {hhmm(c.hora) && <span className="text-sm font-semibold tabular-nums">{hhmm(c.hora)}</span>}
          <span className="text-sm font-medium">{c.titulo}</span>
          <StatusConteudoBadge status={c.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <PilulasConteudo c={c} />
          {(c.midias?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-xs opacity-80">
              <ImageIcon size={11} /> {c.midias.length}
            </span>
          )}
        </div>
        {c.legenda && <p className="mt-1 line-clamp-1 text-xs opacity-70">{c.legenda}</p>}
      </div>
    </button>
  );
}

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

/** Contagem por status no período: dá pra ver de relance o que ainda falta andar. */
function Resumo({ conteudos, unidade }: { conteudos: Conteudo[]; unidade: string }) {
  const total = conteudos.length;
  const por = (s: StatusConteudo) => conteudos.filter((c) => c.status === s).length;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
      <span className="mr-1 font-medium text-ink">
        {total} {total === 1 ? "conteúdo" : "conteúdos"} {unidade === "semana" ? "na" : "no"} {unidade}
      </span>
      {(Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[]).map((s) => (
        <span key={s} className={`rounded-full px-2.5 py-0.5 ring-1 ring-inset ${COR_STATUS[s]}`}>
          {STATUS_CONTEUDO_LABEL[s]}: {por(s)}
        </span>
      ))}
    </div>
  );
}

/**
 * `bloco`: versão da grade por horário (semana). Ocupa a faixa inteira e,
 * com vários no mesmo horário, eles dividem a altura; o título ganha duas
 * linhas em vez de ser cortado.
 */
function Chip({
  c,
  onAbrir,
  onMenu,
  bloco = false,
}: {
  c: Conteudo;
  onAbrir: () => void;
  onMenu: AbrirMenu;
  bloco?: boolean;
}) {
  const cor = COR_STATUS_CAL[c.status];
  const publicado = c.status === "publicado";
  const { ref, gatilho, preview } = usePreview(c);
  const temImagem = (c.midias?.length ?? 0) > 0;

  if (bloco) {
    return (
      <button
        ref={ref}
        {...gatilho}
        draggable
        onDragStart={(e) => {
          gatilho.onMouseLeave();
          e.dataTransfer.setData("text/plain", c.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => {
          gatilho.onMouseLeave();
          onAbrir();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          gatilho.onMouseLeave();
          onMenu(c, e);
        }}
        className={`flex min-h-14 w-full flex-1 cursor-grab flex-col justify-center gap-1 rounded-lg px-2.5 py-2 text-left text-xs leading-snug transition hover:brightness-95 active:cursor-grabbing ${cor.chip}`}
      >
        {preview}
        <span className="flex w-full items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${cor.ponto}`} />
          {hhmm(c.hora) && <span className="font-semibold tabular-nums">{hhmm(c.hora)}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-1 opacity-70">
            {temImagem && <ImageIcon size={12} />}
            {publicado && <CheckCircle2 size={12} />}
          </span>
        </span>
        <span className="line-clamp-2 font-medium">{c.titulo}</span>
        <PilulasConteudo c={c} />
      </button>
    );
  }

  return (
    <button
      ref={ref}
      {...gatilho}
      draggable
      onDragStart={(e) => {
        gatilho.onMouseLeave();
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => {
        gatilho.onMouseLeave();
        onAbrir();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        gatilho.onMouseLeave();
        onMenu(c, e);
      }}
      className={`flex w-full cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition hover:brightness-95 active:cursor-grabbing ${cor.chip}`}
    >
      {preview}
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cor.ponto}`} />
      {hhmm(c.hora) && <span className="shrink-0 font-semibold tabular-nums">{hhmm(c.hora)}</span>}
      <span className="truncate">{c.titulo}</span>
      {(c.midias?.length ?? 0) > 0 && (
        <ImageIcon size={11} className={`shrink-0 opacity-70 ${publicado ? "" : "ml-auto"}`} />
      )}
      {publicado && <CheckCircle2 size={11} className="ml-auto shrink-0" />}
    </button>
  );
}

/* ── Preview ao passar o mouse ──────────────────────────────────────
   Chip e cartão são pequenos demais pra mostrar a arte; o preview abre ao
   lado, sem precisar clicar. */

const LARGURA_PREVIEW = 256;
/** Espera antes de abrir: só passar o mouse por cima a caminho de outro lugar não pisca nada. */
const ATRASO_PREVIEW_MS = 300;

/**
 * Toda arte aparece em 4:5 no preview, qualquer que seja o formato: um
 * tamanho só deixa o cartão previsível. A imagem é recortada pelo centro.
 */
const PROPORCAO_ARTE = "aspect-[4/5] w-full";

function usePreview(c: Conteudo) {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [ancora, setAncora] = useState<DOMRect | null>(null);

  const fechar = () => {
    window.clearTimeout(timer.current);
    setAncora(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A posição é tirada na abertura; se a página rolar, o preview ficaria
  // flutuando longe do chip — então rolar fecha.
  useEffect(() => {
    if (!ancora) return;
    window.addEventListener("scroll", fechar, true);
    return () => window.removeEventListener("scroll", fechar, true);
  }, [ancora]);

  return {
    ref,
    gatilho: {
      onMouseEnter: () => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          if (ref.current) setAncora(ref.current.getBoundingClientRect());
        }, ATRASO_PREVIEW_MS);
      },
      onMouseLeave: fechar,
    },
    preview: ancora ? <PreviewConteudo c={c} ancora={ancora} /> : null,
  };
}

/**
 * Vai por portal direto no <body>: a grade do calendário tem overflow
 * escondido, e dentro dela o preview sairia cortado nas bordas.
 */
function PreviewConteudo({ c, ancora }: { c: Conteudo; ancora: DOMRect }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const capa = c.midias?.[0];
  const { data: urls = {}, isLoading } = useQuery(urlsMidiaQuery(capa ? [capa] : []));
  const url = capa ? urls[capa] : undefined;

  // Mede antes de pintar: à direita do chip se couber, senão à esquerda, e
  // sempre dentro da altura da janela (a arte carrega e muda a altura).
  useLayoutEffect(() => {
    const altura = caixa.current?.offsetHeight ?? 0;
    const m = 8;
    let left = ancora.right + m;
    if (left + LARGURA_PREVIEW > window.innerWidth - m) left = ancora.left - LARGURA_PREVIEW - m;
    left = Math.max(m, left);
    const top = Math.max(m, Math.min(ancora.top, window.innerHeight - altura - m));
    setPos({ top, left });
  }, [ancora, url]);

  return createPortal(
    <div
      ref={caixa}
      aria-hidden
      style={{ top: pos?.top ?? ancora.top, left: pos?.left ?? ancora.right, width: LARGURA_PREVIEW }}
      className={`toast-in pointer-events-none fixed z-[80] overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-2xl shadow-black/40 ${
        pos ? "" : "invisible"
      }`}
    >
      {capa ? (
        <div className="relative bg-surface-2">
          <div className={`relative overflow-hidden ${PROPORCAO_ARTE}`}>
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted">
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
              </div>
            )}
          </div>
          {c.midias.length > 1 && (
            <span className="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              1/{c.midias.length}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 bg-surface-2 py-6 text-xs text-muted">
          <ImageIcon size={14} /> Sem arte anexada
        </div>
      )}

      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-ink">{c.titulo}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <span className={`h-2 w-2 rounded-full ${COR_FORMATO[c.formato].ponto}`} />
          {FORMATO_LABEL[c.formato]}
          <span>· {hhmm(c.hora) ?? "sem horário"}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusConteudoBadge status={c.status} />
          {c.redes.map((r) => (
            <SeloRede key={r} rede={r} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Lista({
  conteudos,
  carregando,
  onAbrir,
  onMenu,
  unidade,
}: {
  conteudos: Conteudo[];
  carregando: boolean;
  onAbrir: (c: Conteudo) => void;
  unidade: string;
  onMenu: AbrirMenu;
}) {
  // Uma assinatura só pra capa (1ª imagem) de todos os itens do período.
  const capas = conteudos.flatMap((c) => c.midias?.slice(0, 1) ?? []);
  const { data: urls = {} } = useQuery(urlsMidiaQuery(capas));

  if (carregando) return <Card><Vazio>Carregando…</Vazio></Card>;
  if (!conteudos.length) {
    return (
      <Card>
        <Vazio>Nenhum conteúdo n{unidade === "semana" ? "esta" : "este"} {unidade}. Use “Novo conteúdo” para planejar o primeiro.</Vazio>
      </Card>
    );
  }

  const grupos = new Map<string, Conteudo[]>();
  for (const c of conteudos) grupos.set(c.data, [...(grupos.get(c.data) ?? []), c]);

  return (
    <div className="flex flex-col gap-4">
      {[...grupos].map(([dia, itens]) => (
        <section key={dia}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{diaExtenso(dia)}</h3>
          <div className="flex flex-col gap-2">
            {itens.map((c) => (
              <button
                key={c.id}
                onClick={() => onAbrir(c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onMenu(c, e);
                }}
                className="flex w-full items-start gap-3 rounded-2xl border border-line/70 bg-surface p-4 text-left shadow-sm shadow-black/5 transition hover:border-gold/40"
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${COR_STATUS_CAL[c.status].ponto}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium text-ink">{c.titulo}</p>
                    <StatusConteudoBadge status={c.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{FORMATO_LABEL[c.formato]}</span>
                    {c.redes.length > 0 && <span>· {c.redes.map((r) => REDE_LABEL[r]).join(", ")}</span>}
                    <span className="flex items-center gap-1">
                      · <Clock size={11} /> {hhmm(c.hora) ?? "sem horário"}
                    </span>
                  </p>
                  {c.legenda && <p className="mt-2 line-clamp-2 text-sm text-muted">{c.legenda}</p>}
                </div>
                {c.midias?.[0] && (
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line/70 bg-surface-2">
                    {urls[c.midias[0]] && (
                      <img src={urls[c.midias[0]]} alt="" className="h-full w-full object-cover" />
                    )}
                    {c.midias.length > 1 && (
                      <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1 text-[10px] font-semibold text-white">
                        +{c.midias.length - 1}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Formulário (criar / editar) ─────────────────────────────────── */

const VAZIO: Omit<ConteudoEntrada, "data"> = {
  titulo: "",
  formato: "post",
  redes: ["instagram"],
  hora: null,
  status: "ideia",
  legenda: null,
  link: null,
  observacoes: null,
  midias: [],
};

const campo =
  "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-gold/50 dark:[color-scheme:dark]";

function Formulario({
  edicao,
  projectId,
  eventos,
  onFechar,
}: {
  edicao: Edicao;
  projectId: string;
  /** Eventos do cliente (vazio = campo "Evento" não aparece). */
  eventos: Evento[];
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const editando = edicao.modo === "editar" ? edicao.conteudo : null;

  const [f, setF] = useState<ConteudoEntrada>(() =>
    editando
      ? {
          titulo: editando.titulo,
          formato: editando.formato,
          redes: editando.redes,
          data: editando.data,
          hora: editando.hora,
          status: editando.status,
          legenda: editando.legenda,
          link: editando.link,
          observacoes: editando.observacoes,
          // "?? []": antes do 19_calendario_midias.sql a coluna não existe.
          midias: editando.midias ?? [],
          evento_id: editando.evento_id ?? null,
        }
      : { ...VAZIO, data: edicao.modo === "novo" ? edicao.data : "", hora: edicao.modo === "novo" ? (edicao.hora ?? null) : null },
  );
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  // Comentários escritos num conteúdo novo: ainda não há onde pendurá-los,
  // então esperam aqui e são publicados logo depois de o conteúdo ser criado.
  const [pendentes, setPendentes] = useState<string[]>([]);

  const set = <K extends keyof ConteudoEntrada>(k: K, v: ConteudoEntrada[K]) => setF((a) => ({ ...a, [k]: v }));

  // A imagem sobe na hora em que é escolhida, antes de o conteúdo ser salvo.
  // Guardamos quais subiram nesta abertura do modal pra apagá-las se a
  // pessoa cancelar — senão cada desistência deixaria arquivo solto no bucket.
  const enviadas = useRef<string[]>([]);
  const originais = editando?.midias ?? [];

  function cancelar() {
    void removerMidias(enviadas.current);
    onFechar();
  }

  const salvar = useMutation({
    mutationFn: async () => {
      // Campo de texto vazio vira null: "sem legenda" e não uma legenda "".
      const limpo = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const { midias, evento_id, ...resto } = f;
      const dados: Partial<ConteudoEntrada> = {
        ...resto,
        titulo: f.titulo.trim(),
        hora: f.hora || null,
        legenda: limpo(f.legenda),
        link: limpo(f.link),
        observacoes: limpo(f.observacoes),
        // Só manda `midias` quando há imagem envolvida: assim o calendário
        // continua salvando mesmo antes de o 19_calendario_midias.sql rodar.
        ...(midias.length || originais.length ? { midias } : {}),
        // Mesmo cuidado com o evento: só vai quando há um envolvido, então o
        // calendário salva normalmente num banco sem o 24_eventos.sql.
        ...(evento_id || editando?.evento_id ? { evento_id: evento_id ?? null } : {}),
      };
      if (editando) return atualizarConteudo(editando.id, dados);
      const id = await criarConteudo(projectId, dados as ConteudoEntrada);
      // Um por vez, na ordem em que foram escritos. Se algum falhar, o
      // conteúdo já está salvo: avisa e segue.
      for (const texto of pendentes) {
        try {
          await comentar(id, texto);
        } catch (e) {
          toast(`Conteúdo salvo, mas um comentário não foi publicado: ${(e as Error).message}`, "error");
        }
      }
    },
    onSuccess: () => {
      // Imagens tiradas na edição só somem do bucket depois que o banco
      // aceitou a versão sem elas.
      void removerMidias(originais.filter((m) => !f.midias.includes(m)));
      toast(editando ? "Conteúdo atualizado." : "Conteúdo adicionado ao calendário.");
      void qc.invalidateQueries({ queryKey: ["conteudos"] });
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const excluir = useMutation({
    // Leva junto as já salvas e as que subiram agora e ainda não foram salvas.
    mutationFn: () => excluirConteudo(editando!.id, [...new Set([...originais, ...enviadas.current])]),
    onSuccess: () => {
      toast("Conteúdo excluído.");
      void qc.invalidateQueries({ queryKey: ["conteudos"] });
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  function alternarRede(r: Rede) {
    set("redes", f.redes.includes(r) ? f.redes.filter((x) => x !== r) : [...f.redes, r]);
  }

  const link = linkSeguro(f.link);
  // Enquanto uma imagem sobe, salvar gravaria a lista sem ela.
  const [enviando, setEnviando] = useState(0);
  const ocupado = salvar.isPending || excluir.isPending || enviando > 0;

  return (
    <Modal aberto onFechar={cancelar} titulo={editando ? "Editar conteúdo" : "Novo conteúdo"} maxW="max-w-4xl" corpoFixo>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.titulo.trim() || !f.data) return;
          salvar.mutate();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Duas colunas: à esquerda o material (arte, link, notas); à direita
            o que define a publicação. No celular empilha, arte por último. */}
        {/* No desktop a linha da grade tem a altura da janela e cada coluna
            rola sozinha: a da arte fica parada, só a da direita rola. No
            celular (uma coluna) rola tudo junto. */}
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
          {/* Esquerda fixa: a arte fica à vista enquanto a direita rola. */}
          <div className="sem-barra order-2 flex flex-col gap-4 md:order-1 md:overflow-y-auto">
            <Rotulo texto="Imagem" grupo>
              <CampoImagens
                projectId={projectId}
                midias={f.midias}
                onChange={(m) => set("midias", m)}
                enviando={enviando}
                setEnviando={setEnviando}
                // Uma imagem por demanda: a nova substitui a atual. Se a atual
                // subiu agora (ainda não salva), sai do bucket na hora; a que já
                // estava salva só sai quando o conteúdo for salvo sem ela.
                onEnviada={(caminho) => {
                  const anteriores = f.midias.filter((m) => enviadas.current.includes(m));
                  if (anteriores.length) void removerMidias(anteriores);
                  enviadas.current.push(caminho);
                  setF((a) => ({ ...a, midias: [caminho] }));
                }}
              />
            </Rotulo>

            {/* grupo: o botão de abrir o link fica dentro, e o label o clicaria. */}
            <Rotulo texto="Link da arte / pasta" grupo>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={f.link ?? ""}
                  onChange={(e) => set("link", e.target.value)}
                  placeholder="https://drive.google.com/…"
                  className={campo}
                />
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir link"
                    className="flex shrink-0 items-center rounded-xl border border-line/70 px-3 text-muted transition hover:border-gold/50 hover:text-ink"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </Rotulo>

            <CriadoPor conteudo={editando} />
          </div>

          <div className="rolagem-fina order-1 flex flex-col gap-4 md:order-2 md:-mr-3 md:overflow-y-auto md:pr-3">
            <Rotulo texto="Título">
              <input
                autoFocus
                required
                value={f.titulo}
                onChange={(e) => set("titulo", e.target.value)}
                placeholder="Ex.: Bastidores da gravação"
                className={campo}
              />
            </Rotulo>

            {/* Divulgação de um evento do cliente: o post aparece na aba
                Divulgação do evento e no filtro do calendário. */}
            {(eventos.length > 0 || f.evento_id) && (
              <Rotulo texto="Evento" grupo>
                <Sanfona
                  valores={["", ...eventos.map((e) => e.id)]}
                  rotulo={(v) => (v ? (eventos.find((e) => e.id === v)?.nome ?? "Evento") : "Nenhum (post avulso)")}
                  ativo={(v) => (f.evento_id ?? "") === v}
                  onEscolher={(v) => set("evento_id", v || null)}
                  icone={(v) => (v ? <PartyPopper size={14} className="shrink-0 text-muted" /> : null)}
                  resumo={
                    f.evento_id ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <PartyPopper size={14} className="shrink-0 text-gold" />
                        <span className="truncate">
                          {eventos.find((e) => e.id === f.evento_id)?.nome ?? "Evento"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">Nenhum (post avulso)</span>
                    )
                  }
                />
              </Rotulo>
            )}

            {/* Lado a lado: primeiro onde sai (redes), depois o que é (formato).
                No celular não cabe, e volta a empilhar. */}
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Rotulo texto="Redes" grupo>
                <Sanfona
                  multiplo
                  valores={Object.keys(REDE_LABEL) as Rede[]}
                  rotulo={(v) => REDE_LABEL[v]}
                  ativo={(v) => f.redes.includes(v)}
                  onEscolher={alternarRede}
                  icone={(v) => {
                    const Icone = ICONE_REDE[v];
                    return <Icone size={14} className="shrink-0 text-muted" />;
                  }}
                  resumo={
                    f.redes.length ? (
                      <span className="truncate">{f.redes.map((r) => REDE_LABEL[r]).join(", ")}</span>
                    ) : (
                      <span className="text-muted">Escolha as redes</span>
                    )
                  }
                />
              </Rotulo>
              <Rotulo texto="Formato" grupo>
                <Sanfona
                  valores={Object.keys(FORMATO_LABEL) as Formato[]}
                  rotulo={(v) => FORMATO_LABEL[v]}
                  ativo={(v) => f.formato === v}
                  onEscolher={(v) => set("formato", v)}
                  icone={(v) => <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_FORMATO[v].ponto}`} />}
                  resumo={
                    <span className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_FORMATO[f.formato].ponto}`} />
                      {FORMATO_LABEL[f.formato]}
                    </span>
                  }
                />
              </Rotulo>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Rotulo texto="Data">
                <input
                  type="date"
                  required
                  value={f.data}
                  onChange={(e) => set("data", e.target.value)}
                  className={campo}
                />
              </Rotulo>
              <Rotulo texto="Horário (opcional)">
                <input
                  type="time"
                  value={hhmm(f.hora) ?? ""}
                  onChange={(e) => set("hora", e.target.value || null)}
                  className={campo}
                />
              </Rotulo>
            </div>

            <Rotulo texto="Status" grupo>
              <Opcoes
                valores={Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[]}
                rotulo={(v) => STATUS_CONTEUDO_LABEL[v]}
                ativo={(v) => f.status === v}
                onEscolher={(v) => set("status", v)}
                ponto={(v) => COR_STATUS_CAL[v].ponto}
                corAtiva={(v) => COR_STATUS_CAL[v].pilula}
              />
            </Rotulo>

            <Rotulo texto="Legenda / roteiro">
              <textarea
                rows={6}
                value={f.legenda ?? ""}
                onChange={(e) => set("legenda", e.target.value)}
                placeholder="Texto que vai no post, ou o roteiro do vídeo"
                className={`${campo} resize-y`}
              />
            </Rotulo>

            {/* Conversa no lugar do antigo "Observações internas". O texto de
                observação que já existia aparece no topo, e continua salvo. */}
            <Rotulo texto="Comentários" grupo>
              <Comentarios
                conteudoId={editando?.id}
                observacaoAntiga={editando?.observacoes ?? null}
                pendentes={pendentes}
                onPendentes={setPendentes}
              />
            </Rotulo>
          </div>
        </div>

        {/* Rodapé fixo: grudado na base da janela enquanto o formulário rola,
            então Salvar/Cancelar/Excluir estão sempre à mão. As margens
            negativas estendem a faixa até as bordas do painel. */}
        <div className="-mx-5 -mb-5 mt-4 flex shrink-0 flex-wrap items-center gap-2 border-t border-line/60 bg-surface px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
          {editando &&
            (confirmandoExcluir ? (
              <>
                <span className="text-sm text-muted">Excluir de vez?</span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => excluir.mutate()}
                  className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {excluir.isPending ? "Excluindo…" : "Sim, excluir"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExcluir(false)}
                  className="px-2 py-1.5 text-sm text-muted hover:text-ink"
                >
                  Não
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoExcluir(true)}
                className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-rose-500 transition hover:bg-rose-500/10"
              >
                <Trash2 size={14} /> Excluir
              </button>
            ))}

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={cancelar}
              className="rounded-full border border-line/70 px-4 py-2 text-sm text-ink transition hover:border-gold/50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={ocupado || !f.titulo.trim() || !f.data}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
            >
              {salvar.isPending ? "Salvando…" : editando ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Quem criou a demanda e quando. O nome é gravado pelo banco a partir de quem
 * estava logado (23_conteudo_autor.sql), então todo mundo vê o mesmo autor.
 */
function CriadoPor({ conteudo }: { conteudo: Conteudo | null }) {
  const caixa = "flex items-start gap-2.5 rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2.5 text-xs text-muted";
  if (!conteudo) {
    return (
      <div className={caixa}>
        <UserRound size={15} className="mt-0.5 shrink-0" />
        <p>Ao salvar, fica registrado que <span className="font-medium text-ink">você</span> criou esta demanda.</p>
      </div>
    );
  }
  const d = new Date(conteudo.criado_em);
  const em = `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div className={caixa} title={conteudo.criado_por_email ?? undefined}>
      <UserRound size={15} className="mt-0.5 shrink-0" />
      <p>
        {conteudo.criado_por_nome ? (
          <>
            Criado por <span className="font-semibold text-ink">{conteudo.criado_por_nome}</span>
          </>
        ) : (
          "Criado"
        )}{" "}
        em {em}
      </p>
    </div>
  );
}

/**
 * `grupo` troca o <label> por <div> nos blocos de botões: um label repassa o
 * clique pro primeiro botão de dentro, então clicar em "Formato" escolheria
 * "Post" sozinho.
 */
function Rotulo({
  texto,
  grupo = false,
  className = "block",
  children,
}: {
  texto: string;
  grupo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const Tag = grupo ? "div" : "label";
  return (
    <Tag className={className}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{texto}</span>
      {children}
    </Tag>
  );
}

/**
 * Sanfona: fechada, mostra só o que está escolhido; aberta, lista as opções
 * logo abaixo, empurrando o formulário. Abre no fluxo (e não flutuando como
 * o Dropdown) porque dentro do modal, que rola, uma lista solta sairia
 * cortada. `multiplo` fica aberta enquanto se marca; escolha única fecha.
 */
function Sanfona<T extends string>({
  valores,
  rotulo,
  ativo,
  onEscolher,
  icone,
  resumo,
  multiplo = false,
}: {
  valores: T[];
  rotulo: (v: T) => string;
  ativo: (v: T) => boolean;
  onEscolher: (v: T) => void;
  icone?: (v: T) => ReactNode;
  resumo: ReactNode;
  multiplo?: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface-2 transition-colors ${
        aberta ? "border-gold/50" : "border-line/70"
      }`}
    >
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink"
      >
        <span className="flex min-w-0 flex-1 items-center">{resumo}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${aberta ? "rotate-180" : ""}`}
        />
      </button>

      {aberta && (
        <div className="border-t border-line/50 p-1">
          {valores.map((v) => {
            const marcado = ativo(v);
            return (
              <button
                key={v}
                type="button"
                role={multiplo ? "menuitemcheckbox" : "menuitemradio"}
                aria-checked={marcado}
                onClick={() => {
                  onEscolher(v);
                  if (!multiplo) setAberta(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  marcado ? "bg-gold/10 font-medium text-gold" : "text-ink hover:bg-surface"
                }`}
              >
                {/* Quadrado = pode marcar vários; círculo = só um. */}
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center border ${
                    multiplo ? "rounded" : "rounded-full"
                  } ${marcado ? "border-gold bg-gold text-white" : "border-line"}`}
                >
                  {marcado && (multiplo ? <Check size={11} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />)}
                </span>
                {icone?.(v)}
                <span className="truncate">{rotulo(v)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Botões-pílula no lugar de dropdown: dentro do modal (que rola) a lista cortaria. */
function Opcoes<T extends string>({
  valores,
  rotulo,
  ativo,
  onEscolher,
  ponto,
  corAtiva,
}: {
  valores: T[];
  rotulo: (v: T) => string;
  ativo: (v: T) => boolean;
  onEscolher: (v: T) => void;
  ponto?: (v: T) => string;
  /** Classes da opção marcada; sem isto ela usa o azul padrão. */
  corAtiva?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {valores.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onEscolher(v)}
          aria-pressed={ativo(v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
            ativo(v)
              ? `font-medium ${corAtiva?.(v) ?? "border-gold bg-gold/10 text-gold"}`
              : "border-line/70 text-muted hover:border-gold/40 hover:text-ink"
          }`}
        >
          {ponto && <span className={`h-2 w-2 rounded-full ${ponto(v)}`} />}
          {rotulo(v)}
        </button>
      ))}
    </div>
  );
}

/**
 * A arte do conteúdo — uma imagem por demanda. Sobe pro bucket assim que é
 * escolhida (ou solta na área); escolher outra substitui a atual. Remover
 * aqui só tira do formulário; o arquivo já salvo sai do bucket quando o
 * conteúdo é salvo sem ele.
 */
function CampoImagens({
  projectId,
  midias,
  onChange,
  enviando,
  setEnviando,
  onEnviada,
}: {
  projectId: string;
  midias: string[];
  onChange: (m: string[]) => void;
  enviando: number;
  setEnviando: (f: (n: number) => number) => void;
  onEnviada: (caminho: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const { data: urls = {} } = useQuery(urlsMidiaQuery(midias));

  async function enviar(arquivos: FileList | File[]) {
    // Uma imagem por demanda: de uma seleção (ou arraste) com várias, vale a primeira.
    const lista = [...arquivos].slice(0, 1);
    if (!lista.length) return;
    setEnviando((n) => n + lista.length);
    // Uma por vez: mantém a ordem em que foram escolhidas (a do carrossel).
    for (const arquivo of lista) {
      try {
        onEnviada(await enviarMidia(projectId, arquivo));
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
  }

  // Soltar arquivo em qualquer ponto da área (capa, miniaturas ou o "+").
  const soltavel = {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      setArrastando(true);
    },
    onDragLeave: () => setArrastando(false),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setArrastando(false);
      void enviar(e.dataTransfer.files);
    },
  };
  const escolher = () => input.current?.click();
  const capa = midias[0];

  const botaoFoto = "rounded-md bg-black/60 p-1 text-white transition";

  return (
    <div
      {...soltavel}
      className={`rounded-xl transition ${arrastando ? "ring-2 ring-gold ring-offset-2 ring-offset-surface" : ""}`}
    >
      {!capa ? (
        // Sem arte: a própria área de envio ocupa o lugar da capa, no mesmo 4:5.
        <button
          type="button"
          onClick={escolher}
          className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-2/40 px-4 text-center text-sm text-muted transition hover:border-gold/50 hover:text-ink"
        >
          {enviando > 0 ? (
            <>
              <Loader2 size={22} className="animate-spin" />
              Enviando {enviando} {enviando === 1 ? "imagem" : "imagens"}…
            </>
          ) : (
            <>
              <ImagePlus size={24} />
              <span className="font-medium text-ink">Clique ou arraste a arte aqui</span>
              <span className="text-xs">JPG, PNG, WebP ou GIF · até {MAX_MIDIA_MB} MB cada</span>
            </>
          )}
        </button>
      ) : (
        <>
          {/* Capa grande, no 4:5 do preview do calendário. */}
          <div className="group relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-line/70 bg-surface-2">
            {urls[capa] ? (
              <a href={urls[capa]} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
                <img src={urls[capa]} alt="Capa" className="h-full w-full object-cover" />
              </a>
            ) : (
              <div className="flex h-full items-center justify-center text-muted">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Arte
            </span>
            <div className="absolute right-2 top-2 flex gap-1 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={escolher}
                title="Trocar imagem"
                className={`${botaoFoto} flex items-center gap-1 px-2 text-xs hover:bg-black/80`}
              >
                {enviando > 0 ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                Trocar
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                title="Remover imagem"
                className={`${botaoFoto} hover:bg-rose-600`}
              >
                <X size={14} />
              </button>
            </div>
          </div>

        </>
      )}
      <input
        ref={input}
        type="file"
        accept={TIPOS_MIDIA.join(",")}
        hidden
        onChange={(e) => {
          if (e.target.files) void enviar(e.target.files);
          // Limpa pra permitir escolher o mesmo arquivo de novo.
          e.target.value = "";
        }}
      />
    </div>
  );
}
