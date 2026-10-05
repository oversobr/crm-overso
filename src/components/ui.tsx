import { ArrowDown, ArrowUp, Tray } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { Status } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

/**
 * Card. A borda é mais fraca que a dos campos de formulário de propósito:
 * aqui ela só sugere a divisão (o fundo do card contra o da página já faz
 * a maior parte do trabalho), enquanto num input ela é o que diz onde se
 * clica — e lá precisa dos 3:1 do WCAG. Por isso /40 e não /70.
 */
export function Card({
  titulo,
  acao,
  children,
  className = "",
}: {
  titulo?: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-line/40 bg-surface p-6 shadow-sm shadow-black/5 ${className}`}
    >
      {(titulo || acao) && (
        <header className="mb-5 flex items-center justify-between gap-4">
          {titulo && <h2 className="display text-base font-semibold text-ink">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Variação em pílula: fundo tingido, seta e o número. É o padrão das
 * referências — um `+12,95%` verde dentro de uma pílula lê de relance,
 * enquanto o mesmo texto solto se perde no meio dos outros.
 *
 * `menorEhMelhor` inverte as cores: em "atrasados", subir é ruim.
 */
export function Pilula({
  valor,
  sufixo = "%",
  menorEhMelhor = false,
  className = "",
}: {
  valor: number;
  sufixo?: string;
  menorEhMelhor?: boolean;
  className?: string;
}) {
  const subiu = valor > 0;
  const neutro = valor === 0;
  const bom = neutro ? null : menorEhMelhor ? !subiu : subiu;

  const cor = neutro
    ? "bg-surface-2 text-muted"
    : bom
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
      : "bg-rose-500/12 text-rose-600 dark:text-rose-400";

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cor} ${className}`}
    >
      {!neutro &&
        (subiu ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />)}
      {subiu ? "+" : ""}
      {valor}
      {sufixo}
    </span>
  );
}

export function StatCard({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: ReactNode;
  /** Card em cor de marca, como o "Total Balance" das referências. */
  destaque?: boolean;
}) {
  return (
    <div
      className={
        destaque
          ? "rounded-2xl bg-gold px-5 py-4 text-white"
          : "rounded-2xl border border-line/40 bg-surface px-5 py-4"
      }
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${
          destaque ? "text-white" : "text-muted"
        }`}
      >
        {rotulo}
      </p>
      <p className={`mt-1.5 truncate text-2xl font-semibold ${destaque ? "text-white" : "text-ink"}`}>
        {valor}
      </p>
    </div>
  );
}

/* Cores dos badges pensadas pros dois temas: no claro, texto forte sobre
   fundo suave; no escuro, texto claro. Sem isso, o texto some no branco. */
const CORES: Record<Status, string> = {
  novo: "bg-amber-500/12 text-amber-700 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-500/30",
  contato_feito: "bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-500/30",
  entrou_no_grupo:
    "bg-violet-500/12 text-violet-700 ring-violet-600/25 dark:text-violet-300 dark:ring-violet-500/30",
  convertido:
    "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-500/30",
  perdido: "bg-rose-500/12 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-500/30",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CORES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Estado vazio. Ganhou o ícone em quadrado arredondado das referências: uma
 * linha de texto cinza no meio do card parecia erro de carregamento, e o
 * símbolo deixa claro que não há nada ali porque não há nada — não porque
 * quebrou.
 */
export function Vazio({ children, icone }: { children: ReactNode; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        {icone ?? <Tray size={20} />}
      </span>
      <p className="max-w-xs text-sm text-muted">{children}</p>
    </div>
  );
}
