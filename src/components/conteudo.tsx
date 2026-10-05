import {
  FacebookLogo,
  Globe,
  InstagramLogo,
  LinkedinLogo,
  PinterestLogo,
  TiktokLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
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

/** Uma logo pra cada rede — "Outra" leva o globo, que é o "qualquer lugar da web". */
export const ICONE_REDE: Record<Rede, IconeRede> = {
  instagram: InstagramLogo,
  facebook: FacebookLogo,
  tiktok: TiktokLogo,
  youtube: YoutubeLogo,
  linkedin: LinkedinLogo,
  x: XLogo,
  pinterest: PinterestLogo,
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
