import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Moon, Pencil, Plus, Sun, Trash2 } from "lucide-react";
import { useState } from "react";

import { Dropdown } from "@/components/dropdown";
import { Modal } from "@/components/modal";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  atualizarCampanha,
  campaignsQuery,
  criarCampanha,
  excluirCampanha,
  type CampanhaInput,
} from "@/lib/queries";
import { trocarTema, useTema } from "@/lib/theme";
import { toast } from "@/lib/toast";
import type { Campaign } from "@/lib/types";

export const Route = createFileRoute("/_authed/configuracao")({ component: Configuracao });

function Configuracao() {
  return (
    <>
      <Cabecalho titulo="Configuração" />
      <Aparencia />
      <div className="mt-4">
        <Campanhas />
      </div>
      <div className="mt-4">
        <Equipe />
      </div>
      <div className="mt-4">
        <AcessoGlobal />
      </div>
    </>
  );
}

type Global = { user_id: string; email: string };

function AcessoGlobal() {
  const qc = useQueryClient();
  const sb = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");

  const { data: souSuper } = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("is_super_admin");
      if (error) throw error;
      return Boolean(data);
    },
  });

  const { data: globais = [] } = useQuery({
    queryKey: ["globais"],
    enabled: Boolean(souSuper),
    queryFn: async (): Promise<Global[]> => {
      const { data, error } = await sb.rpc("listar_globais");
      if (error) throw error;
      return (data ?? []) as Global[];
    },
  });

  const definir = useMutation({
    mutationFn: async (v: { email: string; ativar: boolean }) => {
      const { error } = await sb.rpc("definir_global", { p_email: v.email, p_ativar: v.ativar });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_d, v) => {
      if (v.ativar) setEmail("");
      await qc.invalidateQueries({ queryKey: ["globais"] });
      toast(v.ativar ? "Acesso global concedido." : "Acesso global removido.", "success");
    },
  });

  // Só o super-admin vê e usa isto.
  if (!souSuper) return null;

  return (
    <Card titulo="Acesso Global">
      <p className="mb-3 text-sm text-muted">
        Quem tem acesso global <span className="text-ink">vê todos os clientes</span> e pode
        gerenciá-los, sem precisar ser liberado projeto por projeto. Use só para a equipe OVERSO —
        nunca para um cliente.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@daequipe.com"
          className="min-w-56 flex-1 rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
        />
        <button
          onClick={() => email.trim() && definir.mutate({ email: email.trim(), ativar: true })}
          disabled={!email.trim() || definir.isPending}
          className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
        >
          Tornar global
        </button>
      </div>
      {definir.isError && (
        <p className="mt-2 text-xs text-rose-500">{(definir.error as Error).message}</p>
      )}

      <div className="mt-4 space-y-2">
        {globais.map((g) => (
          <div
            key={g.user_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface-2/40 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{g.email}</p>
              <p className="text-xs text-gold">Vê todos os clientes</p>
            </div>
            <button
              onClick={() => definir.mutate({ email: g.email, ativar: false })}
              disabled={definir.isPending}
              title="Remover acesso global"
              className="rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

type Membro = { user_id: string; email: string; papel: string };

function Equipe() {
  const { projeto } = usePainel();
  const qc = useQueryClient();
  const sb = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("membro");

  // Só quem pode gerenciar (super-admin ou admin do projeto) vê este bloco.
  const { data: pode } = useQuery({
    queryKey: ["pode-gerenciar", projeto?.id],
    enabled: Boolean(projeto),
    queryFn: async () => {
      const { data, error } = await sb.rpc("pode_gerenciar", { p_project: projeto!.id });
      if (error) throw error;
      return Boolean(data);
    },
  });

  const { data: membros = [] } = useQuery({
    queryKey: ["equipe", projeto?.id],
    enabled: Boolean(projeto && pode),
    queryFn: async (): Promise<Membro[]> => {
      const { data, error } = await sb.rpc("equipe_membros", { p_project: projeto!.id });
      if (error) throw error;
      return (data ?? []) as Membro[];
    },
  });

  const conceder = useMutation({
    mutationFn: async (v: { email: string; papel: string }) => {
      const { error } = await sb.rpc("equipe_conceder", {
        p_email: v.email,
        p_project: projeto!.id,
        p_papel: v.papel,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["equipe", projeto?.id] });
      toast("Acesso concedido.", "success");
    },
  });

  const revogar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await sb.rpc("equipe_revogar", { p_user: userId, p_project: projeto!.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["equipe", projeto?.id] });
      toast("Acesso removido.", "success");
    },
  });

  if (!pode) return null;

  return (
    <Card titulo="Equipe & Acesso">
      <p className="mb-3 text-sm text-muted">
        Quem pode ver <span className="text-ink">{projeto?.nome}</span>. Crie a conta no Supabase
        primeiro; aqui você concede o acesso por email.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@dapessoa.com"
          className="min-w-56 flex-1 rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
        />
        <Dropdown
          value={papel}
          onChange={setPapel}
          options={[
            { value: "membro", label: "Membro" },
            { value: "admin", label: "Admin" },
          ]}
          triggerClassName="rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink hover:border-gold/40"
        />
        <button
          onClick={() => email.trim() && conceder.mutate({ email: email.trim(), papel })}
          disabled={!email.trim() || conceder.isPending}
          className="rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
        >
          {conceder.isPending ? "Concedendo…" : "Dar acesso"}
        </button>
      </div>
      {conceder.isError && (
        <p className="mt-2 text-xs text-rose-500">{(conceder.error as Error).message}</p>
      )}

      <div className="mt-4 space-y-2">
        {membros.length === 0 && <Vazio>Ninguém com acesso ainda.</Vazio>}
        {membros.map((m) => (
          <div
            key={m.user_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface-2/40 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{m.email}</p>
              <p className="text-xs text-muted">{m.papel === "admin" ? "Admin" : "Membro"}</p>
            </div>
            <button
              onClick={() => revogar.mutate(m.user_id)}
              disabled={revogar.isPending}
              title="Remover acesso"
              className="rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Aparencia() {
  const tema = useTema();
  return (
    <Card titulo="Aparência">
      <p className="mb-3 text-sm text-muted">Escolha o tema do painel.</p>
      <div className="flex gap-3">
        {(
          [
            { id: "light" as const, rotulo: "Claro", Icone: Sun },
            { id: "dark" as const, rotulo: "Escuro", Icone: Moon },
          ]
        ).map(({ id, rotulo, Icone }) => (
          <button
            key={id}
            onClick={() => trocarTema(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-4 text-sm transition ${
              tema === id
                ? "border-gold/50 bg-gold/10 font-semibold text-gold"
                : "border-line/70 text-muted hover:text-ink"
            }`}
          >
            <Icone size={18} strokeWidth={1.75} />
            {rotulo}
          </button>
        ))}
      </div>
    </Card>
  );
}

const periodoLabel = (c: Campaign) => {
  const fmt = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null;
  const i = fmt(c.inicio);
  const f = fmt(c.fim);
  if (i && f) return `${i} — ${f}`;
  if (i) return `a partir de ${i}`;
  if (f) return `até ${f}`;
  return "sem período";
};

function Campanhas() {
  const { projeto } = usePainel();
  const qc = useQueryClient();
  const { data: campanhas = [], isLoading } = useQuery(campaignsQuery(projeto?.id));

  // null = fechado; "nova" = criar; Campaign = editar.
  const [editando, setEditando] = useState<Campaign | "nova" | null>(null);
  const [excluindo, setExcluindo] = useState<Campaign | null>(null);

  const salvar = useMutation({
    mutationFn: async (dados: CampanhaInput) => {
      if (!projeto) throw new Error("Selecione uma página primeiro.");
      if (editando && editando !== "nova") await atualizarCampanha(editando.id, dados);
      else await criarCampanha(projeto.id, dados);
    },
    onSuccess: async () => {
      setEditando(null);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast("Campanha salva.", "success");
    },
  });

  const remover = useMutation({
    mutationFn: (id: string) => excluirCampanha(id),
    onSuccess: async () => {
      setExcluindo(null);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast("Campanha removida.", "success");
    },
  });

  return (
    <>
      <Card
        titulo="Campanhas"
        acao={
          <button
            onClick={() => setEditando("nova")}
            disabled={!projeto}
            className="flex items-center gap-2 rounded-xl bg-gold px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
          >
            <Plus size={14} /> Nova campanha
          </button>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Campanhas de <span className="text-ink">{projeto?.nome ?? "—"}</span>. Definem o período e
          a meta que aparecem no Dashboard e no Funil.
        </p>

        {isLoading && <Vazio>Carregando…</Vazio>}
        {!isLoading && campanhas.length === 0 && (
          <Vazio>Nenhuma campanha. Crie uma para acompanhar meta e período.</Vazio>
        )}

        <div className="space-y-2">
          {campanhas.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-line/70 bg-surface-2/40 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.nome}</p>
                <p className="truncate text-xs text-muted">
                  {periodoLabel(c)}
                  {c.meta_leads != null && ` · meta ${c.meta_leads}`}
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
                  onClick={() => setExcluindo(c)}
                  title="Remover"
                  className="rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Criar / editar */}
      <Modal
        aberto={editando != null}
        onFechar={() => setEditando(null)}
        titulo={editando && editando !== "nova" ? "Editar campanha" : "Nova campanha"}
      >
        {editando != null && (
          <FormCampanha
            inicial={editando === "nova" ? null : editando}
            salvando={salvar.isPending}
            erro={salvar.isError ? (salvar.error as Error).message : null}
            onSalvar={(dados) => salvar.mutate(dados)}
            onCancelar={() => setEditando(null)}
          />
        )}
      </Modal>

      {/* Remover */}
      <Modal aberto={excluindo != null} onFechar={() => setExcluindo(null)} titulo="Remover campanha">
        {excluindo && (
          <>
            <p className="text-sm text-ink">
              Remover <span className="font-semibold">{excluindo.nome}</span>?
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Os leads não são apagados — apenas deixam de ficar ligados a esta campanha.
            </p>
            {remover.isError && (
              <p className="mt-2 text-xs text-rose-500">{(remover.error as Error).message}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => remover.mutate(excluindo.id)}
                disabled={remover.isPending}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {remover.isPending ? "Removendo…" : "Sim, remover"}
              </button>
              <button
                onClick={() => setExcluindo(null)}
                className="flex-1 rounded-xl border border-line/70 py-2.5 text-sm text-muted transition hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
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
    "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50";

  return (
    <div className="space-y-3">
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
      <div className="grid grid-cols-2 gap-3">
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

      <div className="flex gap-2 pt-2">
        <button
          onClick={submeter}
          disabled={!nome.trim() || salvando}
          className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
        >
          {salvando ? "Salvando…" : "Salvar campanha"}
        </button>
        <button
          onClick={onCancelar}
          className="flex-1 rounded-xl border border-line/70 py-2.5 text-sm text-muted transition hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
