import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { StatusBadge, Vazio } from "@/components/ui";
import { Dropdown } from "@/components/dropdown";
import { IconeWhatsApp } from "@/components/icons";
import { Modal } from "@/components/modal";
import { DadosBlur } from "@/components/dados-blur";
import { atualizarStatus, excluirLead, leadsQuery, POR_PAGINA } from "@/lib/queries";
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
  // Confirmação de exclusão em dois passos, pra não apagar lead sem querer.
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);

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

  const excluir = useMutation({
    mutationFn: (id: string) => excluirLead(id),
    onSuccess: () => {
      setAberto(null);
      setConfirmandoExcluir(false);
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["funil"] });
    },
  });

  // Fecha o drawer zerando o estado de confirmação, senão ele reabre "armado".
  function fecharDrawer() {
    setAberto(null);
    setConfirmandoExcluir(false);
  }

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
      <Cabecalho titulo="Leads" atualizavel />

      <DadosBlur>
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
            className="w-full rounded-xl border border-line/70 bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gold/50"
          />
        </div>

        <Dropdown
          value={tipo}
          onChange={(v) => {
            setTipo(v);
            setPagina(0);
          }}
          options={[
            { value: "", label: "Tipo: Todos" },
            { value: "completo", label: "Completos" },
            { value: "parcial", label: "Parciais" },
          ]}
          triggerClassName="rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink hover:border-gold/40"
        />

        <Dropdown
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPagina(0);
          }}
          options={[
            { value: "", label: "Status: Todos" },
            ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v })),
          ]}
          triggerClassName="rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink hover:border-gold/40"
        />

        <button
          onClick={exportar}
          className="flex items-center gap-2 rounded-full border border-line/70 bg-surface px-3 py-2 text-sm transition hover:border-gold/50"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line/70 bg-base/40 text-left text-[11px] uppercase tracking-wider text-muted">
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
                      <IconeWhatsApp className="h-4 w-4" />
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
              className="rounded-md border border-line/70 p-1.5 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              Página {pagina + 1} de {paginas}
            </span>
            <button
              disabled={pagina + 1 >= paginas}
              onClick={() => setPagina((p) => p + 1)}
              className="rounded-md border border-line/70 p-1.5 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      </DadosBlur>

      <Modal
        aberto={aberto != null}
        onFechar={fecharDrawer}
        titulo="Detalhes do Lead"
        maxW="max-w-2xl"
      >
        {aberto && (
          <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
            {/* CONTATO — quem é e como falar. */}
            <Bloco rotulo="Contato">
              <div className="grid gap-4 sm:grid-cols-3">
                <Dado
                  rotulo="Nome"
                  valor={aberto.nome ?? (aberto.completo ? "(sem nome)" : "Lead parcial")}
                />
                <Dado rotulo="Email" valor={aberto.email ?? "—"} />
                <Dado
                  rotulo="WhatsApp"
                  valor={
                    aberto.whatsapp ? (
                      <a
                        href={`https://wa.me/${aberto.whatsapp}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        <IconeWhatsApp className="h-4 w-4" /> {aberto.whatsapp}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
            </Bloco>

            {/* RESPOSTAS — logo após Contato: ambos são "sobre a pessoa". */}
            {extras(aberto).length > 0 && (
              <Bloco rotulo="Respostas do formulário">
                <div className="grid gap-2 sm:grid-cols-2">
                  {extras(aberto).map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-line/70 bg-surface p-3">
                      <p className="text-[11px] text-muted">{k}</p>
                      <p className="mt-0.5 text-sm text-ink">
                        {Array.isArray(v) ? v.join(", ") : String(v)}
                      </p>
                    </div>
                  ))}
                </div>
              </Bloco>
            )}

            {/* STATUS — gestão do pipeline. */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Status
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => mudarStatus.mutate({ id: aberto.id, novo: s })}
                    className={`rounded-xl px-3 py-1.5 text-xs transition ${
                      aberto.status === s
                        ? "bg-gold font-semibold text-white"
                        : "border border-line/70 text-muted hover:text-ink"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* ORIGEM & CAMPANHA — tudo que é aquisição, junto. */}
            <Bloco rotulo="Origem & Campanha">
              <div className="grid gap-4 sm:grid-cols-3">
                <Dado rotulo="Data" valor={new Date(aberto.criado_em).toLocaleString("pt-BR")} />
                {(aberto.utms.dispositivo || aberto.utms.sistema || aberto.utms.navegador) && (
                  <Dado
                    rotulo="Dispositivo"
                    valor={[aberto.utms.dispositivo, aberto.utms.sistema, aberto.utms.navegador]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                )}
                {Object.entries(aberto.utms)
                  .filter(([k]) => !["dispositivo", "sistema", "navegador"].includes(k))
                  .map(([k, v]) => (
                    <Dado key={k} rotulo={k.replace("utm_", "")} valor={String(v)} />
                  ))}
              </div>
              {aberto.origem && (
                <p
                  className="mt-4 truncate border-t border-line/60 pt-3 text-xs text-muted"
                  title={aberto.origem}
                >
                  {hostPath(aberto.origem)}
                </p>
              )}
            </Bloco>

            {/* Excluir — ação destrutiva, isolada no rodapé. */}
            <div className="border-t border-line/70 pt-4">
              <button
                onClick={() => setConfirmandoExcluir(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 py-2.5 text-sm text-rose-500 transition hover:bg-rose-500/10"
              >
                <Trash2 size={15} /> Excluir lead
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmação de exclusão do lead em popup (sem digitar nome: lead
          pode não ter nome). O type-to-confirm fica só pra remover cliente. */}
      <Modal
        aberto={confirmandoExcluir}
        onFechar={() => setConfirmandoExcluir(false)}
        titulo="Excluir lead"
      >
        <p className="text-sm text-ink">
          Excluir {aberto?.nome ? <span className="font-semibold">{aberto.nome}</span> : "este lead"}{" "}
          permanentemente?
        </p>
        <p className="mt-0.5 text-xs text-muted">Não dá para desfazer.</p>
        {excluir.isError && (
          <p className="mt-2 text-xs text-rose-500">{(excluir.error as Error).message}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => aberto && excluir.mutate(aberto.id)}
            disabled={excluir.isPending}
            className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {excluir.isPending ? "Excluindo…" : "Sim, excluir"}
          </button>
          <button
            onClick={() => setConfirmandoExcluir(false)}
            className="flex-1 rounded-xl border border-line/70 py-2.5 text-sm text-muted transition hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </Modal>
    </>
  );
}

/** Rótulo + valor, uma célula da grade de detalhes. */
function Dado({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{rotulo}</p>
      <p className="mt-0.5 break-words text-sm text-ink">{valor}</p>
    </div>
  );
}

/** Grupo de informações correlacionadas — rótulo + card em região comum. */
function Bloco({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{rotulo}</p>
      <div className="rounded-xl border border-line/70 bg-surface-2/40 p-4">{children}</div>
    </section>
  );
}

/** host + caminho da URL de origem — a URL crua é longa; as UTMs já a decodificam. */
function hostPath(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}
