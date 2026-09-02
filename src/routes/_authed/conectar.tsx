import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Plus } from "lucide-react";
import { useState } from "react";

import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { projectsQuery } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line/60 px-2.5 py-1.5 text-xs text-ink transition hover:border-gold/40"
    >
      {copiado ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}

function Conectar() {
  const { projeto, setProjetoId } = usePainel();
  const qc = useQueryClient();

  const { data: projetos = [], isLoading } = useQuery(projectsQuery());
  const [nome, setNome] = useState("");

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
      // Já seleciona a página criada: o script do passo 3 passa a ser o dela.
      setProjetoId(novo.id);
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

  const scriptPronto =
    scriptBruto && projeto
      ? scriptBruto.replace(
          /var CFG = \{[\s\S]*?\};/,
          `var CFG = {\n    url: "${supabaseUrl()}",\n    anonKey: "${supabaseAnonKey()}",\n    key: "${projeto.ingest_key}",\n  };`,
        )
      : null;

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
            className="flex-1 rounded-lg border border-line/60 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
          />
          <button
            onClick={() => criar.mutate(nome.trim())}
            disabled={!nome.trim() || criar.isPending}
            className="flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-base transition hover:bg-gold-dim disabled:opacity-40"
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
            <button
              key={p.id}
              onClick={() => setProjetoId(p.id)}
              className={`flex w-full items-center justify-between gap-4 rounded-lg border p-3 text-left transition ${
                p.id === projeto?.id
                  ? "border-gold/40 bg-gold/5"
                  : "border-line/50 bg-surface-2/40 hover:border-line"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {p.nome}
                  {p.id === projeto?.id && (
                    <span className="ml-2 text-xs font-normal text-gold">selecionada</span>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-muted">{p.ingest_key}</p>
              </div>
              <span onClick={(e) => e.stopPropagation()}>
                <Copiar texto={p.ingest_key} rotulo="Copiar chave" />
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* ── 3 ── */}
      <Card titulo="3. Copiar o script" className="mt-4">
        {!projeto ? (
          <Vazio>Escolha uma página acima para gerar o script dela.</Vazio>
        ) : !scriptPronto ? (
          <Vazio>Montando o script…</Vazio>
        ) : (
          <>
            <p className="text-sm text-muted">
              Script completo e já configurado para{" "}
              <span className="text-ink">{projeto.nome}</span>. Copie tudo — não só o começo.
            </p>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2">
              <p className="text-xs text-muted">{scriptPronto.split("\n").length} linhas</p>
              <Copiar texto={scriptPronto} rotulo="Copiar script completo" />
            </div>

            <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-line/50 bg-base/60 p-3 text-[11px] leading-relaxed text-muted">
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
    </>
  );
}
