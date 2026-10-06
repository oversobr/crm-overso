import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Fecha um popup ao clicar fora ou apertar Esc. `refs` são as áreas que
 * contam como "dentro": o botão que abre e o próprio popup.
 */
export function useFechaFora(refs: RefObject<HTMLElement | null>[], aberto: boolean, fechar: () => void) {
  // Em ref para o efeito não reassinar os ouvintes a cada render.
  const atual = useRef({ refs, fechar });
  atual.current = { refs, fechar };

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (atual.current.refs.some((r) => r.current?.contains(alvo))) return;
      atual.current.fechar();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") atual.current.fechar();
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
}

/**
 * Popup preso a um elemento, desenhado direto no <body>.
 *
 * Existe por causa do menu lateral: ele rola na vertical, e um elemento que
 * rola num eixo corta o que sai pelo outro. Um popup mais largo que o menu
 * (a lista de clientes, a dica do menu recolhido) sumiria pela metade. No
 * <body>, com posição fixa calculada a partir do botão, nada o corta.
 */
export function Flutuante({
  ancora,
  aberto,
  onFechar,
  lado = "abaixo",
  folga = 8,
  children,
  className,
  style,
  ...resto
}: {
  ancora: RefObject<HTMLElement | null>;
  aberto: boolean;
  onFechar: () => void;
  /** Onde o popup aparece em relação ao botão. */
  lado?: "abaixo" | "direita";
  folga?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  role?: string;
  "aria-label"?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useFechaFora([ancora, caixa], aberto, onFechar);

  useLayoutEffect(() => {
    if (!aberto) return setPos(null);
    function medir() {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      setPos(lado === "direita" ? { top: r.top, left: r.right + folga } : { top: r.bottom + folga, left: r.left });
    }
    medir();
    // Captura: pega a rolagem de qualquer ancestral, não só da janela.
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [aberto, ancora, lado, folga]);

  if (!aberto || !pos) return null;

  return createPortal(
    <div
      ref={caixa}
      className={`menu-in ${className ?? ""}`}
      style={{ position: "fixed", zIndex: 80, top: pos.top, left: pos.left, ...style }}
      {...resto}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Se a janela tem largura de desktop (lg do Tailwind, 1024px). */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}
