import { useSyncExternalStore } from "react";

/**
 * Um valor guardado no navegador (localStorage) que avisa o React quando
 * muda. Serve para preferências que ainda não têm lugar no banco: valem só
 * neste navegador, e somem se a pessoa limpar os dados dele.
 */
export function guardado<T>(chave: string, padrao: T) {
  const ouvintes = new Set<() => void>();
  let cache: { valor: T } | null = null;

  function ler(): T {
    if (cache) return cache.valor;
    let valor = padrao;
    try {
      const bruto = localStorage.getItem(chave);
      if (bruto != null) valor = JSON.parse(bruto) as T;
    } catch {
      // sem localStorage (ou conteúdo estragado): fica o padrão
    }
    cache = { valor };
    return valor;
  }

  function gravar(valor: T) {
    // Valor novo a cada mudança: é a troca de referência que avisa o React.
    cache = { valor };
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // localStorage indisponível: vale só nesta sessão
    }
    ouvintes.forEach((cb) => cb());
  }

  function usar(): T {
    return useSyncExternalStore(
      (cb) => {
        ouvintes.add(cb);
        return () => ouvintes.delete(cb);
      },
      ler,
      () => padrao,
    );
  }

  return { ler, gravar, usar };
}

/**
 * O que o super-admin vê ao entrar: a tela de escolher cliente, ou direto o
 * último cliente em que estava.
 */
export type PrimeiraTela = "escolher" | "ultimo";
export const primeiraTela = guardado<PrimeiraTela>("overso:primeira-tela", "escolher");

/** Id do último cliente aberto neste navegador. */
export const ultimoCliente = guardado<string | null>("overso:ultimo-cliente", null);

/** Quando cada cliente foi aberto pela última vez neste navegador (id → ISO). */
export const acessosPorCliente = guardado<Record<string, string>>("overso:acessos-por-cliente", {});
