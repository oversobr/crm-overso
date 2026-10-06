import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, Image as IconeImagem, MessageCircle, TriangleAlert, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";

import { useFechaFora } from "@/components/ds/flutuante";
import { usePainel } from "@/components/painel";
import type { Notificacao, TipoNotificacao } from "@/lib/notificacoes";
import { marcarComoLidas, notificacoesQuery, quandoCurto, useLidas, useRegrasDesligadas } from "@/lib/notificacoes";
import { modulosDe } from "@/lib/types";
import { useUsuario } from "@/lib/usuario";

/** Fundo e cor do quadradinho do ícone, por tipo. */
export const COR_NOTIFICACAO: Record<TipoNotificacao, { fundo: string; texto: string }> = {
  alerta: { fundo: "#FDF0DD", texto: "#8A4B08" },
  lead: { fundo: "#E3EEFA", texto: "#1A57A6" },
  comentario: { fundo: "#F3E8FB", texto: "#6B3696" },
  post: { fundo: "#E3EEFA", texto: "#1A57A6" },
};

/** O ícone de cada tipo, no tamanho pedido (18 no sino, 20 na central). */
export function iconeDaNotificacao(tipo: TipoNotificacao, tamanho: number): ReactNode {
  const p = { size: tamanho, strokeWidth: 1.8, "aria-hidden": true } as const;
  if (tipo === "alerta") return <TriangleAlert {...p} />;
  if (tipo === "comentario") return <MessageCircle {...p} />;
  if (tipo === "post") return <IconeImagem {...p} />;
  return <UsersRound {...p} />;
}

/** Quantas cabem no popup; o resto fica em "Ver todas". */
const NO_POPUP = 4;

/**
 * Notificações do cliente atual, já sem as regras desligadas em "Quando
 * avisar" e com o "lida" deste navegador.
 */
export function useNotificacoes() {
  const { projeto } = usePainel();
  const { id } = useUsuario();
  const { data: brutas = [] } = useQuery(notificacoesQuery(projeto?.id, modulosDe(projeto), id));
  const desligadas = useRegrasDesligadas();
  const idsLidos = useLidas();

  return useMemo(() => {
    const todas = brutas.filter((n) => !desligadas.includes(n.regra));
    const lidas = new Set(idsLidos);
    return { todas, lidas, naoLidas: todas.filter((n) => !lidas.has(n.id)) };
  }, [brutas, desligadas, idsLidos]);
}

/** Uma linha de notificação no popup do sino. */
function LinhaNotificacao({ n, lida, onAbrir }: { n: Notificacao; lida: boolean; onAbrir: () => void }) {
  const cor = COR_NOTIFICACAO[n.tipo];
  return (
    <Link
      to={n.para}
      search={n.busca ?? {}}
      onClick={() => {
        marcarComoLidas([n.id]);
        onAbrir();
      }}
      className={`flex items-start gap-3 rounded-[14px] p-2.5 text-marinho no-underline transition-colors hover:bg-superficie-2 focus-visible:outline-offset-0 ${
        lida ? "bg-white" : "bg-azul-claro"
      }`}
    >
      <span
        className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
        style={{ background: cor.fundo, color: cor.texto }}
      >
        {iconeDaNotificacao(n.tipo, 18)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-[0.08em] text-texto-3">{n.modulo}</span>
          <span className="text-[11px] text-texto-3">· {quandoCurto(n.quando)}</span>
        </span>
        <span className="text-[13px] font-semibold leading-[1.4]">{n.titulo}</span>
      </span>
      {!lida && <span aria-label="Não lida" className="mt-1.5 h-2 w-2 flex-none rounded-full bg-azul" />}
    </Link>
  );
}

/** Sino do topo com o popup de notificações recentes. */
export function Sino() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora([caixa], aberto, () => setAberto(false));

  const { todas, lidas, naoLidas } = useNotificacoes();
  const n = naoLidas.length;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        aria-label={n ? `Notificações: ${n} não ${n === 1 ? "lida" : "lidas"}` : "Notificações"}
        className="btn-icone relative"
      >
        <Bell size={20} strokeWidth={1.8} aria-hidden />
        {n > 0 && (
          <span className="absolute -right-[3px] -top-[3px] box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-gelo bg-erro px-1 text-[10px] font-bold text-white">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações recentes"
          className="menu-in absolute right-0 top-14 z-30 flex w-[390px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[20px] border border-borda bg-white shadow-[var(--sombra-popup)]"
        >
          <div className="flex items-center justify-between gap-2.5 px-[18px] pb-3 pt-4">
            <span className="flex items-center gap-2 text-[15px] font-extrabold">
              Notificações
              {n > 0 && (
                <span className="rounded-full bg-erro-fundo px-2 py-0.5 text-[11px] font-bold text-erro-texto">
                  {n} {n === 1 ? "nova" : "novas"}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => marcarComoLidas(todas.map((x) => x.id))}
              disabled={n === 0}
              className="link min-h-9 border-0 bg-transparent px-2 text-[12px] font-bold disabled:text-nevoa disabled:no-underline"
            >
              Marcar como lidas
            </button>
          </div>

          <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
            {todas.length === 0 && (
              <p className="px-2.5 py-6 text-center text-[13px] text-texto-3">Nada novo por aqui. Tudo em dia.</p>
            )}
            {todas.slice(0, NO_POPUP).map((x) => (
              <LinhaNotificacao key={x.id} n={x} lida={lidas.has(x.id)} onAbrir={() => setAberto(false)} />
            ))}
          </div>

          <div className="border-t border-gelo px-3.5 pb-3.5 pt-3">
            <Link to="/notificacoes" onClick={() => setAberto(false)} className="btn btn-primario min-h-[46px] w-full">
              Ver todas as notificações
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
