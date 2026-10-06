/**
 * "Manter conectado neste computador".
 *
 * O login do Supabase fica guardado em cookie de longa duração: fechar o
 * navegador não desloga. Quem desmarca a opção no login quer o contrário,
 * então a sessão ganha um prazo: vale enquanto o navegador estiver aberto.
 *
 * Como: um cookie SEM data de validade (o navegador o apaga ao fechar) marca
 * que a sessão curta ainda está viva. Ele vale para todas as abas, ao
 * contrário do sessionStorage, que é de uma aba só. Na próxima vez que o
 * portal abrir sem esse cookie, a conta é deslogada (routes/_authed.tsx).
 *
 * Limite conhecido: navegador configurado para "continuar de onde parou"
 * restaura os cookies de sessão, e aí o login também continua.
 */
const CHAVE_CURTA = "overso:sessao-curta";
const COOKIE_VIVA = "overso_sessao_viva";

/** Chamado logo depois de um login bem-sucedido. */
export function definirDuracaoDaSessao(manterConectado: boolean) {
  try {
    if (manterConectado) {
      localStorage.removeItem(CHAVE_CURTA);
    } else {
      localStorage.setItem(CHAVE_CURTA, "1");
      document.cookie = `${COOKIE_VIVA}=1; path=/; SameSite=Lax`;
    }
  } catch {
    // sem localStorage: a sessão fica como o Supabase a deixa (conectada)
  }
}

/** Se a pessoa pediu sessão curta e o navegador foi fechado desde então. */
export function sessaoCurtaVenceu(): boolean {
  try {
    if (localStorage.getItem(CHAVE_CURTA) !== "1") return false;
    return !document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_VIVA}=`));
  } catch {
    return false;
  }
}

/** Limpa a marca, ao sair ou quando a sessão curta vence. */
export function esquecerSessaoCurta() {
  try {
    localStorage.removeItem(CHAVE_CURTA);
    document.cookie = `${COOKIE_VIVA}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // nada a limpar
  }
}
