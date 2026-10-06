import type { Lead } from "./types";

/* Como um lead aparece na tela: nome, telefone, página, respostas e datas.
   Fica fora do arquivo de rota porque a tabela e o popup usam as mesmas regras. */

/** Campos que já têm coluna própria não precisam repetir em "Respostas". */
const JA_EXIBIDOS = new Set(["nome", "name", "email", "e-mail", "whatsapp", "telefone", "phone", "celular"]);

/** Respostas do formulário, sem o que já tem lugar próprio e sem chaves reservadas (ex.: _perfil). */
export const respostasDe = (l: Lead): [string, unknown][] =>
  Object.entries(l.respostas ?? {}).filter(([k]) => !JA_EXIBIDOS.has(k.toLowerCase()) && !k.startsWith("_"));

export const valorDaResposta = (v: unknown): string => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

export function nomeDoLead(l: Pick<Lead, "nome" | "completo">): string {
  return l.nome?.trim() || (l.completo ? "Sem nome" : "Lead parcial");
}

/** Só os dígitos, com o 55 do Brasil na frente: o formato que o wa.me espera. */
function digitosComPais(whatsapp: string): string {
  const d = whatsapp.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export const linkWhatsApp = (whatsapp: string) => `https://wa.me/${digitosComPais(whatsapp)}`;

/** "(11) 98734-2210". Número fora do padrão brasileiro volta como veio. */
export function telefoneBonito(whatsapp: string | null): string | null {
  if (!whatsapp) return null;
  let d = whatsapp.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return whatsapp;
}

/**
 * Nome da landing page a partir da URL de origem: o último trecho do
 * caminho, legível ("/lp/harmonizacao-facial" vira "Harmonizacao facial").
 * Página na raiz do domínio fica com o próprio domínio.
 */
export function paginaDoLead(origem: string | null): string | null {
  if (!origem) return null;
  try {
    const u = new URL(origem);
    const trecho = u.pathname.split("/").filter(Boolean).pop();
    if (!trecho) return u.host.replace(/^www\./, "");
    const texto = decodeURIComponent(trecho).replace(/\.(html?|php)$/i, "").replace(/[-_]+/g, " ").trim();
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : u.host;
  } catch {
    return origem;
  }
}

const FUSO = "America/Sao_Paulo";
const diaDe = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });
export const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });

/** "Hoje, 09:42" · "Ontem, 22:10" · "03 out" · "03 out 2025" (ano só quando não é o atual). */
export function chegouEm(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  if (diaDe(d) === diaDe(agora)) return `Hoje, ${horaDe(iso)}`;
  if (diaDe(d) === diaDe(new Date(agora.getTime() - 864e5))) return `Ontem, ${horaDe(iso)}`;
  const mesmoAno = diaDe(d).slice(0, 4) === diaDe(agora).slice(0, 4);
  return d
    .toLocaleDateString("pt-BR", {
      timeZone: FUSO,
      day: "2-digit",
      month: "short",
      ...(mesmoAno ? {} : { year: "numeric" }),
    })
    .replace(/\./g, "")
    .replace(/ de /g, " ");
}
