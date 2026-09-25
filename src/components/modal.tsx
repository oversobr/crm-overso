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
  corpoFixo = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo?: string;
  children: ReactNode;
  maxW?: string;
  /**
   * O corpo não rola como um todo: quem estiver dentro decide o que rola
   * (ex.: o formulário de conteúdo, com a coluna da arte parada e só a
   * coluna da direita rolando). O filho recebe uma coluna flex já limitada
   * à altura da janela.
   */
  corpoFixo?: boolean;
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
      {/* Painel em coluna: o cabeçalho fica FORA da área que rola, então
          título e X não saem do topo — e nada passa por cima deles. max-h:
          janelas altas (lead, conteúdo) cabem na tela e rolam por dentro. */}
      <div
        className={`modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden ${maxW} rounded-2xl border border-line/70 bg-surface shadow-2xl`}
      >
        {titulo && (
          <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
            <h2 className="display text-lg font-semibold text-ink">{titulo}</h2>
            <button onClick={onFechar} className="text-muted transition hover:text-ink">
              <X size={18} />
            </button>
          </header>
        )}
        {/* Só o corpo rola. Ele não tem espaçamento vertical próprio (fica no
            miolo abaixo): assim o que gruda dentro dele — o rodapé de botões
            e a coluna fixa do conteúdo — encosta de verdade nas bordas. */}
        <div className={`flex min-h-0 flex-1 flex-col px-5 sm:px-6 ${corpoFixo ? "overflow-hidden" : "overflow-y-auto"}`}>
          <div
            className={`pb-5 sm:pb-6 ${titulo ? "pt-1" : "pt-5 sm:pt-6"} ${corpoFixo ? "flex min-h-0 flex-1 flex-col" : ""}`}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
