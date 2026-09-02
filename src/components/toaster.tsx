import { AlertTriangle, Check, Info } from "lucide-react";

import { useToasts } from "@/lib/toast";

const ICONE = {
  success: <Check size={16} className="text-emerald-500" />,
  info: <Info size={16} className="text-gold" />,
  error: <AlertTriangle size={16} className="text-rose-500" />,
};

/** Renderizado uma vez no layout; empilha as notificações no canto. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-in flex items-center gap-2.5 rounded-xl border border-line/70 bg-surface px-4 py-3 text-sm text-ink shadow-lg shadow-black/20"
        >
          {ICONE[t.tipo]}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
