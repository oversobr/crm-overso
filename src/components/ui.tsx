import type { ReactNode } from "react";

import type { Status } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

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
      className={`rounded-2xl border border-line/70 bg-surface p-5 shadow-sm shadow-black/5 ${className}`}
    >
      {(titulo || acao) && (
        <header className="mb-4 flex items-center justify-between gap-4">
          {titulo && <h2 className="display text-base font-semibold text-ink">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
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
          : "rounded-2xl border border-line/70 bg-surface px-5 py-4"
      }
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${
          destaque ? "text-white/70" : "text-muted"
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

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-sm text-muted">{children}</p>;
}
