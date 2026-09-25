import { Facebook, Globe, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import type { ComponentType } from "react";

import type { Conteudo, Formato, Rede, StatusConteudo } from "@/lib/types";
import { FORMATO_LABEL, REDE_LABEL, STATUS_CONTEUDO_LABEL } from "@/lib/types";

/**
 * Peças visuais do conteúdo (cores de status e formato, selos, logos das
 * redes) usadas pelo Calendário e pela Dashboard. Ficam fora de arquivo de
 * rota porque rota é dividida em chunks e não deve exportar nada além do Route.
 */

/* ── Cores ──────────────────────────────────────────────────────────
   Classes escritas por extenso: o Tailwind só gera o que encontra literal
   no código. Mesmo esquema dos badges de status dos leads (ui.tsx). */

/** Bolinha de cada formato — usada onde o formato é o assunto (preview e formulário). */
export const COR_FORMATO: Record<Formato, { ponto: string }> = {
  post: { ponto: "bg-sky-500" },
  carrossel: { ponto: "bg-indigo-500" },
  story: { ponto: "bg-amber-500" },
  reels: { ponto: "bg-pink-500" },
  youtube: { ponto: "bg-red-500" },
  shorts: { ponto: "bg-orange-500" },
  tiktok: { ponto: "bg-teal-500" },
  outro: { ponto: "bg-slate-400" },
};

/**
 * Cor de cada status no calendário. É o status (e não o formato) que pinta
 * os conteúdos na grade: de relance dá pra ver o que ainda está em produção
 * e o que já foi publicado. Mesmas cores dos selos e do resumo.
 */
export const COR_STATUS_CAL: Record<StatusConteudo, { ponto: string; chip: string; pilula: string; fundo: string }> = {
  ideia: {
    ponto: "bg-slate-400",
    // Fundo de cartão maior (Próximas publicações da Dashboard): 8% da cor.
    fundo: "bg-slate-500/8",
    chip: "bg-slate-500/15 text-slate-800 dark:text-slate-200",
    pilula: "border-slate-500 bg-slate-500/12 text-slate-700 dark:text-slate-200",
  },
  producao: {
    ponto: "bg-amber-500",
    // Fundo de cartão maior (Próximas publicações da Dashboard): 8% da cor.
    fundo: "bg-amber-500/8",
    chip: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    pilula: "border-amber-500 bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  aprovacao: {
    ponto: "bg-violet-500",
    // Fundo de cartão maior (Próximas publicações da Dashboard): 8% da cor.
    fundo: "bg-violet-500/8",
    chip: "bg-violet-500/15 text-violet-900 dark:text-violet-200",
    pilula: "border-violet-500 bg-violet-500/12 text-violet-700 dark:text-violet-300",
  },
  agendado: {
    ponto: "bg-sky-500",
    // Fundo de cartão maior (Próximas publicações da Dashboard): 8% da cor.
    fundo: "bg-sky-500/8",
    chip: "bg-sky-500/15 text-sky-900 dark:text-sky-200",
    pilula: "border-sky-500 bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  publicado: {
    ponto: "bg-emerald-500",
    // Fundo de cartão maior (Próximas publicações da Dashboard): 8% da cor.
    fundo: "bg-emerald-500/8",
    chip: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
    pilula: "border-emerald-500 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
};

export const COR_STATUS: Record<StatusConteudo, string> = {
  ideia: "bg-slate-500/12 text-slate-700 ring-slate-500/25 dark:text-slate-300 dark:ring-slate-400/30",
  producao: "bg-amber-500/12 text-amber-700 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-500/30",
  aprovacao: "bg-violet-500/12 text-violet-700 ring-violet-600/25 dark:text-violet-300 dark:ring-violet-500/30",
  agendado: "bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-500/30",
  publicado:
    "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-500/30",
};

/**
 * Base comum de toda pílula de conteúdo (status, formato, rede): altura fixa
 * e leading-none centralizam o texto na vertical e deixam todas do mesmo
 * tamanho lado a lado — com padding + line-height cada uma saía de um jeito.
 */
const PILULA_BASE = "inline-flex h-6 items-center justify-center gap-1 whitespace-nowrap rounded-full leading-none";

export function StatusConteudoBadge({ status }: { status: StatusConteudo }) {
  return (
    <span
      className={`${PILULA_BASE} px-2.5 text-xs font-medium ring-1 ring-inset ${COR_STATUS[status]}`}
    >
      {STATUS_CONTEUDO_LABEL[status]}
    </span>
  );
}

export type IconeRede = ComponentType<{ size?: number; className?: string }>;

/* O lucide não tem TikTok nem Pinterest: os dois vêm do desenho oficial da
   marca, preenchidos com currentColor pra seguir a cor do texto como os outros. */
export function IconeTikTok({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

export function IconePinterest({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} aria-hidden>
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
    </svg>
  );
}

/** Uma logo pra cada rede — "Outra" leva o globo, que é o "qualquer lugar da web". */
export const ICONE_REDE: Record<Rede, IconeRede> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: IconeTikTok,
  youtube: Youtube,
  linkedin: Linkedin,
  x: Twitter,
  pinterest: IconePinterest,
  outro: Globe,
};

/**
 * Formato e redes em pílulas, dentro do bloco colorido do status. O fundo
 * claro translúcido destaca a pílula sobre qualquer uma das cores de status,
 * nos dois temas.
 */
export function PilulasConteudo({ c }: { c: Conteudo }) {
  const pilula =
    `${PILULA_BASE} bg-white/65 px-2 text-[11px] font-semibold text-ink shadow-sm shadow-black/5 dark:bg-black/25`;
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className={pilula}>
        <span className={`h-1.5 w-1.5 rounded-full ${COR_FORMATO[c.formato].ponto}`} />
        {FORMATO_LABEL[c.formato]}
      </span>
      {c.redes.map((r) => {
        const Icone = ICONE_REDE[r];
        return (
          <span key={r} className={pilula}>
            <Icone size={10} className="shrink-0" />
            {REDE_LABEL[r]}
          </span>
        );
      })}
    </span>
  );
}

export function SeloRede({ rede }: { rede: Rede }) {
  const Icone = ICONE_REDE[rede];
  return (
    <span className={`${PILULA_BASE} bg-surface-2 px-2.5 text-xs font-medium text-ink ring-1 ring-inset ring-line/70`}>
      <Icone size={11} className="shrink-0" />
      {REDE_LABEL[rede]}
    </span>
  );
}
