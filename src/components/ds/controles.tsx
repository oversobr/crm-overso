import { Check, ChevronDown } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useRef, useState } from "react";

import { useFechaFora } from "./flutuante";

/* ── Tabs com sublinhado ────────────────────────────────────────────── */

export function Tabs<T extends string>({
  abas,
  valor,
  onChange,
  rotulo,
  className = "",
}: {
  abas: { id: T; rotulo: ReactNode; desabilitada?: boolean }[];
  valor: T;
  onChange: (id: T) => void;
  /** Nome do grupo, para leitor de tela ("Série", "Status"). */
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={rotulo} className={`flex gap-6 overflow-x-auto border-b border-borda ${className}`}>
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          aria-selected={a.id === valor}
          disabled={a.desabilitada}
          onClick={() => onChange(a.id)}
          className="aba"
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

/* ── SegmentedControl (Mês, Semana, Dia) ────────────────────────────── */

export function SegmentedControl<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  className = "",
}: {
  opcoes: { id: T; rotulo: ReactNode }[];
  valor: T;
  onChange: (id: T) => void;
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className={`flex gap-1 rounded-[12px] bg-gelo p-1 ${className}`}>
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.id)}
            className={`min-h-[38px] flex-1 whitespace-nowrap rounded-[9px] border-0 px-3 text-[13px] font-bold transition-[background-color,color,box-shadow] focus-visible:outline-offset-0 ${
              ativo
                ? "bg-white text-marinho shadow-[0_1px_3px_rgba(28,46,69,0.12)]"
                : "bg-transparent text-texto-3 hover:text-marinho"
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/* ── Switch ─────────────────────────────────────────────────────────── */

export function Switch({
  ligado,
  onChange,
  rotulo,
  disabled = false,
}: {
  ligado: boolean;
  onChange: (v: boolean) => void;
  /** Nome do que liga e desliga, para leitor de tela. */
  rotulo: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={`box-border flex h-6 w-11 flex-none items-center rounded-full border-0 p-0.5 transition-colors disabled:opacity-50 ${
        ligado ? "justify-end bg-azul hover:bg-azul-hover" : "justify-start bg-nevoa-2 hover:bg-nevoa"
      }`}
    >
      <span className="h-5 w-5 rounded-full bg-white" />
    </button>
  );
}

/* ── Checkbox ───────────────────────────────────────────────────────── */

/** Caixa nativa de 18px pintada no azul da marca, como nas tabelas do design. */
export function Checkbox(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <input type="checkbox" {...props} className={`m-0 h-[18px] w-[18px] accent-azul ${props.className ?? ""}`} />;
}

/* ── MenuSelect: botão pequeno com lista ("14 dias", "Últimos 30 dias") ── */

export function MenuSelect<T extends string | number>({
  valor,
  opcoes,
  onChange,
  rotulo,
  disabled = false,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  onChange: (v: T) => void;
  /** O que a lista escolhe, para leitor de tela ("Período"). */
  rotulo: string;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora([caixa], aberto, () => setAberto(false));
  const atual = opcoes.find((o) => o.valor === valor);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${atual?.rotulo ?? ""}`}
        className="btn btn-secundario btn-36"
      >
        {atual?.rotulo}
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>

      {aberto && (
        <div
          role="listbox"
          aria-label={rotulo}
          className="menu-in absolute right-0 top-[42px] z-40 flex min-w-[168px] flex-col gap-0.5 rounded-[14px] border border-borda bg-white p-1.5 shadow-[var(--sombra-popup)]"
        >
          {opcoes.map((o) => {
            const sel = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  onChange(o.valor);
                  setAberto(false);
                }}
                className={`opcao flex min-h-9 items-center justify-between gap-3 whitespace-nowrap rounded-[10px] border-0 px-2.5 text-left text-[12px] ${
                  sel ? "font-bold" : "font-semibold"
                }`}
              >
                {o.rotulo}
                {sel && <Check size={14} strokeWidth={3} color="#1A66C2" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
