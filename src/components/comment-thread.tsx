import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, X } from "lucide-react";
import { useState } from "react";

import { chegouEm } from "@/lib/leads";
import { apagarComentario, comentar, comentariosQuery, faltaTabelaComentarios } from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Comentario } from "@/lib/types";
import { iniciais, useUsuario } from "@/lib/usuario";

/**
 * Comentário feito sobre um card específico do carrossel. O banco guarda só
 * o texto, então a referência vai na frente dele ("[Card 2] trocar a foto")
 * e a tela a separa de volta num selo. Comentário sem o prefixo é sobre o
 * post inteiro, e os antigos continuam lendo normalmente.
 */
const PREFIXO_CARD = /^\[Card (\d+)\]\s*/;

export function separarCard(texto: string): { card: number | null; texto: string } {
  const m = PREFIXO_CARD.exec(texto);
  return m ? { card: Number(m[1]), texto: texto.slice(m[0].length) } : { card: null, texto };
}

/**
 * Conversa de um post, no visual do design. Cada um apaga só os próprios
 * comentários (a policy do banco garante; o botão é só a interface).
 *
 * `conteudoId` ausente = post ainda não salvo: os comentários vão pra fila
 * `pendentes` (de quem chama) e são publicados logo depois de salvar.
 * `observacaoAntiga` = o texto do antigo campo "Observações", que continua
 * aparecendo no topo pra não se perder.
 */
export function CommentThread({
  conteudoId,
  observacaoAntiga = null,
  pendentes = [],
  onPendentes,
  variante = "cartao",
  cardAtivo = null,
}: {
  conteudoId: string | undefined;
  observacaoAntiga?: string | null;
  /** Fila de comentários de um post ainda não salvo. */
  pendentes?: string[];
  onPendentes?: (l: string[]) => void;
  /**
   * "cartao": dentro de um card branco, com balões cinza (formulário do post).
   * "solta": direto sobre o painel cinza, com balões brancos e o campo de
   * escrever no pé (popup de detalhes).
   */
  variante?: "cartao" | "solta";
  /** Card do carrossel em exibição (1, 2, 3…): o comentário novo fica ligado a ele. */
  cardAtivo?: number | null;
}) {
  const qc = useQueryClient();
  const usuario = useUsuario();
  const [texto, setTexto] = useState("");
  const { data: comentarios = [], error } = useQuery(comentariosQuery(conteudoId));

  const enviar = useMutation({
    mutationFn: () => comentar(conteudoId!, `${cardAtivo ? `[Card ${cardAtivo}] ` : ""}${texto.trim()}`),
    onSuccess: (novo) => {
      setTexto("");
      qc.setQueryData<Comentario[]>(["comentarios", conteudoId], (l = []) => [...l, novo]);
      void qc.invalidateQueries({ queryKey: ["ultimos-comentarios"] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => apagarComentario(id),
    onSuccess: (_r, id) =>
      qc.setQueryData<Comentario[]>(["comentarios", conteudoId], (l = []) => l.filter((c) => c.id !== id)),
    onError: (e) => toast((e as Error).message, "error"),
  });

  // Sem post salvo, "enviar" põe na fila; com post, publica na hora.
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

  const total = naFila ? pendentes.length : comentarios.length;
  const solta = variante === "solta";
  const fundoDoBalao = solta ? "bg-white" : "bg-superficie-2";

  const cabecalho = (
    <div className="flex items-center justify-between">
      {solta ? (
        <h3 className="m-0 text-[14px] font-bold">Comentários</h3>
      ) : (
        <span className="flex items-center gap-2 text-[13px] font-bold">
          <MessageCircle size={16} strokeWidth={1.9} color="#1A66C2" aria-hidden />
          Comentários
        </span>
      )}
      <span className="rounded-full bg-azul-claro-2 px-2 py-0.5 text-[11px] font-bold text-[#1A57A6]">{total}</span>
    </div>
  );

  const corpo = (
    <>
      {observacaoAntiga && (
        <div className={`rounded-[12px] border border-dashed border-nevoa px-2.5 py-2 ${solta ? "bg-white" : ""}`}>
          <span className="text-[10px] font-bold tracking-[0.06em] text-texto-3">OBSERVAÇÃO ANTERIOR</span>
          <p className="m-0 mt-1 whitespace-pre-wrap text-[12px] leading-[1.45] [overflow-wrap:anywhere]">{observacaoAntiga}</p>
        </div>
      )}

      {error && (
        <p className="m-0 text-[12px] leading-normal text-texto-3">
          {faltaTabelaComentarios(error)
            ? "Os comentários ainda não foram ativados no banco deste portal."
            : `Não consegui carregar os comentários: ${(error as Error).message}`}
        </p>
      )}

      {!error && total === 0 && !observacaoAntiga && (
        <p className="m-0 text-[12px] leading-normal text-texto-3">
          {naFila
            ? "Comente à vontade: os comentários são publicados quando o post for salvo."
            : "Nenhum comentário ainda. Registre aqui pedidos, ajustes e combinados."}
        </p>
      )}

      {naFila
        ? pendentes.map((t, i) => (
            <Balao
              key={i}
              fundo={fundoDoBalao}
              sigla={usuario.iniciais}
              meu
              autor={usuario.nome || "Você"}
              selo="Publica ao salvar"
              texto={t}
              onApagar={() => onPendentes?.(pendentes.filter((_, j) => j !== i))}
            />
          ))
        : comentarios.map((c) => {
            const meu = c.autor_id != null && c.autor_id === usuario.id;
            const { card, texto: limpo } = separarCard(c.texto);
            return (
              <Balao
                key={c.id}
                fundo={fundoDoBalao}
                sigla={iniciais(c.autor_nome || c.autor_email)}
                meu={meu}
                autor={c.autor_nome || c.autor_email}
                {...(c.autor_papel ? { selo: c.autor_papel === "overso" ? "OVERSO" : "Cliente" } : {})}
                quando={chegouEm(c.criado_em)}
                card={card}
                texto={limpo}
                onApagar={meu ? () => apagar.mutate(c.id) : undefined}
              />
            );
          })}
    </>
  );

  const campo = (
    <div className={`campo flex min-h-0 items-center gap-2 py-1 pl-3 pr-1 ${solta ? "mt-auto" : ""}`}>
      <label className="flex min-w-0 flex-1">
        <span className="sr-only">Escrever comentário</span>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              mandar();
            }
          }}
          placeholder={cardAtivo ? `Comentar no card ${cardAtivo}` : "Escreva um comentário"}
          maxLength={4900}
          className="min-h-9 min-w-0 flex-1 border-0 bg-transparent text-[12px] text-marinho"
        />
      </label>
      <button
        type="button"
        onClick={mandar}
        disabled={!podeEnviar}
        aria-label="Enviar comentário"
        className="btn btn-primario h-9 min-h-0 w-9 flex-none rounded-[10px] p-0"
      >
        <ArrowRight size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );

  if (solta) {
    return (
      <>
        {cabecalho}
        {corpo}
        {campo}
      </>
    );
  }

  return (
    <section aria-label="Comentários" className="flex flex-col gap-2.5 rounded-[18px] border border-borda bg-white p-3.5">
      {cabecalho}
      {corpo}
      {campo}
    </section>
  );
}

function Balao({
  fundo,
  sigla,
  meu,
  autor,
  selo,
  quando,
  card = null,
  texto,
  onApagar,
}: {
  fundo: string;
  sigla: string;
  /** Comentário de quem está logado: avatar escuro, como a equipe no design. */
  meu: boolean;
  autor: string;
  selo?: string;
  quando?: string;
  /** Card do carrossel a que o comentário se refere. */
  card?: number | null;
  texto: string;
  onApagar?: (() => void) | undefined;
}) {
  return (
    <div className="group flex gap-2.5">
      <span
        className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[10px] font-bold ${
          meu ? "bg-marinho text-white" : "bg-azul-claro-2 text-[#1A57A6]"
        }`}
      >
        {sigla}
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-1 rounded-[4px_12px_12px_12px] px-[11px] py-[9px] ${fundo}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-bold">{autor}</span>
          {selo && <span className="rounded-md bg-alerta-fundo px-1.5 py-px text-[10px] font-bold text-alerta">{selo}</span>}
          {quando && <span className="text-[10px] text-texto-3">{quando}</span>}
          {onApagar && (
            <button
              type="button"
              onClick={onApagar}
              aria-label="Apagar comentário"
              title="Apagar comentário"
              className="ml-auto flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent text-texto-3 opacity-0 transition hover:bg-erro-fundo hover:text-erro-texto focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X size={12} strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </span>
        {card != null && (
          <span className="self-start rounded-md bg-gelo px-[7px] py-0.5 text-[10px] font-bold text-texto-2">Card {card}</span>
        )}
        <span className="whitespace-pre-wrap text-[12px] leading-[1.45] [overflow-wrap:anywhere]">{texto}</span>
      </div>
    </div>
  );
}
