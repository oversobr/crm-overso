/**
 * Endereço digitado por alguém (link útil do cliente, link de material, link
 * do post) antes de virar algo clicável. Só http e https passam: um
 * "javascript:..." guardado no banco rodaria com a sessão de quem clicasse.
 *
 * "site.com.br" ganha "https://". Qualquer outro protocolo devolve null.
 */
export function urlSegura(bruto: string | null | undefined): string | null {
  const texto = (bruto ?? "").trim();
  if (!texto) return null;
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  try {
    const u = new URL(comProtocolo);
    return u.protocol === "http:" || u.protocol === "https:" ? comProtocolo : null;
  } catch {
    return null;
  }
}
