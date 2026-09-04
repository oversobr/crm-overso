import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { Modal } from "@/components/modal";
import { contarLeadsQuery, podeConectarQuery, projetosGerenciaveisQuery } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { ProjetoGerenciavel } from "@/lib/types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export const Route = createFileRoute("/_authed/conectar")({ component: Conectar });

function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line/70 px-2.5 py-1.5 text-xs text-ink transition hover:border-gold/50"
    >
      {copiado ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}

function Conectar() {
  const { projeto, setProjetoId } = usePainel();
  const qc = useQueryClient();

  const { data: podeConectar } = useQuery(podeConectarQuery());
  // Só as páginas que o usuário administra — e é esta consulta que traz a
  // chave de captura, fechada no select comum pelo 16_conectar_admin.sql.
  const { data: projetos = [], isLoading } = useQuery(projetosGerenciaveisQuery());
  const [nome, setNome] = useState("");
  // Projeto com o modal de exclusão aberto, e o texto digitado pra confirmar.
  const [aExcluir, setAExcluir] = useState<ProjetoGerenciavel | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  // Projeto sendo editado e o novo nome.
  const [aEditar, setAEditar] = useState<ProjetoGerenciavel | null>(null);
  const [nomeEdit, setNomeEdit] = useState("");
  const { data: qtdLeads } = useQuery(contarLeadsQuery(aExcluir?.id));

  const nomeConfere = aExcluir != null && confirmacao.trim() === aExcluir.nome.trim();

  const criar = useMutation({
    mutationFn: async (nomePagina: string) => {
      const { data, error } = await getSupabaseBrowserClient().rpc("criar_projeto", {
        p_nome: nomePagina,
      });
      if (error) throw new Error(error.message);
      return data as { id: string; nome: string; slug: string; ingest_key: string };
    },
    onSuccess: async (novo) => {
      setNome("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
      // Já seleciona a página criada: o script do passo 3 passa a ser o dela.
      setProjetoId(novo.id);
    },
  });

  const editar = useMutation({
    mutationFn: async (v: { id: string; nome: string }) => {
      // Admin/super-admin edita direto (RLS projects_update autoriza).
      const { error } = await getSupabaseBrowserClient()
        .from("projects")
        .update({ nome: v.nome })
        .eq("id", v.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setAEditar(null);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
      toast("Cliente atualizado.", "success");
    },
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseBrowserClient().rpc("remover_projeto", { p_project: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_data, _id) => {
      const nomeRemovido = aExcluir?.nome;
      setAExcluir(null);
      setConfirmacao("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["funil"] });
      if (nomeRemovido) toast(`Cliente "${nomeRemovido}" removido.`, "success");
    },
  });

  // O script vem de public/ — uma cópia só, sem risco de divergir do disco.
  const { data: scriptBruto } = useQuery({
    queryKey: ["script-wp"],
    queryFn: async () => {
      const r = await fetch("/overso-lead-wp.js");
      if (!r.ok) throw new Error("não consegui ler o script");
      return r.text();
    },
    staleTime: Infinity,
  });

  const chave = projetos.find((p) => p.id === projeto?.id)?.ingest_key;

  const scriptPronto =
    scriptBruto && projeto && chave
      ? scriptBruto.replace(
          /var CFG = \{[\s\S]*?\};/,
          `var CFG = {\n    url: "${supabaseUrl()}",\n    anonKey: "${supabaseAnonKey()}",\n    key: "${chave}",\n  };`,
        )
      : null;

  // A aba some do menu para quem não é admin, mas a URL é digitável — e
  // sem isto a tela apareceria vazia e cheia de erro em vez de explicada.
  // Quem insistir na API esbarra no banco do mesmo jeito.
  if (podeConectar === false) {
    return (
      <>
        <Cabecalho titulo="Conectar página" />
        <Card>
          <Vazio>
            Esta área é só de quem administra as páginas. Fale com o responsável pelo painel
            para cadastrar, editar ou remover um cliente.
          </Vazio>
        </Card>
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo="Conectar página" />

      {/* ── 1 ── */}
      <Card titulo="1. Adicionar uma página">
        <p className="text-sm text-muted">
          Uma página por cliente. Cada uma ganha uma chave própria, e é a chave que separa os leads
          de um cliente dos do outro.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nome.trim()) criar.mutate(nome.trim());
            }}
            placeholder="Ex.: Clínica Delmo — Captação Setembro"
            className="flex-1 rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
          />
          <button
            onClick={() => criar.mutate(nome.trim())}
            disabled={!nome.trim() || criar.isPending}
            className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
          >
            <Plus size={15} />
            {criar.isPending ? "Criando…" : "Criar página"}
          </button>
        </div>

        {criar.isError && (
          <p className="mt-3 text-sm text-rose-400">{(criar.error as Error).message}</p>
        )}

        {criar.isSuccess && (
          <p className="mt-3 text-sm text-emerald-400">
            <span className="font-semibold">{criar.data.nome}</span> criada e já selecionada. O
            script do passo 3 abaixo é o dela.
          </p>
        )}
      </Card>

      {/* ── 2 ── */}
      <Card titulo="2. Suas páginas" className="mt-4">
        {isLoading && <Vazio>Carregando…</Vazio>}
        {!isLoading && projetos.length === 0 && <Vazio>Nenhuma página ainda.</Vazio>}

        <div className="space-y-2">
          {projetos.map((p) => (
            <div
              key={p.id}
              onClick={() => setProjetoId(p.id)}
              className={`cursor-pointer rounded-xl border p-3 transition ${
                p.id === projeto?.id
                  ? "border-gold/50 bg-gold/5"
                  : "border-line/70 bg-surface-2/40 hover:border-line"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {p.nome}
                    {p.id === projeto?.id && (
                      <span className="ml-2 text-xs font-normal text-gold">selecionada</span>
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      Chave de captura
                    </span>
                    <span className="truncate font-mono">{p.ingest_key}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Copiar texto={p.ingest_key} rotulo="Copiar chave" />
                  <button
                    onClick={() => {
                      setAEditar(p);
                      setNomeEdit(p.nome);
                    }}
                    title="Editar cliente"
                    className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setAExcluir(p);
                      setConfirmacao("");
                    }}
                    title="Remover cliente"
                    className="rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 3 ── */}
      <Card titulo="3. Copiar o script" className="mt-4">
        {!projeto ? (
          <Vazio>Escolha uma página acima para gerar o script dela.</Vazio>
        ) : !chave ? (
          // Acontece com quem é admin de uma página e só membro de outra: a
          // página está no menu lateral, mas a chave dela não é dele.
          <Vazio>Você não administra esta página, então a chave dela não aparece aqui.</Vazio>
        ) : !scriptPronto ? (
          <Vazio>Montando o script…</Vazio>
        ) : (
          <>
            <p className="text-sm text-muted">
              Script completo e já configurado para{" "}
              <span className="text-ink">{projeto.nome}</span>. Copie tudo — não só o começo.
            </p>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2">
              <p className="text-xs text-muted">{scriptPronto.split("\n").length} linhas</p>
              <Copiar texto={scriptPronto} rotulo="Copiar script completo" />
            </div>

            <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-line/70 bg-base/60 p-3 text-[11px] leading-relaxed text-muted">
              {scriptPronto}
            </pre>
          </>
        )}

        <div className="mt-4 space-y-1.5 text-xs text-muted">
          <p>
            <span className="text-ink">WPCode</span> (JavaScript Snippet), local{" "}
            <span className="font-mono">Site Wide Footer</span> — cole{" "}
            <span className="text-ink">sem</span> as tags{" "}
            <span className="font-mono">&lt;script&gt;</span>.
          </p>
          <p>
            <span className="text-ink">Elementor Custom Code</span> ou{" "}
            <span className="text-ink">widget HTML</span> — envolva{" "}
            <span className="text-ink">com</span>{" "}
            <span className="font-mono">&lt;script&gt;…&lt;/script&gt;</span>.
          </p>
          <p className="pt-1">
            No Elementor, dê aos campos os IDs{" "}
            <span className="font-mono text-ink">nome</span>,{" "}
            <span className="font-mono text-ink">whatsapp</span> e{" "}
            <span className="font-mono text-ink">email</span> em Avançado → ID.
          </p>
        </div>
      </Card>

      {/* Editar cliente */}
      <Modal aberto={aEditar != null} onFechar={() => setAEditar(null)} titulo="Editar cliente">
        {aEditar && (
          <>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
              Nome do cliente
            </label>
            <input
              autoFocus
              value={nomeEdit}
              onChange={(e) => setNomeEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeEdit.trim())
                  editar.mutate({ id: aEditar.id, nome: nomeEdit.trim() });
              }}
              className="w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            />
            <p className="mt-2 text-xs text-muted">
              A chave de captura não muda — o script no site continua o mesmo.
            </p>
            {editar.isError && (
              <p className="mt-2 text-xs text-rose-500">{(editar.error as Error).message}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => nomeEdit.trim() && editar.mutate({ id: aEditar.id, nome: nomeEdit.trim() })}
                disabled={!nomeEdit.trim() || editar.isPending}
                className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
              >
                {editar.isPending ? "Salvando…" : "Salvar"}
              </button>
              <button
                onClick={() => setAEditar(null)}
                className="flex-1 rounded-xl border border-line/70 py-2.5 text-sm text-muted transition hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Exclusão de cliente: 2ª verificação — digitar o nome exato. */}
      <Modal
        aberto={aExcluir != null}
        onFechar={() => setAExcluir(null)}
        titulo="Remover cliente"
      >
        {aExcluir && (
          <>
            <p className="text-sm text-ink">
              Isto remove <span className="font-semibold">{aExcluir.nome}</span>
              {qtdLeads != null && (
                <>
                  {" "}
                  e apaga{" "}
                  <span className="font-semibold text-rose-500">
                    {qtdLeads} lead{qtdLeads === 1 ? "" : "s"}
                  </span>
                </>
              )}
              . Esta ação <span className="font-semibold">não pode ser desfeita</span>.
            </p>

            <p className="mt-4 text-sm text-muted">
              Para confirmar, digite o nome do cliente:{" "}
              <span className="select-all font-bold text-ink">{aExcluir.nome}</span>
            </p>

            <input
              autoFocus
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeConfere && !remover.isPending) {
                  remover.mutate(aExcluir.id);
                }
              }}
              placeholder="Digite o nome exatamente"
              className="mt-2 w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-rose-500/60"
            />

            {remover.isError && (
              <p className="mt-2 text-xs text-rose-500">{(remover.error as Error).message}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => remover.mutate(aExcluir.id)}
                disabled={!nomeConfere || remover.isPending}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {remover.isPending ? "Removendo…" : "Remover cliente"}
              </button>
              <button
                onClick={() => setAExcluir(null)}
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
