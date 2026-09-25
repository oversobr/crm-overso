import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Vazio } from "@/components/ui";
import {
  atualizarCampanha,
  campaignsQuery,
  criarCampanha,
  excluirCampanha,
  type CampanhaInput,
} from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Campaign } from "@/lib/types";

const periodoLabel = (c: Campaign) => {
  const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);
  const i = fmt(c.inicio);
  const f = fmt(c.fim);
  if (i && f) return `${i} — ${f}`;
  if (i) return `a partir de ${i}`;
  if (f) return `até ${f}`;
  return "sem período";
};

/**
 * Campanhas de UM cliente — mora na ficha dele (tela Clientes). Antes ficava
 * em Configuração e seguia o cliente escolhido no menu, o que parecia uma
 * lista geral. Criar, editar e remover acontecem aqui mesmo, sem abrir outra
 * janela por cima da ficha.
 */
export function CampanhasCliente({ projectId, nome }: { projectId: string; nome: string }) {
  const qc = useQueryClient();
  const { data: campanhas = [], isLoading } = useQuery(campaignsQuery(projectId));

  // null = lista; "nova" = criando; Campaign = editando.
  const [editando, setEditando] = useState<Campaign | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async (dados: CampanhaInput) => {
      if (editando && editando !== "nova") await atualizarCampanha(editando.id, dados);
      else await criarCampanha(projectId, dados);
    },
    onSuccess: async () => {
      setEditando(null);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast("Campanha salva.");
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => excluirCampanha(id),
    onSuccess: async () => {
      setExcluindo(null);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast("Campanha removida.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  if (editando != null) {
    return (
      <div className="rounded-xl border border-line/70 p-4">
        <p className="mb-3 text-sm font-semibold text-ink">
          {editando === "nova" ? `Nova campanha de ${nome}` : "Editar campanha"}
        </p>
        <FormCampanha
          inicial={editando === "nova" ? null : editando}
          salvando={salvar.isPending}
          erro={salvar.isError ? (salvar.error as Error).message : null}
          onSalvar={(dados) => salvar.mutate(dados)}
          onCancelar={() => {
            salvar.reset();
            setEditando(null);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Definem o período e a meta que aparecem no Dashboard e no Funil.</p>
        <button
          onClick={() => setEditando("nova")}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gold-dim"
        >
          <Plus size={13} /> Nova campanha
        </button>
      </div>

      {isLoading && <Vazio>Carregando…</Vazio>}
      {!isLoading && campanhas.length === 0 && <Vazio>Nenhuma campanha. Crie uma para acompanhar meta e período.</Vazio>}

      <div className="space-y-2">
        {campanhas.map((c) =>
          excluindo === c.id ? (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/5 p-3"
            >
              <p className="min-w-0 flex-1 text-sm text-ink">
                Remover <span className="font-semibold">{c.nome}</span>?{" "}
                <span className="text-xs text-muted">Os leads continuam, só deixam de ficar ligados a ela.</span>
              </p>
              <button
                onClick={() => remover.mutate(c.id)}
                disabled={remover.isPending}
                className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {remover.isPending ? "Removendo…" : "Remover"}
              </button>
              <button onClick={() => setExcluindo(null)} className="px-2 text-xs text-muted hover:text-ink">
                Cancelar
              </button>
            </div>
          ) : (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-line/70 bg-surface-2/40 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.nome}</p>
                <p className="truncate text-xs text-muted">
                  {periodoLabel(c)}
                  {c.meta_leads != null && ` · meta ${c.meta_leads} leads`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setEditando(c)}
                  title="Editar"
                  className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setExcluindo(c.id)}
                  title="Remover"
                  className="rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function FormCampanha({
  inicial,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  inicial: Campaign | null;
  salvando: boolean;
  erro: string | null;
  onSalvar: (dados: CampanhaInput) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [inicio, setInicio] = useState(inicial?.inicio ?? "");
  const [fim, setFim] = useState(inicial?.fim ?? "");
  const [meta, setMeta] = useState(inicial?.meta_leads != null ? String(inicial.meta_leads) : "");

  function submeter() {
    if (!nome.trim()) return;
    const m = parseInt(meta, 10);
    onSalvar({
      nome: nome.trim(),
      inicio: inicio || null,
      fim: fim || null,
      meta_leads: Number.isFinite(m) ? m : null,
    });
  }

  const rotulo = "mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted";
  const campo =
    "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/50 dark:[color-scheme:dark]";

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submeter();
      }}
    >
      <div>
        <label className={rotulo}>Nome</label>
        <input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Campanha Outubro"
          className={campo}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo}>Início</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Fim</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
        </div>
      </div>
      <div>
        <label className={rotulo}>Meta de leads (opcional)</label>
        <input
          type="number"
          min={0}
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          placeholder="Ex.: 500"
          className={campo}
        />
      </div>

      {erro && <p className="text-xs text-rose-500">{erro}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-full border border-line/70 px-4 py-2 text-sm text-ink transition hover:border-gold/50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!nome.trim() || salvando}
          className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
        >
          {salvando ? "Salvando…" : "Salvar campanha"}
        </button>
      </div>
    </form>
  );
}
