import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, MapPin, Plus } from "lucide-react";
import { useState } from "react";

import { contagem, diasAte, FormEvento, periodoEvento, StatusEventoBadge } from "@/components/eventos";
import { ModuloDesativado } from "@/components/modulo";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { deYmd, fmt, ymd } from "@/lib/datas";
import { eventosQuery, faltaTabelaEventos, resumoDemandasQuery, type ResumoDemanda } from "@/lib/queries";
import type { Evento } from "@/lib/types";
import { modulosDe } from "@/lib/types";

export const Route = createFileRoute("/_authed/eventos/")({ component: Eventos });

function Eventos() {
  const { projeto } = usePainel();
  if (!modulosDe(projeto).eventos) {
    return (
      <>
        <Cabecalho titulo="Eventos" comCampanha={false} />
        <ModuloDesativado modulo="eventos" />
      </>
    );
  }
  return <EventosTela />;
}

function EventosTela() {
  const { projeto } = usePainel();
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const { data: eventos = [], isLoading, error } = useQuery(eventosQuery(projeto?.id));
  const { data: demandas = [] } = useQuery(resumoDemandasQuery(projeto?.id));

  // Próximos: ainda não terminou (e não foi cancelado). O resto vai pro fim.
  const terminou = (e: Evento) => diasAte(e.data_fim ?? e.data_inicio) < 0;
  const proximos = eventos.filter((e) => !terminou(e) && e.status !== "cancelado");
  const passados = eventos.filter((e) => terminou(e) || e.status === "cancelado").reverse();

  return (
    <>
      <Cabecalho titulo="Eventos" comCampanha={false}>
        <button
          onClick={() => setNovo(true)}
          disabled={!projeto}
          className="flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-50"
        >
          <Plus size={15} /> Novo evento
        </button>
      </Cabecalho>

      {error ? (
        <Card>
          <p className="py-6 text-center text-sm text-muted">
            {faltaTabelaEventos(error)
              ? "Os eventos ainda não foram ativados no banco (supabase/24_eventos.sql)."
              : `Não consegui carregar os eventos: ${(error as Error).message}`}
          </p>
        </Card>
      ) : isLoading ? (
        <Card>
          <Vazio>Carregando…</Vazio>
        </Card>
      ) : eventos.length === 0 ? (
        <Card>
          <Vazio>
            Nenhum evento ainda. Crie um para organizar demandas, materiais e divulgação num lugar só.
          </Vazio>
        </Card>
      ) : (
        <>
          <Grupo titulo="Próximos" vazio="Nenhum evento pela frente.">
            {proximos.map((e) => (
              <CardEvento key={e.id} e={e} demandas={demandas.filter((d) => d.evento_id === e.id)} />
            ))}
          </Grupo>
          {passados.length > 0 && (
            <Grupo titulo="Realizados e cancelados">
              {passados.map((e) => (
                <CardEvento key={e.id} e={e} demandas={demandas.filter((d) => d.evento_id === e.id)} apagado />
              ))}
            </Grupo>
          )}
        </>
      )}

      {novo && projeto && (
        <FormEvento
          projectId={projeto.id}
          onFechar={() => setNovo(false)}
          onCriado={(e) => void router.navigate({ to: "/eventos/$eventoId", params: { eventoId: e.id } })}
        />
      )}
    </>
  );
}

function Grupo({ titulo, vazio, children }: { titulo: string; vazio?: string; children: React.ReactNode[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{titulo}</h2>
      {children.length === 0 && vazio ? (
        <p className="text-sm text-muted">{vazio}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

/** Um evento: quando, onde, quanto falta e como andam as demandas. */
function CardEvento({ e, demandas, apagado = false }: { e: Evento; demandas: ResumoDemanda[]; apagado?: boolean }) {
  const hoje = ymd(new Date());
  const feitas = demandas.filter((d) => d.status === "concluido").length;
  const total = demandas.length;
  const atrasadas = demandas.filter((d) => d.status !== "concluido" && d.prazo && d.prazo < hoje).length;
  const pct = total ? Math.round((100 * feitas) / total) : 0;
  const falta = diasAte(e.data_inicio);

  return (
    <Link
      to="/eventos/$eventoId"
      params={{ eventoId: e.id }}
      className={`flex flex-col gap-4 rounded-2xl border border-line/70 bg-surface p-5 shadow-sm shadow-black/5 transition hover:border-gold/50 ${
        apagado ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Bloco da data, como um calendário de mesa. */}
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-gold/10 py-2 text-gold">
          <span className="text-[10px] font-semibold uppercase">
            {fmt(e.data_inicio, { month: "short" }).replace(".", "")}
          </span>
          <span className="text-xl font-bold leading-tight">{deYmd(e.data_inicio).getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold text-ink">{e.nome}</p>
          <p className="mt-0.5 text-xs text-muted">{periodoEvento(e)}</p>
        </div>
      </div>

      {e.local && (
        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
          <MapPin size={13} className="shrink-0" /> <span className="truncate">{e.local}</span>
        </p>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">
            {total ? `${feitas} de ${total} demandas concluídas` : "Nenhuma demanda ainda"}
          </span>
          {total > 0 && <span className="font-semibold text-ink">{pct}%</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <StatusEventoBadge status={e.status} />
        <span
          className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium leading-none ${
            falta >= 0 && falta <= 7 && e.status !== "cancelado"
              ? "bg-gold text-white"
              : "bg-surface-2 text-muted ring-1 ring-inset ring-line/70"
          }`}
        >
          {contagem(e)}
        </span>
        {atrasadas > 0 && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-rose-500/10 px-2.5 text-xs font-medium leading-none text-rose-600 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300">
            <AlertTriangle size={11} /> {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </Link>
  );
}
