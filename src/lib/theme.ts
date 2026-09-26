import { useSyncExternalStore } from "react";

export type Tema = "dark" | "light";

const CHAVE = "overso:tema";

/** Lê o tema atual do <html>. Default escuro (identidade OVERSO). */
function ler(): Tema {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

const ouvintes = new Set<() => void>();

function subscribe(cb: () => void) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

export function trocarTema(tema?: Tema) {
  const proximo = tema ?? (ler() === "dark" ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", proximo);
  try {
    localStorage.setItem(CHAVE, proximo);
  } catch {
    // localStorage indisponível — o tema vale só nesta sessão
  }
  ouvintes.forEach((cb) => cb());
}

/** Tema reativo: componentes (e os gráficos) re-renderizam ao trocar. */
export function useTema(): Tema {
  return useSyncExternalStore(subscribe, ler, () => "dark");
}

/**
 * Cores que o Recharts precisa como string (não aceita classe Tailwind).
 * Centralizadas aqui pra bater com os tokens do styles.css em cada tema.
 */
export function coresGrafico(tema: Tema) {
  return tema === "light"
    ? { fill: "#1c62c9", fill2: "#b7c3cc", grade: "#d3dbe1", eixo: "#556878", tooltipBg: "#ffffff", tooltipLinha: "#a3b2bf", ink: "#161f2b" }
    // Os hex do escuro acompanham os tokens do styles.css: surface #1e3450 e
    // line #72a0d8. `grade` é mais fraca que a borda de propósito — linha de
    // grade é guia, não deve competir com a barra; `eixo` é TEXTO e usa o
    // muted cheio (5.68:1 sobre o card).
    : { fill: "#2a6ee0", fill2: "#7d93ab", grade: "#3a5f8d", eixo: "#9fb0c0", tooltipBg: "#1e3450", tooltipLinha: "#72a0d8", ink: "#eef1f3" };
}
