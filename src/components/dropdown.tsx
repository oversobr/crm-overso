import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export type Opcao = { value: string; label: string };

/**
 * Dropdown próprio, no lugar do <select> nativo — que o navegador desenha
 * com fundo branco do sistema, quebrando o tema (feio no escuro). Aqui a
 * lista usa os tokens do design system e fica igual nos dois temas.
 *
 * Fecha ao clicar fora ou apertar Esc. Sem dependência externa.
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  leading,
  triggerClassName = "",
  menuClassName = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Opcao[];
  placeholder?: string;
  leading?: ReactNode;
  triggerClassName?: string;
  menuClassName?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const selecionada = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={`flex items-center gap-2 text-left outline-none transition ${triggerClassName}`}
      >
        {leading}
        <span className={`flex-1 truncate ${selecionada ? "" : "text-muted"}`}>
          {selecionada?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto && (
        <div
          className={`absolute z-50 mt-2 max-h-72 min-w-full overflow-auto rounded-xl border border-line/70 bg-surface p-1 shadow-lg shadow-black/20 ${menuClassName}`}
        >
          {options.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted">Nenhuma opção</p>
          )}
          {options.map((o) => {
            const ativo = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setAberto(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  ativo ? "bg-gold/10 font-medium text-gold" : "text-ink hover:bg-surface-2"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {ativo && <Check size={15} className="shrink-0 text-gold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
