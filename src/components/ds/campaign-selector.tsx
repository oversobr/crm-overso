import { Check, ChevronDown, Megaphone, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { NovaCampanha } from "@/components/nova-campanha";
import { usePainel } from "@/components/painel";
import { deYmd, ymd } from "@/lib/datas";
import { COR_TODAS_CAMPANHAS, CORES_CAMPANHA, statusDaCampanha } from "@/lib/status";
import type { Campaign } from "@/lib/types";

import { useFechaFora } from "./flutuante";
import { CampanhaBadge } from "./status-badge";

const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** "01/10 a 31/10", ou a ponta aberta por extenso. */
export function periodoDaCampanha(c: Pick<Campaign, "inicio" | "fim">): string {
  if (c.inicio && c.fim) return `${ddmm(c.inicio)} a ${ddmm(c.fim)}`;
  if (c.inicio) return `Desde ${ddmm(c.inicio)}`;
  if (c.fim) return `Até ${ddmm(c.fim)}`;
  return "Sem período definido";
}

const diasEntre = (a: string, b: string) => Math.round((deYmd(b).getTime() - deYmd(a).getTime()) / 864e5);
const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** "25 dias restantes", "Encerrada há 6 dias", "Começa em 26 dias". */
export function prazoDaCampanha(c: Pick<Campaign, "inicio" | "fim">, hoje: string): string {
  const status = statusDaCampanha(c, hoje);
  if (status === "agendada") return `Começa em ${dias(diasEntre(hoje, c.inicio!))}`;
  if (status === "encerrada") {
    const n = diasEntre(c.fim!, hoje);
    return n === 1 ? "Encerrada ontem" : `Encerrada há ${dias(n)}`;
  }
  if (!c.fim) return "Sem data para encerrar";
  const n = diasEntre(hoje, c.fim);
  return n === 0 ? "Termina hoje" : `${dias(n)} ${n === 1 ? "restante" : "restantes"}`;
}

/** A cor de cada campanha no seletor. */
export function corDaCampanha(campanhas: Campaign[], id: string | undefined): string {
  const i = campanhas.findIndex((c) => c.id === id);
  if (i < 0) return COR_TODAS_CAMPANHAS;
  // A cor escolhida no popup vale; campanha antiga (ou banco sem a coluna)
  // fica com a da posição dela na lista.
  return campanhas[i]!.cor || CORES_CAMPANHA[i % CORES_CAMPANHA.length]!;
}

/**
 * Faixa de campanha do topo das telas de leads: o seletor, o resumo da
 * campanha escolhida (período, status, meta) e o atalho de nova campanha.
 * A escolha vale para a tela toda: fica no painel, não no componente.
 */
export function CampaignSelector({
  leadsDaCampanha,
  periodoPadrao,
}: {
  /** Leads enviados da campanha escolhida: alimenta a barra da meta. */
  leadsDaCampanha: number;
  /** O recorte quando nenhuma campanha está escolhida ("dos últimos 30 dias"). */
  periodoPadrao: string;
}) {
  const { projeto, campanha, campanhas, setCampanhaId } = usePainel();
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useFechaFora([caixa], aberto, () => setAberto(false));

  const hoje = ymd(new Date());
  const cor = corDaCampanha(campanhas, campanha?.id);
  const meta = campanha?.meta_leads ?? null;
  const pct = meta ? Math.min(100, Math.round((leadsDaCampanha / meta) * 100)) : 0;

  const opcoes = [
    { id: null as string | null, nome: "Todas as campanhas", periodo: "Últimos 30 dias", cor: COR_TODAS_CAMPANHAS, status: null },
    ...campanhas.map((c) => ({
      id: c.id as string | null,
      nome: c.nome,
      periodo: periodoDaCampanha(c),
      cor: corDaCampanha(campanhas, c.id),
      status: statusDaCampanha(c, hoje),
    })),
  ];

  return (
    <section
      aria-label="Campanha"
      className="relative z-[6] flex flex-wrap items-center gap-4 rounded-[20px] border border-borda bg-white px-3.5 py-3"
    >
      <div ref={caixa} className="relative max-w-full">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-haspopup="listbox"
          className={`flex min-h-[54px] w-[280px] max-w-full items-center gap-3 rounded-[14px] border-[1.5px] bg-superficie-2 pl-2 pr-3.5 text-left text-marinho transition-colors hover:border-borda-campo-hover ${
            aberto ? "!border-azul" : "border-borda"
          }`}
        >
          <span
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] text-white"
            style={{ background: cor }}
          >
            <Megaphone size={18} strokeWidth={1.9} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[10px] font-bold tracking-[0.1em] text-texto-3">CAMPANHA</span>
            <span className="truncate text-[14px] font-extrabold">{campanha?.nome ?? "Todas as campanhas"}</span>
          </span>
          <ChevronDown size={16} strokeWidth={2} aria-hidden className="shrink-0" />
        </button>

        {aberto && (
          <div
            role="listbox"
            aria-label="Campanhas"
            className="menu-in absolute left-0 top-[62px] z-40 flex w-[400px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[18px] border border-borda bg-white shadow-[var(--sombra-popup)]"
          >
            <span className="px-4 pb-2 pt-3.5 text-[11px] font-bold tracking-[0.1em] text-texto-3">ESCOLHA A CAMPANHA</span>
            <div className="rolagem-fina flex max-h-[min(340px,55vh)] flex-col gap-1 overflow-y-auto px-2 pb-2">
              {opcoes.map((o) => {
                const sel = o.id === (campanha?.id ?? null);
                return (
                  <button
                    key={o.id ?? "todas"}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => {
                      setCampanhaId(o.id);
                      setAberto(false);
                    }}
                    className="opcao flex min-h-14 items-center gap-3 rounded-[12px] border-0 px-2.5 py-2 text-left text-marinho"
                  >
                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: o.cor }} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-bold">{o.nome}</span>
                      <span className="text-[11px] text-texto-3">{o.periodo}</span>
                    </span>
                    {o.status && <CampanhaBadge status={o.status} />}
                    {sel && <Check size={16} strokeWidth={3} color="#1A66C2" aria-hidden className="shrink-0" />}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                setCriando(true);
              }}
              className="link flex min-h-12 items-center gap-2 border-0 border-t border-solid border-gelo bg-transparent px-4 text-left text-[13px] font-bold hover:no-underline"
            >
              <Plus size={16} strokeWidth={2.2} aria-hidden />
              Nova campanha
            </button>
          </div>
        )}
      </div>

      {campanha ? (
        <div className="flex min-w-[min(320px,100%)] flex-1 flex-wrap items-center gap-[18px]">
          <span className="flex flex-col gap-1">
            <span className="text-[10px] font-bold tracking-[0.1em] text-texto-3">PERÍODO</span>
            <span className="flex items-center gap-2 text-[13px] font-bold">
              {periodoDaCampanha(campanha)}
              <CampanhaBadge status={statusDaCampanha(campanha, hoje)} />
            </span>
          </span>
          <span className="flex min-w-[min(220px,100%)] flex-1 flex-col gap-1.5">
            <span className="flex justify-between gap-3 text-[12px]">
              <strong>
                {meta
                  ? `${leadsDaCampanha.toLocaleString("pt-BR")} de ${meta.toLocaleString("pt-BR")} leads da meta`
                  : `${leadsDaCampanha.toLocaleString("pt-BR")} ${leadsDaCampanha === 1 ? "lead" : "leads"} · sem meta definida`}
              </strong>
              <span className="text-texto-3">{prazoDaCampanha(campanha, hoje)}</span>
            </span>
            <span
              className="h-2.5 overflow-hidden rounded-full bg-gelo"
              role="progressbar"
              aria-label="Meta de leads"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <span className="block h-2.5 rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: cor }} />
            </span>
          </span>
        </div>
      ) : (
        <span className="min-w-[min(220px,100%)] flex-1 text-[13px] text-texto-2">
          Mostrando <strong className="text-marinho">todas as campanhas</strong> {periodoPadrao}. Escolha uma para ver só os
          leads dela.
        </span>
      )}

      <button type="button" onClick={() => setCriando(true)} className="btn btn-secundario font-bold">
        <Plus size={16} strokeWidth={2.2} aria-hidden />
        Nova campanha
      </button>

      {criando && projeto && (
        <NovaCampanha
          projeto={projeto}
          campanhas={campanhas}
          onFechar={() => setCriando(false)}
          // A campanha recém-criada já fica escolhida no seletor.
          onCriada={(id) => id && setCampanhaId(id)}
        />
      )}
    </section>
  );
}
