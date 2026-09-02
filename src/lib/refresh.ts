import { useSyncExternalStore } from "react";

/**
 * Estado "atualizando" compartilhado entre o botão Atualizar (no cabeçalho) e
 * o <main> (no layout), que aplica o blur no conteúdo. É um flag de refresh
 * MANUAL — separado do isFetching do React Query, que dispara em toda carga
 * de fundo e faria a tela piscar à toa.
 */
let atualizando = false;
const ouvintes = new Set<() => void>();

export function setAtualizando(v: boolean) {
  atualizando = v;
  ouvintes.forEach((cb) => cb());
}

export function useAtualizando(): boolean {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => atualizando,
    () => false,
  );
}
