import type { CSSProperties, ReactNode } from "react";

import { MarcaOverso } from "@/components/shell/icones-menu";

/** Card branco do design: raio 20, borda #E1E6EB, padding 22. */
export function Card({
  titulo,
  subtitulo,
  acao,
  children,
  className = "",
  style,
  ...resto
}: {
  titulo?: string;
  subtitulo?: string;
  /** À direita do título: um botão, um período, um link. */
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-3.5 rounded-[20px] border border-borda bg-white p-[22px] ${className}`}
      style={style}
      {...resto}
    >
      {(titulo || acao) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-[3px]">
            {titulo && <h2 className="m-0 text-[16px] font-bold">{titulo}</h2>}
            {subtitulo && <span className="text-[12px] text-texto-3">{subtitulo}</span>}
          </div>
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

/** Card de destaque: degradê claro com a marca em marca-d'água. */
export function HighlightCard({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`relative flex min-w-0 flex-col gap-3.5 overflow-hidden rounded-[20px] p-[22px] text-white ${className}`}
      style={{ background: "var(--degrade-claro)", ...style }}
    >
      <MarcaOverso largura={190} altura={172} className="pointer-events-none absolute -right-[30px] -top-2.5 opacity-10" />
      {children}
    </section>
  );
}

/**
 * Variação em pílula: `bom` em verde, `ruim` em vermelho, `neutro` em cinza.
 * Quem chama decide o tom, porque em alguns números subir é ruim.
 */
export function Variacao({
  children,
  tom = "neutro",
  sobreDegrade = false,
}: {
  children: ReactNode;
  tom?: "bom" | "ruim" | "neutro";
  /** Dentro do HighlightCard: branco translúcido no lugar da cor. */
  sobreDegrade?: boolean;
}) {
  const cor = sobreDegrade
    ? "bg-white/[0.18] text-white"
    : tom === "bom"
      ? "bg-sucesso-fundo text-sucesso"
      : tom === "ruim"
        ? "bg-erro-fundo text-erro-texto"
        : "bg-gelo text-texto-2";
  return <span className={`whitespace-nowrap rounded-full px-[9px] py-1 text-[12px] font-bold ${cor}`}>{children}</span>;
}

/** Card de indicador: rótulo, número grande, variação e uma linha de contexto. */
export function KpiCard({
  rotulo,
  valor,
  variacao,
  contexto,
  className = "",
}: {
  rotulo: string;
  valor: ReactNode;
  variacao?: ReactNode;
  contexto?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2.5 rounded-[20px] border border-borda bg-white p-5 ${className}`}>
      <span className="text-[13px] font-semibold text-texto-3">{rotulo}</span>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[30px] font-extrabold leading-none tracking-[-0.02em]">{valor}</span>
        {variacao}
      </div>
      {contexto && <span className="text-[12px] text-texto-3">{contexto}</span>}
    </div>
  );
}

/** Estado vazio: o card não tem nada porque não há nada, não porque quebrou. */
export function EmptyState({
  icone,
  titulo,
  children,
  acao,
}: {
  icone?: ReactNode;
  titulo?: string;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-4 py-8 text-center">
      {icone && (
        <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-superficie-2 text-texto-3">{icone}</span>
      )}
      {titulo && <span className="text-[14px] font-bold">{titulo}</span>}
      {children && <span className="max-w-[320px] text-[13px] leading-normal text-texto-3">{children}</span>}
      {acao}
    </div>
  );
}
