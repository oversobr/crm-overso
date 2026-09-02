import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown } from "lucide-react";

import { Card, StatCard, Vazio } from "@/components/ui";
import { funilQuery } from "@/lib/queries";

import { Cabecalho, usePainel } from "@/components/painel";

export const Route = createFileRoute("/_authed/funil")({ component: FunilPage });

function Etapa({
  rotulo,
  valor,
  base,
  cor,
}: {
  rotulo: string;
  valor: number;
  base: number;
  cor: string;
}) {
  const pct = base ? (100 * valor) / base : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink">{rotulo}</p>
        <p className="text-sm text-muted">
          {valor} ({Math.round(pct * 10) / 10}%)
        </p>
      </div>
      <div className="mt-2 h-9 overflow-hidden rounded-lg bg-surface-2">
        <div
          className={`flex h-full min-w-14 items-center justify-center rounded-lg text-xs font-semibold text-base transition-all ${cor}`}
          style={{ width: `${Math.max(pct, 4)}%` }}
        >
          {valor}
        </div>
      </div>
    </div>
  );
}

function Passagem({ texto }: { texto: string }) {
  return (
    <p className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted">
      <ArrowDown size={12} />
      {texto}
    </p>
  );
}

function FunilPage() {
  const { projeto, campanha } = usePainel();
  const { data: f, isLoading, error } = useQuery(funilQuery(projeto?.id, campanha?.id ?? null));

  // Mostra o erro em vez de girar pra sempre: se a query falhar (ex.: um 400
  // do banco), o usuário vê a mensagem e sabe o que houve, em vez de um
  // "Carregando…" eterno que não conta nada.
  if (error) {
    return (
      <>
        <Cabecalho titulo="Funil" />
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-rose-400">Não consegui carregar o funil.</p>
            <p className="mt-1 text-xs text-muted">{(error as Error).message}</p>
          </div>
        </Card>
      </>
    );
  }

  if (isLoading || !f) {
    return (
      <>
        <Cabecalho titulo="Funil" />
        <Card>
          <Vazio>{isLoading ? "Carregando…" : "Sem dados ainda."}</Vazio>
        </Card>
      </>
    );
  }

  const periodo =
    campanha?.inicio && campanha.fim
      ? `${new Date(`${campanha.inicio}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(
          `${campanha.fim}T12:00:00`,
        ).toLocaleDateString("pt-BR")}`
      : "Todo o período";

  return (
    <>
      <Cabecalho titulo="Funil" />

      <Card
        titulo="Funil de Conversão"
        acao={
          <span className="rounded-full border border-line/60 px-3 py-1 text-xs text-muted">
            {periodo}
          </span>
        }
      >
        {/* As três etapas são sequenciais de verdade: toda pessoa que
            iniciou abriu antes, e toda que completou iniciou antes. Por
            isso nenhuma porcentagem aqui pode passar de 100%. */}
        <Etapa rotulo="Aberturas do Formulário" valor={f.aberturas} base={f.aberturas} cor="bg-gold" />
        <Passagem texto={`${f.tx_engajamento ?? 0}% começaram a preencher`} />
        <Etapa rotulo="Começaram a Preencher" valor={f.iniciaram} base={f.aberturas} cor="bg-gold/70" />
        <Passagem texto={`${f.tx_conclusao ?? 0}% concluíram o envio`} />
        <Etapa rotulo="Leads Completos" valor={f.completos} base={f.aberturas} cor="bg-gold/45" />
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Aberturas do Formulário" valor={f.aberturas} />
        <StatCard rotulo="Leads Parciais (abandonaram)" valor={f.parciais} />
        <StatCard rotulo="Leads Completos" valor={f.completos} />
        <StatCard
          rotulo="Conversão Geral"
          valor={f.tx_conversao != null ? `${f.tx_conversao}%` : "—"}
        />
      </div>

      <Card titulo="Onde você está perdendo lead" className="mt-4">
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            <span className="font-semibold text-ink">{f.aberturas - f.iniciaram}</span> pessoas
            abriram o formulário e não digitaram nada. Isso é problema de oferta ou de primeira
            pergunta — não de formulário.
          </p>
          <p className="text-muted">
            <span className="font-semibold text-ink">{f.parciais}</span> começaram a preencher e
            desistiram no meio. Esses estão na aba Leads como{" "}
            <span className="italic">Lead parcial</span>, com o que já tinham digitado — dá para
            recuperar se deixaram o WhatsApp.
          </p>
        </div>
      </Card>
    </>
  );
}
