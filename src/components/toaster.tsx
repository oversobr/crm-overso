import { Check, Info, Warning } from "@phosphor-icons/react";

import { useToasts } from "@/lib/toast";

const ICONE = {
  success: <Check size={16} className="text-emerald-500" />,
  info: <Info size={16} className="text-accent" />,
  error: <Warning size={16} className="text-rose-600 dark:text-rose-400" />,
};

/** Renderizado uma vez no layout; empilha as notificações no canto. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in flex items-center gap-2.5 rounded-[12px] border border-borda bg-white px-4 py-3 text-[13px] font-semibold text-marinho shadow-[var(--sombra-popup)]"
        >
          {ICONE[t.tipo]}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
