import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

/**
 * Modal com fundo escuro + blur — foco total no conteúdo, o resto some.
 * Fecha no Esc e ao clicar fora. Trava a rolagem do fundo enquanto aberto.
 */
export function Modal({
  aberto,
  onFechar,
  titulo,
  children,
  maxW = "max-w-md",
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo?: string;
  children: ReactNode;
  maxW?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", esc);
    // Trava o scroll do fundo pra o foco ficar mesmo no modal.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onFechar}
      />
      <div
        className={`modal-panel relative w-full ${maxW} rounded-2xl border border-line/70 bg-surface p-6 shadow-2xl`}
      >
        {titulo && (
          <header className="mb-4 flex items-center justify-between gap-4">
            <h2 className="display text-lg font-semibold text-ink">{titulo}</h2>
            <button onClick={onFechar} className="text-muted transition hover:text-ink">
              <X size={18} />
            </button>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
