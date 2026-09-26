import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Modal } from "@/components/modal";
import { deYmd, fmt, ymd } from "@/lib/datas";
import { atualizarEvento, criarEvento, excluirEvento } from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Evento, EventoEntrada, StatusEvento } from "@/lib/types";
import { STATUS_EVENTO_LABEL } from "@/lib/types";

/* Peças dos eventos usadas pela lista (/eventos) e pela página de cada um.
   Ficam fora dos arquivos de rota: rota é dividida em chunks e não deve
   exportar nada além do Route. */

const COR_STATUS_EVENTO: Record<StatusEvento, string> = {
  planejamento: "bg-amber-500/12 text-amber-700 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-500/30",
  confirmado: "bg-sky-500/12 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-500/30",
  realizado: "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-500/30",
  cancelado: "bg-slate-500/12 text-slate-600 ring-slate-500/25 dark:text-slate-300 dark:ring-slate-400/30",
};

export function StatusEventoBadge({ status }: { status: StatusEvento }) {
  return (
    <span
      className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium leading-none ring-1 ring-inset ${COR_STATUS_EVENTO[status]}`}
    >
      {STATUS_EVENTO_LABEL[status]}
    </span>
  );
}

/** Dias inteiros de hoje até o dia (negativo = já passou). */
export function diasAte(dia: string) {
  return Math.round((deYmd(dia).getTime() - deYmd(ymd(new Date())).getTime()) / 86_400_000);
}

/** "Hoje" · "Amanhã" · "Em 12 dias" · "Acontecendo" · "Há 3 dias" */
export function contagem(e: Pick<Evento, "data_inicio" | "data_fim">) {
  const ate = diasAte(e.data_inicio);
  const fim = e.data_fim ? diasAte(e.data_fim) : ate;
  if (ate > 1) return `Em ${ate} dias`;
  if (ate === 1) return "Amanhã";
  if (ate === 0) return "Hoje";
  if (fim >= 0) return "Acontecendo";
  const passou = -fim;
  return passou === 1 ? "Ontem" : `Há ${passou} dias`;
}

/** "12 de out. de 2026" ou "12 – 14 de out. de 2026" */
export function periodoEvento(e: Pick<Evento, "data_inicio" | "data_fim">) {
  const opcoes = { day: "numeric", month: "short", year: "numeric" } as const;
  if (!e.data_fim || e.data_fim === e.data_inicio) return fmt(e.data_inicio, opcoes);
  if (e.data_inicio.slice(0, 7) === e.data_fim.slice(0, 7)) {
    return `${deYmd(e.data_inicio).getDate()} – ${fmt(e.data_fim, opcoes)}`;
  }
  return `${fmt(e.data_inicio, { day: "numeric", month: "short" })} – ${fmt(e.data_fim, opcoes)}`;
}

const campo =
  "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent/70 dark:[color-scheme:dark]";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{rotulo}</span>
      {children}
    </label>
  );
}

/**
 * Criar / editar evento. `evento` ausente = novo. Excluir fica aqui dentro,
 * com confirmação, porque apaga junto demandas e materiais.
 */
export function FormEvento({
  projectId,
  evento,
  onFechar,
  onCriado,
  onExcluido,
}: {
  projectId: string;
  evento?: Evento;
  onFechar: () => void;
  onCriado?: (e: Evento) => void;
  onExcluido?: () => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState<EventoEntrada>(() => ({
    nome: evento?.nome ?? "",
    data_inicio: evento?.data_inicio ?? ymd(new Date()),
    data_fim: evento?.data_fim ?? null,
    local: evento?.local ?? null,
    descricao: evento?.descricao ?? null,
    status: evento?.status ?? "planejamento",
  }));
  const [confirmando, setConfirmando] = useState(false);
  const set = <K extends keyof EventoEntrada>(k: K, v: EventoEntrada[K]) => setF((a) => ({ ...a, [k]: v }));

  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ["eventos"] });
    if (evento) await qc.invalidateQueries({ queryKey: ["evento", evento.id] });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const limpo = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const dados: EventoEntrada = {
        ...f,
        nome: f.nome.trim(),
        data_fim: f.data_fim && f.data_fim >= f.data_inicio ? f.data_fim : null,
        local: limpo(f.local),
        descricao: limpo(f.descricao),
      };
      if (evento) {
        await atualizarEvento(evento.id, dados);
        return null;
      }
      return criarEvento(projectId, dados);
    },
    onSuccess: async (novo) => {
      await recarregar();
      toast(evento ? "Evento atualizado." : "Evento criado.");
      onFechar();
      if (novo) onCriado?.(novo);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const excluir = useMutation({
    mutationFn: () => excluirEvento(evento!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["eventos"] });
      await qc.invalidateQueries({ queryKey: ["demandas-resumo"] });
      toast("Evento excluído.");
      onFechar();
      onExcluido?.();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const valido = f.nome.trim() && f.data_inicio;

  return (
    <Modal aberto onFechar={onFechar} titulo={evento ? "Editar evento" : "Novo evento"} maxW="max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) salvar.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Campo rotulo="Nome do evento">
          <input
            autoFocus
            value={f.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Ex.: Workshop Instagram de Sucesso — São Paulo"
            className={campo}
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data de início">
            <input
              type="date"
              required
              value={f.data_inicio}
              onChange={(e) => set("data_inicio", e.target.value)}
              className={campo}
            />
          </Campo>
          <Campo rotulo="Data de fim (opcional)">
            <input
              type="date"
              value={f.data_fim ?? ""}
              min={f.data_inicio}
              onChange={(e) => set("data_fim", e.target.value || null)}
              className={campo}
            />
          </Campo>
        </div>

        <Campo rotulo="Local">
          <input
            value={f.local ?? ""}
            onChange={(e) => set("local", e.target.value)}
            placeholder="Ex.: Hotel Unique — Av. Brigadeiro Luís Antônio, 4700"
            className={campo}
          />
        </Campo>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_EVENTO_LABEL) as StatusEvento[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                aria-pressed={f.status === s}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  f.status === s
                    ? `font-medium ring-0 ${COR_STATUS_EVENTO[s]} border-transparent`
                    : "border-line/70 text-muted hover:border-gold/40 hover:text-ink"
                }`}
              >
                {STATUS_EVENTO_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <Campo rotulo="Briefing">
          <textarea
            rows={5}
            value={f.descricao ?? ""}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Objetivo do evento, público, formato, programação, contatos importantes…"
            className={`${campo} resize-y`}
          />
        </Campo>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-4">
          {evento &&
            (confirmando ? (
              <>
                <span className="text-sm text-muted">Apaga demandas e materiais juntos.</span>
                <button
                  type="button"
                  onClick={() => excluir.mutate()}
                  disabled={excluir.isPending}
                  className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {excluir.isPending ? "Excluindo…" : "Excluir evento"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="px-2 py-1.5 text-sm text-muted hover:text-ink"
                >
                  Não
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-sm text-rose-600 dark:text-rose-400 transition hover:bg-rose-500/10"
              >
                <Trash2 size={14} /> Excluir
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-full border border-line/70 px-4 py-2 text-sm text-ink transition hover:border-gold/50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valido || salvar.isPending}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
            >
              {salvar.isPending ? "Salvando…" : evento ? "Salvar" : "Criar evento"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
