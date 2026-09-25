import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Moon, Sun, Trash2 } from "lucide-react";
import { useState } from "react";

import { Dropdown } from "@/components/dropdown";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { trocarTema, useTema } from "@/lib/theme";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authed/configuracao")({ component: Configuracao });

function Configuracao() {
  return (
    <>
      <Cabecalho titulo="Configuração" />
      <Aparencia />
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
