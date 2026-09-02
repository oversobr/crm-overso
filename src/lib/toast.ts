import { useSyncExternalStore } from "react";

export type Toast = { id: number; msg: string; tipo: "success" | "info" | "error" };

let toasts: Toast[] = [];
const ouvintes = new Set<() => void>();
let seq = 0;

function emitir() {
  ouvintes.forEach((cb) => cb());
}

/** Mostra uma notificação temporária no canto da tela. */
export function toast(msg: string, tipo: Toast["tipo"] = "success", ms = 3200) {
  const id = ++seq;
  toasts = [...toasts, { id, msg, tipo }];
  emitir();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitir();
  }, ms);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}
