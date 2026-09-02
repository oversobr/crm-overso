import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Target } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Cabecalho, usePainel } from "@/components/painel";
import { Modal } from "@/components/modal";
import { Card, StatusBadge, Vazio } from "@/components/ui";
import { DadosBlur } from "@/components/dados-blur";
import { fonteQuery, funilQuery, leadsQuery, serieQuery } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { coresGrafico, useTema } from "@/lib/theme";
import { toast } from "@/lib/toast";
import type { Funil } from "@/lib/types";

export const Route = createFileRoute("/_authed/")({ component: Dashboard });

const diaCurto = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

function Dashboard() {
  const { projeto, campanha } = usePainel();
  const cor = coresGrafico(useTema());
  const qc = useQueryClient();
  const [dias, setDias] = useState(7);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");

  const salvarMeta = useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: number | null }) => {
      const { error } = await getSupabaseBrowserClient()
        .from("campaigns")
        .update({ meta_leads: valor })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setEditandoMeta(false);
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast("Meta atualizada.", "success");
    },
  });

  function abrirMeta() {
    setMetaInput(campanha?.meta_leads != null ? String(campanha.meta_leads) : "");
    setEditandoMeta(true);
  }

  const { data: funil } = useQuery(funilQuery(projeto?.id, campanha?.id ?? null));
  const { data: serie = [] } = useQuery(serieQuery(projeto?.id, campanha?.id ?? null, dias));
  const { data: fontes = [] } = useQuery(fonteQuery(projeto?.id, campanha?.id ?? null));
  const { data: recentes } = useQuery(
    leadsQuery({
      projectId: projeto?.id,
      campaignId: campanha?.id ?? null,
      busca: "",
      status: "",
      tipo: "",
      pagina: 0,
    }),
  );

  const leads = recentes?.linhas ?? [];
  const total = funil?.completos ?? 0;
  const hoje = serie.at(-1)?.total ?? 0;
  const ontem = serie.at(-2)?.total ?? 0;
  const meta = campanha?.meta_leads ?? null;
  const pctMeta = meta ? Math.min(100, Math.round((1000 * total) / meta) / 10) : null;

  return (
    <>
      <Cabecalho titulo="Dashboard" atualizavel />

      <DadosBlur>
      {campanha && (
        <div className="mb-4 rounded-2xl border border-line/70 bg-surface px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Target size={16} className="text-gold" />
              Meta da Campanha ({campanha.nome})
            </p>
            <div className="flex items-center gap-3">
              {meta != null && (
                <p className="text-sm text-muted">
                  {total} / {meta} leads
                </p>
              )}
              <button
                onClick={abrirMeta}
                title="Editar meta"
                className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
              >
                <Pencil size={14} />
              </button>
            </div>
          </div>

          {meta != null ? (
            <>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${pctMeta}%` }}
                />
              </div>
              <p className="mt-1.5 text-right text-xs text-muted">{pctMeta}% da meta atingida</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Nenhuma meta definida.{" "}
              <button onClick={abrirMeta} className="font-medium text-gold hover:underline">
                Definir meta
              </button>
            </p>
          )}
        </div>
      )}

      {/* 3 KPIs que importam, no lugar de 6 cards rasos. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="Total de Leads" valor={total} destaque />
        <Kpi
          rotulo="Taxa de Conversão"
          valor={funil?.tx_conversao != null ? `${funil.tx_conversao}%` : "—"}
          sub="de abertura até completo"
        />
        <Kpi rotulo="Leads Hoje" valor={hoje} delta={hoje - ontem} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Gráfico: completos vs parciais empilhados, com período. */}
        <Card
          className="lg:col-span-2"
          titulo="Leads por dia"
          acao={
            <div className="flex gap-1 rounded-full border border-line/70 p-0.5">
              {[7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDias(d)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    dias === d ? "bg-gold font-semibold text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={cor.grade} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="dia"
                  tickFormatter={diaCurto}
                  interval={dias > 7 ? 4 : 0}
                  tick={{ fill: cor.eixo, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: cor.eixo, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={diaCurto}
                  cursor={{ fill: cor.grade, opacity: 0.3 }}
                  contentStyle={{
                    background: cor.tooltipBg,
                    border: `1px solid ${cor.tooltipLinha}`,
                    borderRadius: 10,
                    color: cor.ink,
                  }}
                />
                <Bar dataKey="completos" name="Completos" stackId="a" fill={cor.fill} />
                <Bar dataKey="parciais" name="Parciais" stackId="a" fill={cor.fill2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legenda cor={cor} />
        </Card>

        {/* Funil compacto — o sinal-chave do negócio, num olhar. */}
        <Card titulo="Funil">
          {funil ? <FunilCompacto f={funil} /> : <Vazio>Sem dados.</Vazio>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card titulo="Fontes">
          {fontes.length === 0 ? (
            <Vazio>Sem leads ainda.</Vazio>
          ) : (
            <div className="space-y-3">
              {fontes.slice(0, 6).map((f) => (
                <BarraFonte key={f.fonte} fonte={f.fonte} total={f.total} max={fontes[0]?.total ?? 0} />
              ))}
            </div>
          )}
        </Card>

        <Card
          titulo="Leads Recentes"
          acao={
            <Link
              to="/leads"
              className="rounded-full border border-line/70 px-3 py-1.5 text-xs text-ink transition hover:border-gold/50"
            >
              Ver todos
            </Link>
          }
        >
          {leads.length === 0 ? (
            <Vazio>Nenhum lead ainda.</Vazio>
          ) : (
            <div className="space-y-1">
              {leads.slice(0, 5).map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-ink">
                      {l.nome ?? (l.completo ? "(sem nome)" : "Lead parcial")}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {l.whatsapp ?? "—"} · {l.utms.utm_source ?? "direto"}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      </DadosBlur>

      <Modal aberto={editandoMeta} onFechar={() => setEditandoMeta(false)} titulo="Meta da campanha">
        <p className="text-sm text-muted">
          Quantos leads você quer atingir em{" "}
          <span className="font-semibold text-ink">{campanha?.nome}</span>?
        </p>
        <input
          type="number"
          min={0}
          autoFocus
          value={metaInput}
          onChange={(e) => setMetaInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && campanha) {
              const v = parseInt(metaInput, 10);
              salvarMeta.mutate({ id: campanha.id, valor: Number.isFinite(v) ? v : null });
            }
          }}
          placeholder="Ex.: 500"
          className="mt-3 w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
        />
        {salvarMeta.isError && (
          <p className="mt-2 text-xs text-rose-500">{(salvarMeta.error as Error).message}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => {
              if (!campanha) return;
              const v = parseInt(metaInput, 10);
              salvarMeta.mutate({ id: campanha.id, valor: Number.isFinite(v) ? v : null });
            }}
            disabled={salvarMeta.isPending}
            className="flex-1 rounded-xl bg-gold py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-60"
          >
            {salvarMeta.isPending ? "Salvando…" : "Salvar meta"}
          </button>
          {campanha?.meta_leads != null && (
            <button
              onClick={() => salvarMeta.mutate({ id: campanha.id, valor: null })}
              disabled={salvarMeta.isPending}
              className="rounded-xl border border-line/70 px-4 py-2.5 text-sm text-muted transition hover:text-ink"
            >
              Remover
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}

function Kpi({
  rotulo,
  valor,
  sub,
  delta,
  destaque = false,
}: {
  rotulo: string;
  valor: React.ReactNode;
  sub?: string;
  delta?: number;
  destaque?: boolean;
}) {
  return (
    <div
      className={
        destaque
          ? "rounded-2xl bg-gold px-5 py-4 text-white"
          : "rounded-2xl border border-line/70 bg-surface px-5 py-4"
      }
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${
          destaque ? "text-white/70" : "text-muted"
        }`}
      >
        {rotulo}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className={`text-3xl font-semibold ${destaque ? "text-white" : "text-ink"}`}>{valor}</p>
        {delta != null && <Delta v={delta} />}
      </div>
      {sub && <p className={`mt-1 text-xs ${destaque ? "text-white/70" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}

function Delta({ v }: { v: number }) {
  if (v === 0) return <span className="text-xs text-muted">= ontem</span>;
  const subiu = v > 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${
        subiu ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      }`}
    >
      {subiu ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(v)} vs ontem
    </span>
  );
}

function Legenda({ cor }: { cor: { fill: string; fill2: string } }) {
  return (
    <div className="mt-1 flex justify-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: cor.fill }} /> Completos
      </span>
      <span className="flex items-center gap-1.5">
        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: cor.fill2 }} /> Parciais
      </span>
    </div>
  );
}

function FunilCompacto({ f }: { f: Funil }) {
  const etapas = [
    { rot: "Abriram o formulário", v: f.aberturas },
    { rot: "Começaram a preencher", v: f.iniciaram },
    { rot: "Completaram", v: f.completos },
  ];
  // Maior perda entre etapas consecutivas — onde focar.
  const perdaAbrir = f.aberturas - f.iniciaram;
  const perdaConcluir = f.iniciaram - f.completos;
  const maior =
    perdaAbrir >= perdaConcluir
      ? { entre: "abrir e preencher", n: perdaAbrir }
      : { entre: "preencher e concluir", n: perdaConcluir };

  return (
    <div className="space-y-3">
      {etapas.map((e, i) => (
        <div key={e.rot}>
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-ink">{e.rot}</p>
            <p className="text-sm font-semibold text-ink">{e.v}</p>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gold transition-all"
              style={{
                width: `${f.aberturas ? Math.max(3, (100 * e.v) / f.aberturas) : 0}%`,
                // Cada etapa um pouco mais clara, pra ler como um funil afunilando.
                opacity: 1 - i * 0.28,
              }}
            />
          </div>
        </div>
      ))}
      <div className="mt-4 rounded-lg border border-line/60 bg-surface-2/50 p-3 text-xs">
        <p className="text-muted">
          Conversão geral:{" "}
          <span className="font-semibold text-ink">
            {f.tx_conversao != null ? `${f.tx_conversao}%` : "—"}
          </span>
        </p>
        {maior.n > 0 && (
          <p className="mt-1 text-muted">
            Maior perda: <span className="font-semibold text-ink">{maior.n} leads</span> entre{" "}
            {maior.entre}.
          </p>
        )}
      </div>
    </div>
  );
}

function BarraFonte({ fonte, total, max }: { fonte: string; total: number; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink">{fonte}</span>
        <span className="text-muted">{total}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gold transition-all"
          style={{ width: `${max ? Math.max(4, (100 * total) / max) : 0}%` }}
        />
      </div>
    </div>
  );
}
