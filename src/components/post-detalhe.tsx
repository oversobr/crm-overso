import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Image as IconeImagem, Info, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CommentThread } from "@/components/comment-thread";
import { ModalDegrade, StepperBotoes } from "@/components/ds/modal";
import { useUrlsDasArtes } from "@/components/post-pecas";
import { deYmd, fmt, hhmm, ymd } from "@/lib/datas";
import { atualizarConteudo, duplicarConteudo, eventosQuery, excluirConteudo } from "@/lib/queries";
import { COR_POST } from "@/lib/status";
import { toast } from "@/lib/toast";
import type { Conteudo, Project, StatusConteudo } from "@/lib/types";
import { urlSegura } from "@/lib/url";
import { FORMATO_LABEL, modulosDe, REDE_LABEL, STATUS_CONTEUDO_LABEL } from "@/lib/types";

const ETAPAS = (Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[]).map((s) => ({
  id: s,
  rotulo: STATUS_CONTEUDO_LABEL[s],
  cor: COR_POST[s],
}));
const LIMITE_LEGENDA = 2200;


/** "hoje", "ontem" ou "há N dias", contando dias de calendário. */
function haQuantosDias(iso: string): string {
  const n = Math.round((deYmd(ymd(new Date())).getTime() - deYmd(ymd(new Date(iso))).getTime()) / 864e5);
  return n <= 0 ? "hoje" : n === 1 ? "ontem" : `há ${n} dias`;
}

/**
 * Popup de detalhes do post: as etapas (ideia até publicado), as artes em
 * carrossel, a legenda pronta para copiar, a aprovação e os comentários,
 * que podem apontar para um card específico.
 *
 * Aqui o post é lido e movido de etapa; para mudar o conteúdo, "Editar"
 * abre o formulário (components/nova-postagem.tsx).
 */
export function PostDetalhe({
  conteudo: c,
  projeto,
  onEditar,
  onFechar,
}: {
  conteudo: Conteudo;
  projeto: Project;
  onEditar: () => void;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const mods = modulosDe(projeto);
  const { data: eventos = [] } = useQuery({ ...eventosQuery(projeto.id), enabled: mods.eventos });

  const midias = c.midias ?? [];
  const urls = useUrlsDasArtes(midias);
  const [card, setCard] = useState(0);
  const [copiada, setCopiada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  // A etapa muda na tela na hora do clique; o banco confirma em seguida.
  const [status, setStatus] = useState<StatusConteudo>(c.status);
  useEffect(() => setStatus(c.status), [c.status]);

  function recarregar() {
    void qc.invalidateQueries({ queryKey: ["conteudos"] });
    void qc.invalidateQueries({ queryKey: ["conteudo"] });
    void qc.invalidateQueries({ queryKey: ["notificacoes"] });
  }

  const mudarEtapa = useMutation({
    mutationFn: (novo: StatusConteudo) => atualizarConteudo(c.id, { status: novo }),
    onMutate: (novo) => setStatus(novo),
    onSuccess: (_r, novo) => {
      toast(novo === "publicado" ? "Post marcado como publicado." : `Post movido para ${STATUS_CONTEUDO_LABEL[novo]}.`);
      recarregar();
    },
    onError: (e) => {
      setStatus(c.status);
      toast((e as Error).message, "error");
    },
  });

  const excluir = useMutation({
    mutationFn: () => excluirConteudo(c.id, midias),
    onSuccess: () => {
      toast("Post excluído.");
      recarregar();
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const duplicar = useMutation({
    mutationFn: () => duplicarConteudo(c),
    onSuccess: () => {
      toast("Post duplicado no mesmo dia, com cópia das artes.");
      recarregar();
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  async function copiarLegenda() {
    try {
      await navigator.clipboard.writeText(c.legenda ?? "");
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      toast("Não consegui copiar. Selecione o texto e copie à mão.", "error");
    }
  }

  /** Baixa cada arte com um nome legível ("titulo-do-post-1.jpg"). */
  async function baixarArtes() {
    setBaixando(true);
    const base =
      c.titulo
        .normalize("NFD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase() || "arte";
    try {
      for (const [i, m] of midias.entries()) {
        const url = urls[m];
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        const local = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = local;
        a.download = `${base}-${i + 1}.${m.split(".").pop() || "jpg"}`;
        a.click();
        URL.revokeObjectURL(local);
      }
    } catch {
      toast("Não consegui baixar as artes. Abra a imagem e salve por ela.", "error");
    } finally {
      setBaixando(false);
    }
  }

  const indice = Math.min(card, Math.max(0, midias.length - 1));
  const atual = midias[indice];
  const varias = midias.length > 1;
  const link = urlSegura(c.link);
  const ocupado = mudarEtapa.isPending || excluir.isPending || duplicar.isPending;

  const quando = `${fmt(c.data, { weekday: "short" }).replace(".", "").replace(/^./, (l) => l.toUpperCase())}, ${c.data.slice(8, 10)} ${fmt(c.data, { month: "short" }).replace(".", "")}${c.hora ? ` · ${hhmm(c.hora)}` : ""}`;
  const pilula = "rounded-full border border-white/[0.24] bg-white/[0.16] px-[9px] py-[3px] font-bold";

  const iEtapa = ETAPAS.findIndex((e) => e.id === status);
  const aprovacao =
    iEtapa < 2
      ? {
          titulo: "Ainda não foi para o cliente",
          texto: "Quando a arte e a legenda estiverem prontas, mude para Aprovação.",
          classe: "border-borda bg-white",
          cor: "#55657A",
        }
      : iEtapa === 2
        ? {
            titulo: "Esperando o cliente aprovar",
            texto: c.em_aprovacao_desde
              ? `Enviado para aprovação ${haQuantosDias(c.em_aprovacao_desde)}. Dá para aprovar ou pedir ajuste por aqui.`
              : `Última alteração ${haQuantosDias(c.atualizado_em)}. Dá para aprovar ou pedir ajuste por aqui.`,
            classe: "border-[#D9BDEF] bg-[#F3E8FB]",
            cor: "#6B3696",
          }
        : {
            titulo: "Aprovado",
            texto: c.aprovado_em
              ? `Aprovado${c.aprovado_por_nome ? ` por ${c.aprovado_por_nome}` : ""} em ${new Date(c.aprovado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}.`
              : "Este post já passou pela aprovação do cliente.",
            classe: "border-[#B5DFC3] bg-sucesso-fundo",
            cor: "#1E6B3A",
          };

  const evento = c.evento_id ? eventos.find((e) => e.id === c.evento_id)?.nome : null;
  const detalhes: [string, ReactNode][] = [
    ["FORMATO", FORMATO_LABEL[c.formato]],
    ["DATA E HORA", `${deYmd(c.data).toLocaleDateString("pt-BR")}${c.hora ? ` · ${hhmm(c.hora)}` : " · sem horário"}`],
    ["CRIADO POR", c.criado_por_nome || "Não registrado"],
    ["CRIADO EM", new Date(c.criado_em).toLocaleDateString("pt-BR")],
    ["EVENTO", evento ?? (mods.eventos ? "Nenhum" : "Nenhum (módulo não contratado)")],
    ["CLIENTE", projeto.nome],
  ];

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      livre
      largura={1080}
      icone={<IconeImagem size={26} strokeWidth={1.8} aria-hidden />}
      titulo={c.titulo}
      contexto={
        <>
          <span className={pilula}>
            {FORMATO_LABEL[c.formato]}
            {varias ? ` · ${midias.length} cards` : ""}
          </span>
          <span className={pilula}>{quando}</span>
          <span className="rounded-full bg-white px-[9px] py-[3px] font-bold" style={{ color: COR_POST[status].texto }}>
            {STATUS_CONTEUDO_LABEL[status]}
          </span>
        </>
      }
      acoes={
        <button
          type="button"
          onClick={onEditar}
          className="btn border border-white/30 bg-white/[0.14] px-4 text-white hover:bg-white/[0.26] focus-visible:outline-white"
        >
          <Pencil size={16} strokeWidth={2} aria-hidden />
          Editar
        </button>
      }
      rodape={
        <>
          {confirmando ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-erro-texto">Excluir o post e as artes para sempre?</span>
              <button
                type="button"
                onClick={() => excluir.mutate()}
                disabled={ocupado}
                className="btn btn-40 bg-erro text-white hover:bg-erro-texto"
              >
                {excluir.isPending ? "Excluindo…" : "Sim, excluir"}
              </button>
              <button type="button" onClick={() => setConfirmando(false)} className="btn btn-secundario btn-40">
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex min-h-11 items-center gap-2 rounded-[12px] border-0 bg-transparent px-3 text-[13px] font-bold text-erro-texto transition-colors hover:bg-erro-fundo"
              >
                <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                Excluir
              </button>
              <button
                type="button"
                onClick={() => duplicar.mutate()}
                disabled={ocupado}
                className="flex min-h-11 items-center gap-2 rounded-[12px] border-0 bg-transparent px-3 text-[13px] font-semibold text-marinho transition-colors hover:bg-gelo disabled:text-texto-4"
              >
                <Copy size={16} strokeWidth={1.8} aria-hidden />
                {duplicar.isPending ? "Duplicando…" : "Duplicar"}
              </button>
            </div>
          )}
          <div className="flex gap-2.5">
            <button type="button" onClick={onFechar} className="btn btn-secundario min-h-[46px] font-bold">
              Fechar
            </button>
            <button
              type="button"
              onClick={() => mudarEtapa.mutate("publicado")}
              disabled={ocupado || status === "publicado"}
              className="btn btn-primario min-h-[46px] px-5"
            >
              <Check size={16} strokeWidth={2.2} aria-hidden />
              {status === "publicado" ? "Publicado" : "Marcar como publicado"}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 border-b border-borda px-5 py-[18px] sm:px-7">
        <span className="text-[13px] font-bold">Etapa do post</span>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <StepperBotoes
              rotulo="Etapas do post"
              etapas={ETAPAS}
              atual={status}
              onChange={(s) => s !== status && mudarEtapa.mutate(s)}
              disabled={ocupado}
            />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5 px-5 py-[22px] sm:px-7">
          <div className="grid items-start gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
            <div className="flex flex-col gap-2.5">
              <div className="relative flex h-[350px] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[18px] bg-gelo text-texto-3">
                {atual ? (
                  urls[atual] ? (
                    <a href={urls[atual]} target="_blank" rel="noreferrer" title="Abrir em tamanho real" className="h-full w-full">
                      <img src={urls[atual]} alt={`Card ${indice + 1} de ${midias.length}`} className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <LoaderCircle size={24} className="animate-spin" aria-label="Carregando arte" />
                  )
                ) : (
                  <>
                    <IconeImagem size={40} strokeWidth={1.6} aria-hidden />
                    <span className="text-[12px] font-bold">Nenhuma arte anexada</span>
                  </>
                )}
                {varias && (
                  <>
                    <span className="absolute right-3 top-3 rounded-full bg-[rgba(28,46,69,0.6)] px-[9px] py-1 text-[11px] font-bold text-white">
                      {indice + 1}/{midias.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCard((indice + midias.length - 1) % midias.length)}
                      aria-label="Card anterior"
                      className="absolute left-2.5 top-1/2 -mt-5 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-marinho transition-colors hover:bg-white"
                    >
                      <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCard((indice + 1) % midias.length)}
                      aria-label="Próximo card"
                      className="absolute right-2.5 top-1/2 -mt-5 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-marinho transition-colors hover:bg-white"
                    >
                      <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
                    </button>
                  </>
                )}
              </div>

              {varias && (
                <div className="grid grid-cols-4 gap-1.5">
                  {midias.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCard(i)}
                      aria-label={`Ver card ${i + 1}`}
                      aria-pressed={i === indice}
                      className={`box-border h-14 overflow-hidden rounded-[10px] border-[2.5px] bg-gelo p-0 text-[13px] font-extrabold text-texto-3 ${
                        i === indice ? "border-azul" : "border-white"
                      }`}
                    >
                      {urls[m] ? <img src={urls[m]} alt="" className="h-full w-full object-cover" /> : i + 1}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => void baixarArtes()}
                disabled={midias.length === 0 || baixando}
                className="btn btn-secundario btn-40 font-bold"
              >
                <Download size={14} strokeWidth={2} aria-hidden />
                {baixando ? "Baixando…" : midias.length > 1 ? "Baixar artes" : "Baixar arte"}
              </button>
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="link truncate text-center text-[12px]">
                  Abrir link do vídeo ou da pasta
                </a>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="m-0 text-[14px] font-bold">Legenda</h3>
                  {c.legenda && (
                    <button
                      type="button"
                      onClick={() => void copiarLegenda()}
                      className={`min-h-8 border-0 bg-transparent px-2 text-[12px] font-bold ${copiada ? "text-sucesso" : "link"}`}
                    >
                      {copiada ? "Copiada" : "Copiar legenda"}
                    </button>
                  )}
                </div>
                <p
                  className={`m-0 whitespace-pre-line rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[13px] leading-[1.6] [overflow-wrap:anywhere] ${
                    c.legenda ? "" : "text-texto-3"
                  }`}
                >
                  {c.legenda || "Este post ainda não tem legenda."}
                </p>
                <span className="text-[11px] text-texto-3">
                  {(c.legenda ?? "").length.toLocaleString("pt-BR")} / {LIMITE_LEGENDA.toLocaleString("pt-BR")} caracteres
                </span>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-[14px] font-bold">Redes</h3>
                <div className="flex flex-wrap gap-2">
                  {c.redes.length === 0 && <span className="text-[13px] text-texto-3">Nenhuma rede escolhida.</span>}
                  {c.redes.map((r) => (
                    <span
                      key={r}
                      className="flex items-center gap-1.5 rounded-[10px] bg-azul-claro-2 px-3 py-1.5 text-[12px] font-bold text-[#1A57A6]"
                    >
                      <Check size={12} strokeWidth={3} aria-hidden />
                      {REDE_LABEL[r]}
                    </span>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-borda bg-borda">
                {detalhes.map(([k, v]) => (
                  <div key={k} className="flex min-w-0 flex-col gap-1 bg-white px-3 py-2.5">
                    <span className="text-[10px] font-bold tracking-[0.06em] text-texto-3">{k}</span>
                    <span className="text-[13px] font-bold [overflow-wrap:anywhere]">{v}</span>
                  </div>
                ))}
              </section>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-[14px] border border-[#CFE0F5] bg-azul-claro px-3.5 py-3 text-[12px] leading-normal">
            <Info size={18} strokeWidth={2} color="#1A66C2" aria-hidden className="flex-none" />
            A publicação é feita à mão em cada rede. Depois de postar, marque como Publicado aqui.
          </div>
        </div>

        <aside
          aria-label="Aprovação e comentários"
          className="flex min-h-[420px] min-w-0 flex-col gap-3.5 border-t border-borda bg-superficie-2 px-5 py-[22px] sm:px-6 lg:border-l lg:border-t-0"
        >
          <section className={`flex flex-col gap-3 rounded-[16px] border-[1.5px] p-4 ${aprovacao.classe}`}>
            <span className="flex items-center gap-2 text-[13px] font-extrabold" style={{ color: aprovacao.cor }}>
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: aprovacao.cor }} />
              {aprovacao.titulo}
            </span>
            <span className="text-[12px] leading-normal text-texto-2">{aprovacao.texto}</span>
            {status === "aprovacao" && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => mudarEtapa.mutate("producao")} disabled={ocupado} className="btn btn-secundario font-bold">
                  Pedir ajuste
                </button>
                <button
                  type="button"
                  onClick={() => mudarEtapa.mutate("agendado")}
                  disabled={ocupado}
                  className="btn bg-sucesso text-white hover:bg-[#17552E] disabled:opacity-60"
                >
                  Aprovar
                </button>
              </div>
            )}
          </section>

          <CommentThread
            conteudoId={c.id}
            observacaoAntiga={c.observacoes}
            variante="solta"
            // Comentário por card só faz sentido com mais de uma arte.
            cardAtivo={varias ? indice + 1 : null}
          />
        </aside>
      </div>
    </ModalDegrade>
  );
}
