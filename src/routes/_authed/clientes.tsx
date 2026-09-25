import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Lock,
  PartyPopper,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { CampanhasCliente } from "@/components/campanhas-cliente";
import { Modal } from "@/components/modal";
import { CAMPO_MODULO, useAplicarModulos } from "@/components/modulo";
import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import {
  atualizarModulos,
  contarLeadsQuery,
  criarCliente,
  podeConectarQuery,
  projectsQuery,
  projetosGerenciaveisQuery,
  type NovoCliente,
} from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { toast } from "@/lib/toast";
import type { Modulo, ProjetoGerenciavel } from "@/lib/types";
import { MODULO_LABEL, modulosDe } from "@/lib/types";

export const Route = createFileRoute("/_authed/clientes")({ component: Clientes });

/* ── Módulos: o que cada um entrega ─────────────────────────────── */

const MODULOS: { id: Modulo; Icone: typeof Users; descricao: string }[] = [
  {
    id: "crm",
    Icone: Users,
    descricao: "Captura de leads da landing page, funil de conversão e fontes de tráfego.",
  },
  {
    id: "conteudo",
    Icone: CalendarDays,
    descricao: "Calendário de posts, stories, reels e vídeos, com status, artes e aprovação.",
  },
  {
    id: "eventos",
    Icone: PartyPopper,
    descricao: "Eventos do cliente, cada um com demandas em Kanban, materiais e divulgação.",
  },
];

/** Invalida tudo que mostra clientes: o seletor da sidebar e esta tela. */
function useRecarregarClientes() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
  };
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p && !/^(de|da|do|das|dos|e|—|-)$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

function Clientes() {
  const { data: podeConectar, isLoading: verificandoAcesso } = useQuery(podeConectarQuery());
  const { data: gerenciaveis = [], isLoading } = useQuery(projetosGerenciaveisQuery());
  // Os módulos vêm da MESMA consulta que o menu lateral usa (tabela direta).
  // A função projetos_gerenciaveis() não estava devolvendo usa_crm/
  // usa_conteudo, e sem eles tudo aparecia ligado: a ficha mostrava o
  // interruptor azul mesmo com o banco já desligado. Daqui só vem a chave.
  const { data: projetos = [] } = useQuery(projectsQuery());
  const clientes: ProjetoGerenciavel[] = gerenciaveis.map((c) => {
    const p = projetos.find((x) => x.id === c.id);
    return {
      ...c,
      usa_crm: p?.usa_crm ?? c.usa_crm,
      usa_conteudo: p?.usa_conteudo ?? c.usa_conteudo,
      usa_eventos: p?.usa_eventos ?? c.usa_eventos,
    };
  });
  const { projeto } = usePainel();
  const [novoAberto, setNovoAberto] = useState(false);
  // Guarda só o id: a ficha lê o cliente da lista, então reflete na hora
  // o que acabou de ser salvo (nome, módulos).
  const [fichaId, setFichaId] = useState<string | null>(null);
  const ficha = clientes.find((c) => c.id === fichaId) ?? null;

  // Portão que falha fechado: enquanto a resposta não chega (ou se a chamada
  // falhar) o valor é undefined, e a tela não abre. A aba também some do menu.
  if (!podeConectar) {
    return (
      <>
        <Cabecalho titulo="Clientes" comCampanha={false} />
        <Card>
          <Vazio>
            {verificandoAcesso
              ? "Verificando seu acesso…"
              : "Esta área é só da equipe OVERSO. Fale com o responsável pelo portal para cadastrar ou alterar um cliente."}
          </Vazio>
        </Card>
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo="Clientes" comCampanha={false}>
        <button
          onClick={() => setNovoAberto(true)}
          className="flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim"
        >
          <Plus size={15} /> Novo cliente
        </button>
      </Cabecalho>

      <p className="-mt-2 mb-4 text-sm text-muted">
        Cada cliente usa só os módulos que contratou. Clique num cliente para ligar ou desligar módulos, pegar o
        script da landing page ou removê-lo.
      </p>

      {isLoading ? (
        <Card>
          <Vazio>Carregando…</Vazio>
        </Card>
      ) : clientes.length === 0 ? (
        <Card>
          <Vazio>Nenhum cliente ainda. Use “Novo cliente” para cadastrar o primeiro.</Vazio>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clientes.map((c) => {
            const mods = modulosDe(c);
            return (
              <button
                key={c.id}
                onClick={() => setFichaId(c.id)}
                className="group flex items-center gap-3 rounded-2xl border border-line/70 bg-surface p-4 text-left shadow-sm shadow-black/5 transition hover:border-gold/50"
              >
                <Avatar nome={c.nome} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">
                    {c.nome}
                    {c.id === projeto?.id && (
                      <span className="ml-2 text-xs font-normal text-gold">no painel</span>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {MODULOS.map((m) => (
                      <SeloModulo key={m.id} modulo={m.id} ligado={mods[m.id]} />
                    ))}
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted transition group-hover:text-ink" />
              </button>
            );
          })}
        </div>
      )}

      {novoAberto && (
        <NovoClienteModal
          onFechar={() => setNovoAberto(false)}
          onAbrirFicha={(id) => {
            setNovoAberto(false);
            setFichaId(id);
          }}
        />
      )}
      {ficha && <FichaCliente cliente={ficha} onFechar={() => setFichaId(null)} />}
    </>
  );
}

function Avatar({ nome, grande = false }: { nome: string; grande?: boolean }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gold/15 font-semibold text-gold ${
        grande ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
      }`}
    >
      {iniciais(nome)}
    </div>
  );
}

function SeloModulo({ modulo, ligado }: { modulo: Modulo; ligado: boolean }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium leading-none ${
        ligado
          ? "bg-emerald-500/12 text-emerald-700 ring-1 ring-inset ring-emerald-600/25 dark:text-emerald-300"
          : "bg-surface-2 text-muted ring-1 ring-inset ring-line/70"
      }`}
    >
      {ligado ? <Check size={11} strokeWidth={3} /> : <Lock size={10} />}
      {MODULO_LABEL[modulo]}
    </span>
  );
}

/* ── Novo cliente: nome → módulos → pronto ──────────────────────── */

function NovoClienteModal({ onFechar, onAbrirFicha }: { onFechar: () => void; onAbrirFicha: (id: string) => void }) {
  const recarregar = useRecarregarClientes();
  const { trocarCliente } = usePainel();
  const router = useRouter();
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [nome, setNome] = useState("");
  const [escolha, setEscolha] = useState<Record<Modulo, boolean>>({ crm: true, conteudo: true, eventos: false });
  const [criado, setCriado] = useState<(NovoCliente & { modulos: Record<Modulo, boolean> }) | null>(null);
  // Banco sem o 20_modulos_cliente.sql: o cliente nasce com tudo ligado.
  const [semModulos, setSemModulos] = useState(false);

  const criar = useMutation({
    mutationFn: () => criarCliente(nome.trim(), escolha.crm, escolha.conteudo, escolha.eventos),
    onSuccess: async (novo) => {
      await recarregar();
      setCriado({ ...novo, modulos: escolha });
      setPasso(3);
    },
    onError: async (e) => {
      const cliente = (e as { cliente?: NovoCliente }).cliente;
      if ((e as Error).message === "MODULOS_INDISPONIVEIS" && cliente) {
        await recarregar();
        setSemModulos(true);
        setCriado({ ...cliente, modulos: { crm: true, conteudo: true, eventos: false } });
        setPasso(3);
        return;
      }
      toast((e as Error).message, "error");
    },
  });

  const algumModulo = escolha.crm || escolha.conteudo;

  return (
    <Modal aberto onFechar={onFechar} titulo="Novo cliente" maxW="max-w-xl">
      <Passos atual={passo} />

      {passo === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) setPasso(2);
          }}
        >
          <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="nome-cliente">
            Nome do cliente
          </label>
          <input
            id="nome-cliente"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Clínica Delmo Sakabe"
            className="w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/50"
          />
          <Rodape>
            <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" disabled={!nome.trim()} className={BOTAO_PRIMARIO}>
              Continuar <ArrowRight size={14} />
            </button>
          </Rodape>
        </form>
      )}

      {passo === 2 && (
        <>
          <p className="mb-3 text-sm text-muted">
            O que <span className="font-medium text-ink">{nome.trim()}</span> vai usar? Dá para mudar depois.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODULOS.map((m) => {
              const ligado = escolha[m.id];
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => setEscolha((e) => ({ ...e, [m.id]: !e[m.id] }))}
                  className={`relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${
                    ligado ? "border-gold bg-gold/5" : "border-line/70 hover:border-gold/40"
                  }`}
                >
                  <span
                    className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-md border ${
                      ligado ? "border-gold bg-gold text-white" : "border-line"
                    }`}
                  >
                    {ligado && <Check size={12} strokeWidth={3} />}
                  </span>
                  <m.Icone size={20} className={ligado ? "text-gold" : "text-muted"} />
                  <span className="font-semibold text-ink">{MODULO_LABEL[m.id]}</span>
                  <span className="text-xs leading-relaxed text-muted">{m.descricao}</span>
                </button>
              );
            })}
          </div>
          {!algumModulo && <p className="mt-3 text-xs text-rose-500">Escolha ao menos um módulo.</p>}
          <Rodape>
            <button type="button" onClick={() => setPasso(1)} className={BOTAO_SECUNDARIO}>
              <ArrowLeft size={14} /> Voltar
            </button>
            <button
              type="button"
              onClick={() => criar.mutate()}
              disabled={!algumModulo || criar.isPending}
              className={BOTAO_PRIMARIO}
            >
              {criar.isPending ? "Criando…" : "Criar cliente"}
            </button>
          </Rodape>
        </>
      )}

      {passo === 3 && criado && (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3">
            <Check size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-ink">
              <span className="font-semibold">{criado.nome}</span> foi cadastrado.
            </p>
          </div>
          {semModulos && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
              Os módulos ainda não foram ativados no banco (supabase/20_modulos_cliente.sql), então o cliente foi
              criado com CRM e Conteúdo ligados.
            </p>
          )}

          {criado.modulos.crm ? (
            <div className="mt-5">
              <h3 className="mb-1 text-sm font-semibold text-ink">Ligar a landing page</h3>
              <p className="mb-3 text-sm text-muted">
                Cole este script na landing page do cliente para os leads caírem no CRM.
              </p>
              <ScriptLP chave={criado.ingest_key} nome={criado.nome} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Este cliente não usa o CRM, então não há landing page para ligar. Os módulos dele já estão prontos para usar.
            </p>
          )}

          <Rodape>
            <button type="button" onClick={() => onAbrirFicha(criado.id)} className={BOTAO_SECUNDARIO}>
              Ver ficha
            </button>
            <button
              type="button"
              onClick={() => {
                onFechar();
                trocarCliente(criado.id);
                void router.navigate({
                  to: criado.modulos.crm ? "/" : criado.modulos.conteudo ? "/postagens" : "/eventos",
                });
              }}
              className={BOTAO_PRIMARIO}
            >
              Abrir cliente <ArrowRight size={14} />
            </button>
          </Rodape>
        </>
      )}
    </Modal>
  );
}

function Passos({ atual }: { atual: 1 | 2 | 3 }) {
  const nomes = ["Nome", "Módulos", "Pronto"];
  return (
    <ol className="mb-5 flex items-center gap-2 text-xs">
      {nomes.map((n, i) => {
        const num = (i + 1) as 1 | 2 | 3;
        const feito = num < atual;
        const aqui = num === atual;
        return (
          <li key={n} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                aqui ? "bg-gold text-white" : feito ? "bg-gold/15 text-gold" : "bg-surface-2 text-muted"
              }`}
            >
              {feito ? <Check size={12} strokeWidth={3} /> : num}
            </span>
            <span className={aqui ? "font-medium text-ink" : "text-muted"}>{n}</span>
            {i < nomes.length - 1 && <span className="mx-1 h-px w-6 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Ficha do cliente ───────────────────────────────────────────── */

type Aba = "geral" | "campanhas" | "lp";

function FichaCliente({ cliente, onFechar }: { cliente: ProjetoGerenciavel; onFechar: () => void }) {
  const recarregar = useRecarregarClientes();
  const qc = useQueryClient();
  const { trocarCliente } = usePainel();
  const router = useRouter();
  const mods = modulosDe(cliente);
  const aplicarModulos = useAplicarModulos();
  const [nome, setNome] = useState(cliente.nome);
  const [excluindo, setExcluindo] = useState(false);
  const [aba, setAba] = useState<Aba>("geral");

  const renomear = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("projects")
        .update({ nome: nome.trim() })
        .eq("id", cliente.id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("O banco recusou: sua conta não pode alterar este cliente.");
    },
    onSuccess: async () => {
      await recarregar();
      toast("Nome atualizado.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const alternar = useMutation({
    mutationFn: (m: Modulo) =>
      atualizarModulos(cliente.id, { [CAMPO_MODULO[m]]: !mods[m] }),
    onSuccess: async (salvo, m) => {
      await aplicarModulos(salvo);
      const agora = salvo[CAMPO_MODULO[m]];
      toast(`${MODULO_LABEL[m]} ${agora ? "ligado" : "desligado"} para ${cliente.nome}.`);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  if (excluindo) {
    return (
      <Modal aberto onFechar={onFechar} titulo="Remover cliente">
        <ConfirmarRemocao
          cliente={cliente}
          onVoltar={() => setExcluindo(false)}
          onRemovido={async () => {
            onFechar();
            await recarregar();
            await qc.invalidateQueries({ queryKey: ["leads"] });
            await qc.invalidateQueries({ queryKey: ["conteudos"] });
          }}
        />
      </Modal>
    );
  }

  const ligados = MODULOS.filter((m) => mods[m.id]).length;
  // Campanhas e landing page são do CRM: sem ele, as abas nem aparecem.
  const abas: { id: Aba; rotulo: string }[] = [
    { id: "geral", rotulo: "Geral" },
    ...(mods.crm
      ? [
          { id: "campanhas" as const, rotulo: "Campanhas" },
          { id: "lp" as const, rotulo: "Conexões" },
        ]
      : []),
  ];
  const abaAtual = abas.some((a) => a.id === aba) ? aba : "geral";

  return (
    <Modal aberto onFechar={onFechar} titulo="Ficha do cliente" maxW="max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <Avatar nome={cliente.nome} grande />
        <div className="min-w-0 flex-1">
          <h2 className="display truncate text-lg font-semibold text-ink">{cliente.nome}</h2>
          <p className="truncate text-xs text-muted">{cliente.slug}</p>
        </div>
        <button
          onClick={() => {
            onFechar();
            trocarCliente(cliente.id);
            void router.navigate({ to: "/" });
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line/70 px-3 py-1.5 text-xs text-ink transition hover:border-gold/50"
        >
          Abrir no painel <ArrowRight size={13} />
        </button>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-line/60">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={abaAtual === a.id}
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              abaAtual === a.id ? "border-gold font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {/* Altura fixa pras três abas: trocar de aba não faz a janela crescer
          nem encolher. O que passar disso rola por dentro. */}
      <div role="tabpanel" className="rolagem-fina -mr-2 h-[26rem] max-h-[60dvh] overflow-y-auto pr-2">
      {abaAtual === "geral" && (
      // Coluna da altura toda da aba: nome e módulos em cima, a remoção
      // presa no rodapé — o espaço sobra no meio, em vez de um vazio embaixo.
      <div className="flex min-h-full flex-col">
      <Bloco titulo="Nome">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim() && nome.trim() !== cliente.nome) renomear.mutate();
          }}
        >
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/50"
          />
          <button
            type="submit"
            disabled={!nome.trim() || nome.trim() === cliente.nome || renomear.isPending}
            className="rounded-xl bg-gold px-4 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-40"
          >
            {renomear.isPending ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </Bloco>

      <Bloco titulo="Módulos">
        <div className="space-y-2">
          {MODULOS.map((m) => {
            const ligado = mods[m.id];
            // O último ligado não desliga: cliente sem módulo nenhum ficaria vazio.
            const ultimo = ligado && ligados === 1;
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-line/70 p-3">
                <m.Icone size={18} className={`shrink-0 ${ligado ? "text-gold" : "text-muted"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{MODULO_LABEL[m.id]}</p>
                  <p className="text-xs text-muted">{ultimo ? "O cliente precisa de ao menos um módulo." : m.descricao}</p>
                </div>
                <Interruptor
                  ligado={ligado}
                  desabilitado={ultimo || alternar.isPending}
                  rotulo={`${ligado ? "Desligar" : "Ligar"} ${MODULO_LABEL[m.id]}`}
                  onClick={() => alternar.mutate(m.id)}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Desligar não apaga nada: leads e conteúdos continuam guardados e voltam se o módulo for religado.
        </p>
      </Bloco>

      {/* Espaçador: estica pra empurrar a remoção pro rodapé, mas nunca
          some de todo — guarda uma folga mínima acima dela. */}
      <div className="min-h-6 flex-1" />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
        <p className="text-xs text-muted">
          Remover apaga o cliente com todos os leads e conteúdos. Não dá para desfazer.
        </p>
        <button
          onClick={() => setExcluindo(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-rose-500 transition hover:bg-rose-500/10"
        >
          <Trash2 size={14} /> Remover
        </button>
      </div>
      </div>
      )}

      {abaAtual === "campanhas" && (
        <div className="mt-5">
          <CampanhasCliente projectId={cliente.id} nome={cliente.nome} />
        </div>
      )}

      {abaAtual === "lp" && (
        <div className="mt-5">
          <p className="mb-3 text-sm text-muted">Cole este script na landing page do cliente para os leads caírem no CRM.</p>
          <ScriptLP chave={cliente.ingest_key} nome={cliente.nome} />
        </div>
      )}
      </div>
    </Modal>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{titulo}</h3>
      {children}
    </section>
  );
}

function Interruptor({
  ligado,
  desabilitado,
  rotulo,
  onClick,
}: {
  ligado: boolean;
  desabilitado: boolean;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
        ligado ? "bg-gold" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          ligado ? "left-[1.375rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** Remoção com 2ª verificação: digitar o nome exato do cliente. */
function ConfirmarRemocao({
  cliente,
  onVoltar,
  onRemovido,
}: {
  cliente: ProjetoGerenciavel;
  onVoltar: () => void;
  onRemovido: () => Promise<void>;
}) {
  const [confirmacao, setConfirmacao] = useState("");
  const { data: qtdLeads } = useQuery(contarLeadsQuery(cliente.id));
  const confere = confirmacao.trim() === cliente.nome.trim();

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseBrowserClient().rpc("remover_projeto", { p_project: cliente.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await onRemovido();
      toast(`Cliente "${cliente.nome}" removido.`);
    },
  });

  return (
    <>
      <p className="text-sm text-ink">
        Isto remove <span className="font-semibold">{cliente.nome}</span>
        {qtdLeads != null && (
          <>
            {" "}
            e apaga{" "}
            <span className="font-semibold text-rose-500">
              {qtdLeads} lead{qtdLeads === 1 ? "" : "s"}
            </span>
          </>
        )}
        , junto com o calendário de conteúdo. Esta ação <span className="font-semibold">não pode ser desfeita</span>.
      </p>
      <p className="mt-4 text-sm text-muted">
        Para confirmar, digite o nome do cliente: <span className="select-all font-bold text-ink">{cliente.nome}</span>
      </p>
      <input
        autoFocus
        value={confirmacao}
        onChange={(e) => setConfirmacao(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && confere && !remover.isPending) remover.mutate();
        }}
        placeholder="Digite o nome exatamente"
        className="mt-2 w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-rose-500/60"
      />
      {remover.isError && <p className="mt-2 text-xs text-rose-500">{(remover.error as Error).message}</p>}
      <Rodape>
        <button type="button" onClick={onVoltar} className={BOTAO_SECUNDARIO}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <button
          onClick={() => remover.mutate()}
          disabled={!confere || remover.isPending}
          className="flex items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {remover.isPending ? "Removendo…" : "Remover cliente"}
        </button>
      </Rodape>
    </>
  );
}

/* ── Script da landing page ─────────────────────────────────────── */

function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
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

/**
 * Chave de captura + script pronto do cliente. O script vem de public/ —
 * uma cópia só, sem risco de divergir do que está no disco — e só a
 * configuração é trocada pela deste cliente.
 */
function ScriptLP({ chave, nome }: { chave: string; nome: string }) {
  const { data: bruto } = useQuery({
    queryKey: ["script-wp"],
    queryFn: async () => {
      const r = await fetch("/overso-lead-wp.js");
      if (!r.ok) throw new Error("não consegui ler o script");
      return r.text();
    },
    staleTime: Infinity,
  });

  const script = bruto?.replace(
    /var CFG = \{[\s\S]*?\};/,
    `var CFG = {\n    url: "${supabaseUrl()}",\n    anonKey: "${supabaseAnonKey()}",\n    key: "${chave}",\n  };`,
  );

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface-2/50 px-3 py-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted">Chave de captura</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{chave}</span>
        <Copiar texto={chave} rotulo="Copiar chave" />
      </div>

      {!script ? (
        <p className="mt-3 text-sm text-muted">Montando o script…</p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2">
            <p className="text-xs text-muted">
              Script de <span className="text-ink">{nome}</span> · {script.split("\n").length} linhas — copie tudo
            </p>
            <Copiar texto={script} rotulo="Copiar script" />
          </div>
          <pre className="rolagem-fina mt-2 max-h-48 overflow-auto rounded-xl border border-line/70 bg-base/60 p-3 text-[11px] leading-relaxed text-muted">
            {script}
          </pre>
        </>
      )}

      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>
          <span className="text-ink">WPCode</span> (JavaScript Snippet), local{" "}
          <span className="font-mono">Site Wide Footer</span> — cole <span className="text-ink">sem</span> as tags{" "}
          <span className="font-mono">&lt;script&gt;</span>.
        </p>
        <p>
          <span className="text-ink">Elementor Custom Code</span> ou <span className="text-ink">widget HTML</span> —
          envolva <span className="text-ink">com</span>{" "}
          <span className="font-mono">&lt;script&gt;…&lt;/script&gt;</span>.
        </p>
        <p>
          No Elementor, dê aos campos os IDs <span className="font-mono text-ink">nome</span>,{" "}
          <span className="font-mono text-ink">whatsapp</span> e <span className="font-mono text-ink">email</span> em
          Avançado → ID.
        </p>
      </div>
    </div>
  );
}

/* ── Peças de layout do modal ───────────────────────────────────── */

const BOTAO_PRIMARIO =
  "flex items-center justify-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40";
const BOTAO_SECUNDARIO =
  "flex items-center justify-center gap-1.5 rounded-full border border-line/70 px-4 py-2 text-sm text-ink transition hover:border-gold/50";

function Rodape({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2 border-t border-line/50 pt-4">{children}</div>;
}
