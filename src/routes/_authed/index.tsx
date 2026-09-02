import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, Target } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, StatCard, StatusBadge, Vazio } from "@/components/ui";
import { fonteQuery, funilQuery, leadsQuery, serieQuery } from "@/lib/queries";

import { Cabecalho, usePainel } from "@/components/painel";

export const Route = createFileRoute("/_authed/")({ component: Dashboard });

const diaCurto = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });

function haQuanto(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias}d`;
}

function Dashboard() {
  const { projeto, campanha } = usePainel();
  const qc = useQueryClient();

  const { data: funil } = useQuery(funilQuery(projeto?.id, campanha?.id ?? null));
  const { data: serie = [] } = useQuery(serieQuery(projeto?.id, campanha?.id ?? null));
  const { data: fontes = [] } = useQuery(fonteQuery(projeto?.id, campanha?.id ?? null));
  const { data: recentes } = useQuery(
    leadsQuery({
      projectId: projeto?.id,
      campaignId: campanha?.id ?? null,
      busca: "",
      status: "",
      tipo: "completo",
      pagina: 0,
    }),
  );

  const leads = recentes?.linhas ?? [];
  const hoje = serie.at(-1)?.total ?? 0;
  const semana = serie.reduce((t, d) => t + d.total, 0);
  const meta = campanha?.meta_leads ?? null;
  const total = funil?.completos ?? 0;
  const pctMeta = meta ? Math.min(100, Math.round((1000 * total) / meta) / 10) : null;

  return (
    <>
      <Cabecalho titulo="Dashboard" />

      {meta && (
        <div className="mb-6 rounded-xl border border-line/60 bg-surface/70 px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Target size={16} className="text-gold" />
              Meta da Campanha ({campanha?.nome})
            </p>
            <p className="text-sm text-muted">
              {total} / {meta} leads
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-gold" style={{ width: `${pctMeta}%` }} />
          </div>
          <p className="mt-1.5 text-right text-xs text-muted">{pctMeta}% da meta atingida</p>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="display text-lg font-semibold text-ink">Visão Geral</h2>
        <button
          onClick={() => qc.invalidateQueries()}
          className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface/70 px-3 py-2 text-sm text-ink transition hover:border-gold/40"
        >
          <RefreshCw size={14} /> Atualizar Leads
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard rotulo="Total de Leads" valor={total} />
        <StatCard rotulo="Leads Hoje" valor={hoje} />
        <StatCard rotulo="Últimos 7 dias" valor={semana} />
        <StatCard rotulo="Principal Fonte" valor={fontes[0]?.fonte ?? "—"} />
        <StatCard
          rotulo="Último Lead"
          valor={leads[0] ? `${leads[0].nome ?? "—"} · ${haQuanto(leads[0].criado_em)}` : "—"}
        />
        <StatCard
          rotulo="Taxa de Conclusão"
          valor={funil?.tx_conclusao != null ? `${funil.tx_conclusao}%` : "—"}
        />
      </div>

      <Card titulo="Leads — Últimos 7 dias" className="mt-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d3b17d" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#d3b17d" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#223b57" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="dia"
                tickFormatter={diaCurto}
                tick={{ fill: "#8ba0b8", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#8ba0b8", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={diaCurto}
                formatter={(v: number) => [v, "leads"]}
                contentStyle={{
                  background: "#0f2036",
                  border: "1px solid #223b57",
                  borderRadius: 8,
                  color: "#e9eff6",
                }}
              />
              <Area type="monotone" dataKey="total" stroke="#d3b17d" strokeWidth={2} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        titulo="Leads Recentes"
        className="mt-4"
        acao={
          <Link
            to="/leads"
            className="rounded-lg border border-line/60 px-3 py-1.5 text-xs text-ink transition hover:border-gold/40"
          >
            Ver todos os leads
          </Link>
        }
      >
        {leads.length === 0 ? (
          <Vazio>Nenhum lead ainda. Assim que a página enviar o primeiro, ele aparece aqui.</Vazio>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/50 text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">WhatsApp</th>
                <th className="pb-2 font-medium">Origem</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 8).map((l) => (
                <tr key={l.id} className="border-b border-line/25 last:border-0">
                  <td className="py-2.5">{l.nome ?? (l.completo ? "(sem nome)" : "Lead parcial")}</td>
                  <td className="py-2.5 text-muted">{l.whatsapp ?? "—"}</td>
                  <td className="py-2.5 text-muted">{l.utms.utm_source ?? "direto"}</td>
                  <td className="py-2.5">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="py-2.5 text-muted">
                    {new Date(l.criado_em).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
