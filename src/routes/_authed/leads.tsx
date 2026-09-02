import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, MessageCircle, Search, X } from "lucide-react";
import { useState } from "react";

import { Select, StatusBadge, Vazio } from "@/components/ui";
import { atualizarStatus, leadsQuery, POR_PAGINA } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Lead, Status } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

import { Cabecalho, usePainel } from "@/components/painel";

export const Route = createFileRoute("/_authed/leads")({ component: Leads });

/** Campos que já têm coluna própria não precisam repetir em "Respostas". */
const JA_EXIBIDOS = new Set([
  "nome",
  "name",
  "email",
  "e-mail",
  "whatsapp",
  "telefone",
  "phone",
  "celular",
]);

const extras = (l: Lead) =>
  Object.entries(l.respostas).filter(([k]) => !JA_EXIBIDOS.has(k.toLowerCase()));

function Leads() {
  const { projeto, campanha } = usePainel();
  const qc = useQueryClient();

  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<Lead | null>(null);

  const { data, isLoading } = useQuery(
    leadsQuery({
      projectId: projeto?.id,
      campaignId: campanha?.id ?? null,
      busca,
      status,
      tipo,
      pagina,
    }),
  );

  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const mudarStatus = useMutation({
    mutationFn: ({ id, novo }: { id: string; novo: Status }) => atualizarStatus(id, novo),
    onSuccess: (_, { id, novo }) => {
      setAberto((a) => (a && a.id === id ? { ...a, status: novo } : a));
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  /** Exporta o resultado do filtro inteiro, não só a página na tela. */
  async function exportar() {
    if (!projeto) return;

    let q = getSupabaseBrowserClient().from("leads").select("*").eq("project_id", projeto.id);
    if (campanha) q = q.eq("campaign_id", campanha.id);
    const { data } = await q.order("criado_em", { ascending: false });
    const todos = (data ?? []) as Lead[];
    if (!todos.length) return;

    // Cada LP tem perguntas diferentes, então as colunas do CSV são
    // descobertas a partir dos dados em vez de fixadas no código.
    const chaves = [...new Set(todos.flatMap((l) => Object.keys(l.respostas ?? {})))];
    const cabecalho = [
      "nome",
      "email",
      "whatsapp",
      "status",
      "completo",
      "criado_em",
      "utm_source",
      "utm_campaign",
      ...chaves,
    ];

    const escapar = (v: unknown) => JSON.stringify(String(v ?? ""));
    const corpo = todos.map((l) =>
      [
        l.nome,
        l.email,
        l.whatsapp,
        l.status,
        l.completo ? "sim" : "nao",
        l.criado_em,
        l.utms?.utm_source,
        l.utms?.utm_campaign,
        ...chaves.map((k) => {
          const v = l.respostas?.[k];
          return Array.isArray(v) ? v.join(" | ") : v;
        }),
      ]
        .map(escapar)
        .join(","),
    );

    // BOM na frente: sem ele o Excel abre os acentos quebrados.
    const csv = "﻿" + [cabecalho.join(","), ...corpo].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${projeto.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Cabecalho titulo="Leads" />

      <div className="mb-3 flex flex-wrap gap-3">
        <div className="relative min-w-72 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar por nome, email ou WhatsApp…"
            className="w-full rounded-lg border border-line/60 bg-surface/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gold/50"
          />
        </div>

        <Select
          valor={tipo}
          onChange={(v) => {
            setTipo(v);
            setPagina(0);
          }}
        >
          <option value="">Tipo: Todos</option>
          <option value="completo">Completos</option>
          <option value="parcial">Parciais</option>
        </Select>

        <Select
          valor={status}
          onChange={(v) => {
            setStatus(v);
            setPagina(0);
          }}
        >
          <option value="">Status: Todos</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>

        <button
          onClick={exportar}
          className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface/70 px-3 py-2 text-sm transition hover:border-gold/40"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line/60 bg-surface/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line/50 bg-base/40 text-left text-[11px] uppercase tracking-wider text-muted">
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">WhatsApp</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 font-medium">Origem</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ações</th>
              <th className="px-4 py-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.id}
                onClick={() => setAberto(l)}
                className="cursor-pointer border-b border-line/25 transition last:border-0 hover:bg-surface-2/60"
              >
                <td className="px-4 py-3">
                  <span className={l.completo ? "" : "italic text-muted"}>
                    {l.nome ?? (l.completo ? "(sem nome)" : "Lead parcial")}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{l.whatsapp ?? "—"}</td>
                <td className="max-w-64 truncate px-4 py-3 text-muted">
                  {String(extras(l)[0]?.[1] ?? "—")}
                </td>
                <td className="px-4 py-3 text-muted">{l.utms.utm_source ?? "direto"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={l.status} />
                </td>
                <td className="px-4 py-3">
                  {l.whatsapp && (
                    <a
                      href={`https://wa.me/${l.whatsapp}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex rounded-md p-1.5 text-emerald-400 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/10"
                    >
                      <MessageCircle size={14} />
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(l.criado_em).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <Vazio>Carregando…</Vazio>}
        {!isLoading && linhas.length === 0 && <Vazio>Nenhum lead encontrado.</Vazio>}

        <div className="flex items-center justify-between border-t border-line/40 px-4 py-3 text-sm text-muted">
          <span>{total} lead(s) encontrado(s)</span>
          <div className="flex items-center gap-2">
            <button
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
              className="rounded-md border border-line/60 p-1.5 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <button
              disabled={pagina + 1 >= paginas}
              onClick={() => setPagina((p) => p + 1)}
              className="rounded-md border border-line/60 p-1.5 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {aberto && (
        <aside className="fixed inset-y-0 right-0 z-50 w-[420px] overflow-y-auto border-l border-line/60 bg-surface p-6 shadow-2xl">
          <header className="flex items-center justify-between">
            <h2 className="display text-lg font-bold text-gold">Detalhes do Lead</h2>
            <button onClick={() => setAberto(null)} className="text-muted hover:text-ink">
              <X size={18} />
            </button>
          </header>

          <Campo rotulo="Nome" valor={aberto.nome ?? (aberto.completo ? "(sem nome)" : "Lead parcial")} />
          <Campo rotulo="Email" valor={aberto.email ?? "—"} />
          <Campo rotulo="WhatsApp" valor={aberto.whatsapp ?? "—"} />
          <Campo rotulo="Data" valor={new Date(aberto.criado_em).toLocaleString("pt-BR")} />
          <Campo rotulo="Origem" valor={aberto.origem ?? "—"} />

          <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted">Status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => mudarStatus.mutate({ id: aberto.id, novo: s })}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${
                  aberto.status === s
                    ? "bg-gold font-semibold text-base"
                    : "border border-line/60 text-muted hover:text-ink"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {Object.keys(aberto.utms).length > 0 && (
            <>
              <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted">
                UTMs
              </p>
              <div className="mt-2 space-y-1 text-xs">
                {Object.entries(aberto.utms).map(([k, v]) => (
                  <p key={k} className="text-muted">
                    <span className="text-ink">{k.replace("utm_", "")}:</span> {v}
                  </p>
                ))}
              </div>
            </>
          )}

          {extras(aberto).length > 0 && (
            <>
              <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted">
                Respostas
              </p>
              <div className="mt-2 space-y-2">
                {extras(aberto).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-line/50 bg-surface-2/60 p-3">
                    <p className="text-[11px] text-muted">{k}</p>
                    <p className="mt-0.5 text-sm text-ink">
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      )}
    </>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="mt-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{rotulo}</p>
      <p className="mt-0.5 break-words text-sm text-ink">{valor}</p>
    </div>
  );
}
