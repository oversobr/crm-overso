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
      className={`rounded-xl border border-line/60 bg-surface/70 p-5 shadow-lg shadow-black/20 ${className}`}
    >
      {(titulo || acao) && (
        <header className="mb-4 flex items-center justify-between gap-4">
          {titulo && <h2 className="display text-base font-semibold text-gold">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="rounded-xl border border-line/60 bg-surface/70 px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{rotulo}</p>
      <p className="mt-1.5 truncate text-2xl font-semibold text-ink">{valor}</p>
    </div>
  );
}

const CORES: Record<Status, string> = {
  novo: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  contato_feito: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  entrou_no_grupo: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  convertido: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  perdido: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CORES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Select({
  valor,
  onChange,
  children,
}: {
  valor: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line/60 bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
    >
      {children}
    </select>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-12 text-center text-sm text-muted">{children}</p>;
}
