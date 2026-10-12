import { guardado } from "./guardado";
import { getSupabaseBrowserClient } from "./supabase/client";

/**
 * Tema do portal: claro, escuro ou igual ao sistema (HANDOFF, seção 7).
 *
 * O tema é o atributo data-theme do <html>: "escuro" liga as variáveis do
 * tema escuro no styles.css; qualquer outro valor é o claro.
 *
 * A escolha fica em dois lugares. No navegador, para valer no primeiro
 * instante da próxima visita (o script do __root.tsx lê antes de pintar a
 * tela). E no perfil da conta (user_metadata do Supabase), para acompanhar a
 * pessoa em outro aparelho.
 */
export type Tema = "claro" | "escuro" | "sistema";

/** A mesma chave que o script do __root.tsx lê. */
export const CHAVE_DO_TEMA = "overso:tema";
const escolha = guardado<Tema>(CHAVE_DO_TEMA, "claro");

const preferenciaDoSistema = () => window.matchMedia("(prefers-color-scheme: dark)");

/** Pinta o tema na página. "sistema" segue o que o aparelho estiver usando. */
function pintar(tema: Tema) {
  const escuro = tema === "escuro" || (tema === "sistema" && preferenciaDoSistema().matches);
  document.documentElement.dataset.theme = escuro ? "escuro" : "light";
}

let ouvindo = false;
/** Liga uma vez: se a escolha é "sistema", o portal acompanha a troca do aparelho na hora. */
export function acompanharSistema() {
  if (ouvindo || typeof window === "undefined") return;
  ouvindo = true;
  preferenciaDoSistema().addEventListener("change", () => {
    if (escolha.ler() === "sistema") pintar("sistema");
  });
}

export function useTema(): Tema {
  return escolha.usar();
}

/** Troca o tema: vale na hora, fica neste navegador e vai para o perfil da conta. */
export function definirTema(tema: Tema) {
  escolha.gravar(tema);
  pintar(tema);
  // Melhor esforço: sem rede, o tema continua valendo neste navegador.
  void getSupabaseBrowserClient()
    .auth.updateUser({ data: { tema } })
    .catch(() => {});
}

/**
 * O tema guardado no perfil da conta vale sobre o deste navegador: é o que
 * faz a escolha feita no computador aparecer no celular.
 */
export async function receberTemaDaConta() {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  const daConta = (data.user?.user_metadata as { tema?: unknown } | undefined)?.tema;
  if ((daConta === "claro" || daConta === "escuro" || daConta === "sistema") && daConta !== escolha.ler()) {
    escolha.gravar(daConta);
    pintar(daConta);
  }
}
