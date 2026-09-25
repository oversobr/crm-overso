import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apagarComentario, comentar, comentariosQuery, faltaTabelaComentarios } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Comentario } from "@/lib/types";

const iniciais = (nome: string) =>
  nome
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

/** "hoje às 14:32" · "ontem às 09:10" · "23/09 às 18:00" · "23/09/2025 às 18:00" */
function quando(iso: string) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return `hoje às ${hora}`;
  if (mesmoDia(d, ontem)) return `ontem às ${hora}`;
  const data = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(d.getFullYear() === hoje.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${data} às ${hora}`;
}

/**
 * Conversa de um conteúdo, no estilo Trello/Asana: cada comentário com autor,
 * data e hora. Enter envia, Shift+Enter quebra linha. Cada um apaga só os
 * próprios comentários (a policy do banco garante; o botão é só a interface).
 *
 * `conteudoId` ausente = conteúdo ainda não salvo: os comentários vão pra
 * fila `pendentes` (do formulário) e são publicados logo depois de salvar.
 * `observacaoAntiga` = o texto do antigo campo "Observações", que
 * continua aparecendo no topo pra não se perder.
 */
export function Comentarios({
  conteudoId,
  observacaoAntiga,
  pendentes = [],
  onPendentes,
}: {
  conteudoId: string | undefined;
  observacaoAntiga: string | null;
  /** Fila de comentários de um conteúdo ainda não salvo. */
  pendentes?: string[];
  onPendentes?: (l: string[]) => void;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const lista = useRef<HTMLDivElement>(null);

  const { data: eu } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await getSupabaseBrowserClient().auth.getUser()).data.user,
  });
  const { data: comentarios = [], isLoading, error } = useQuery(comentariosQuery(conteudoId));

  // Sempre mostra a mensagem mais recente, como num chat.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight });
  }, [comentarios.length, pendentes.length]);

  const enviar = useMutation({
    mutationFn: () => comentar(conteudoId!, texto.trim()),
    onSuccess: (novo) => {
      setTexto("");
      qc.setQueryData<Comentario[]>(["comentarios", conteudoId], (l = []) => [...l, novo]);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => apagarComentario(id),
    onSuccess: (_r, id) =>
      qc.setQueryData<Comentario[]>(["comentarios", conteudoId], (l = []) => l.filter((c) => c.id !== id)),
    onError: (e) => toast((e as Error).message, "error"),
  });

  // Sem conteúdo salvo, "enviar" põe na fila; com conteúdo, publica na hora.
  const naFila = !conteudoId;
  const podeEnviar = texto.trim().length > 0 && !enviar.isPending && (!naFila || Boolean(onPendentes));

  function mandar() {
    if (!podeEnviar) return;
    if (naFila) {
      onPendentes?.([...pendentes, texto.trim()]);
      setTexto("");
      return;
    }
    enviar.mutate();
  }

  return (
    <div className="flex min-h-72 flex-1 flex-col overflow-hidden rounded-xl border border-line/70 bg-surface-2/40">
      <div ref={lista} className="rolagem-fina flex max-h-[22rem] min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {observacaoAntiga && (
          <div className="rounded-lg border border-dashed border-line bg-surface px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Observação anterior</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{observacaoAntiga}</p>
          </div>
        )}

        {naFila ? (
          pendentes.length === 0 ? (
            <Aviso>Comente à vontade: os comentários são publicados quando o conteúdo for salvo.</Aviso>
          ) : (
            pendentes.map((t, i) => (
              <div key={i} className="group flex gap-2.5 opacity-80">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-[11px] font-semibold text-white">
                  {iniciais(eu?.user_metadata?.full_name || eu?.email || "Você")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-ink">Você</span>
                    <span className="shrink-0 text-[11px] italic text-muted">publica ao salvar</span>
                    <button
                      type="button"
                      onClick={() => onPendentes?.(pendentes.filter((_, j) => j !== i))}
                      title="Remover comentário"
                      className="ml-auto rounded p-0.5 text-muted opacity-0 transition hover:text-rose-500 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words rounded-lg rounded-tl-none border border-dashed border-line bg-surface px-2.5 py-1.5 text-sm text-ink">
                    {t}
                  </p>
                </div>
              </div>
            ))
          )
        ) : error ? (
          <Aviso>
            {faltaTabelaComentarios(error)
              ? "Os comentários ainda não foram ativados no banco (supabase/22_comentarios_conteudo.sql)."
              : `Não consegui carregar os comentários: ${(error as Error).message}`}
          </Aviso>
        ) : isLoading ? (
          <Aviso>
            <Loader2 size={16} className="animate-spin" />
          </Aviso>
        ) : comentarios.length === 0 && !observacaoAntiga ? (
          <Aviso>Nenhum comentário ainda. Registre aqui pedidos, ajustes e combinados.</Aviso>
        ) : (
          comentarios.map((c) => {
            const meu = c.autor_id != null && c.autor_id === eu?.id;
            return (
              <div key={c.id} className="group flex gap-2.5">
                <div
                  title={c.autor_email}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    meu ? "bg-gold text-white" : "bg-gold/15 text-gold"
                  }`}
                >
                  {iniciais(c.autor_nome || c.autor_email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-xs font-semibold text-ink">{meu ? "Você" : c.autor_nome}</span>
                    <span className="shrink-0 text-[11px] text-muted">{quando(c.criado_em)}</span>
                    {meu && (
                      <button
                        type="button"
                        onClick={() => apagar.mutate(c.id)}
                        title="Apagar comentário"
                        className="ml-auto rounded p-0.5 text-muted opacity-0 transition hover:text-rose-500 focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-surface px-2.5 py-1.5 text-sm text-ink shadow-sm shadow-black/5">
                    {c.texto}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-line/60 bg-surface p-2">
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra a linha. Não deixa o Enter
            // chegar ao <form> do conteúdo (que salvaria o conteúdo).
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              mandar();
            }
          }}
          placeholder="Escreva um comentário…"
          className="min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-ink outline-none placeholder:text-muted/60 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={mandar}
          disabled={!podeEnviar}
          title="Enviar (Enter)"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold text-white transition hover:bg-gold-dim disabled:opacity-40"
        >
          {enviar.isPending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizontal size={14} />}
        </button>
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center text-xs text-muted">
      <MessageSquare size={18} className="opacity-60" />
      {children}
    </div>
  );
}
