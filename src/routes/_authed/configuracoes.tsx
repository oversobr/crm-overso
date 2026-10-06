import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Bell, Check, Monitor, Plus, ShieldCheck, SlidersHorizontal, Smartphone, Trash2, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { useAcesso } from "@/lib/acesso";
import type { PrimeiraTela } from "@/lib/guardado";
import { primeiraTela } from "@/lib/guardado";
import type { RegraDeAviso } from "@/lib/notificacoes";
import { definirRegrasDesligadas, REGRAS_DE_AVISO, useRegrasDesligadas } from "@/lib/notificacoes";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { modulosDe } from "@/lib/types";
import { iniciais } from "@/lib/usuario";

type Aba = "geral" | "notificacoes" | "seguranca" | "equipe";
const ABAS: Aba[] = ["geral", "notificacoes", "seguranca", "equipe"];

export const Route = createFileRoute("/_authed/configuracoes")({
  // A aba fica na URL: dá para mandar o link de uma seção e o voltar do
  // navegador anda entre elas.
  validateSearch: (s: Record<string, unknown>): { aba?: Aba } =>
    ABAS.includes(s.aba as Aba) && s.aba !== "geral" ? { aba: s.aba as Aba } : {},
  component: Configuracoes,
});

function Configuracoes() {
  const router = useRouter();
  const { aba = "geral" } = Route.useSearch();
  const { projeto, projetos } = usePainel();
  const { superAdmin, podeGerenciar } = useAcesso(projeto?.id);

  // A aba de equipe só existe para quem administra alguma coisa.
  const secoes: { id: Aba; rotulo: string; dica: string; icone: ReactNode }[] = [
    { id: "geral", rotulo: "Geral", dica: "Tema, idioma e formatos", icone: <SlidersHorizontal size={18} strokeWidth={1.9} aria-hidden /> },
    { id: "notificacoes", rotulo: "Notificações", dica: "Avisos e canais", icone: <Bell size={18} strokeWidth={1.9} aria-hidden /> },
    { id: "seguranca", rotulo: "Segurança", dica: "Senha e sessões", icone: <ShieldCheck size={18} strokeWidth={1.9} aria-hidden /> },
    ...(podeGerenciar
      ? [
          {
            id: "equipe" as const,
            rotulo: superAdmin ? "Equipe OVERSO" : "Equipe",
            dica: superAdmin ? "Quem acessa o portal" : "Quem acessa este cliente",
            icone: <UsersRound size={18} strokeWidth={1.9} aria-hidden />,
          },
        ]
      : []),
  ];
  const atual = secoes.some((s) => s.id === aba) ? aba : "geral";

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Configurações"
        subtitulo={superAdmin ? "Como o portal funciona para você e para a equipe OVERSO" : "Como o portal funciona para você"}
      />

      <div className="flex flex-wrap items-start gap-4">
        <nav aria-label="Seções" className="flex max-w-[280px] flex-[1_1_240px] flex-col gap-1 rounded-[20px] border border-borda bg-white p-2.5">
          {secoes.map((s) => {
            const ativa = s.id === atual;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => void router.navigate({ to: "/configuracoes", search: s.id === "geral" ? {} : { aba: s.id } })}
                aria-current={ativa ? "page" : undefined}
                className={`flex min-h-14 items-center gap-3 rounded-[14px] border-0 px-3 py-2 text-left text-marinho transition-colors focus-visible:outline-offset-0 ${
                  ativa ? "bg-azul-claro" : "bg-transparent hover:bg-superficie-2"
                }`}
              >
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] transition-colors ${
                    ativa ? "bg-azul text-white" : "bg-gelo text-texto-2"
                  }`}
                >
                  {s.icone}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-bold">{s.rotulo}</span>
                  <span className="text-[11px] text-texto-3">{s.dica}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          {atual === "geral" && <Geral superAdmin={superAdmin} />}
          {atual === "notificacoes" && <Notificacoes />}
          {atual === "seguranca" && <Seguranca />}
          {atual === "equipe" && (
            <>
              {superAdmin && <EquipeOverso totalDeClientes={projetos.length} />}
              <AcessosDoCliente />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Peças comuns ───────────────────────────────────────────────── */

function Secao({ titulo, descricao, acao, children }: { titulo: string; descricao: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[18px] rounded-[20px] border border-borda bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[18px] font-extrabold">{titulo}</h2>
          <span className="text-[13px] text-texto-3">{descricao}</span>
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Linha "rótulo à esquerda, controle à direita" da aba Geral. */
function Linha({ titulo, dica, children, ultima = false }: { titulo: string; dica: string; children: ReactNode; ultima?: boolean }) {
  return (
    <div className={`grid items-center gap-4 md:grid-cols-[220px_minmax(0,1fr)] ${ultima ? "" : "border-b border-gelo pb-[18px]"}`}>
      <span className="flex flex-col gap-0.5">
        <strong className="text-[14px]">{titulo}</strong>
        <span className="text-[12px] text-texto-3">{dica}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * Barra de salvar das abas que guardam preferência. As mudanças ficam num
 * rascunho; só valem (e só chegam ao resto do portal) em "Salvar alterações".
 */
function BarraDeSalvar({ mudou, onSalvar, onDescartar }: { mudou: boolean; onSalvar: () => void; onDescartar: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-marinho px-[18px] py-3.5 text-white">
      <span className="text-[13px] text-[#DCE8F7]">
        {mudou ? "Você tem mudanças por salvar." : "As mudanças valem assim que você salvar."}
      </span>
      <span className="flex gap-2.5">
        <button
          type="button"
          onClick={onDescartar}
          disabled={!mudou}
          className="btn border border-white/30 bg-transparent px-4 text-white hover:bg-white/10 focus-visible:outline-white disabled:opacity-40"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={!mudou}
          className="btn px-5 text-white transition-opacity hover:opacity-90 focus-visible:outline-white disabled:opacity-40"
          style={{ background: "var(--degrade-claro)" }}
        >
          Salvar alterações
        </button>
      </span>
    </div>
  );
}

/* ── Geral ──────────────────────────────────────────────────────── */

const TEMAS = [
  { id: "claro", rotulo: "Claro", fundo: "#EDF1F4", lado: "#DCE2E8", cartao: "#FFFFFF", disponivel: true },
  { id: "escuro", rotulo: "Escuro", fundo: "#1A1F26", lado: "#222831", cartao: "#2E3641", disponivel: false },
  {
    id: "sistema",
    rotulo: "Igual ao sistema",
    fundo: "linear-gradient(90deg, #EDF1F4 50%, #1A1F26 50%)",
    lado: "#B5BEC4",
    cartao: "#8D99A6",
    disponivel: false,
  },
] as const;

const PRIMEIRAS: { id: PrimeiraTela; rotulo: string }[] = [
  { id: "escolher", rotulo: "Escolher cliente" },
  { id: "ultimo", rotulo: "Último cliente usado" },
];

function Geral({ superAdmin }: { superAdmin: boolean }) {
  const salva = primeiraTela.usar();
  const [rascunho, setRascunho] = useState<PrimeiraTela>(salva);
  useEffect(() => setRascunho(salva), [salva]);

  return (
    <>
      <Secao titulo="Geral" descricao="Aparência e formatos. Vale só para a sua conta.">
        <Linha titulo="Tema" dica="Claro, escuro ou igual ao sistema">
          <div className="flex flex-col gap-2">
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2.5">
              {TEMAS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === "claro"}
                  disabled={!t.disponivel}
                  title={t.disponivel ? undefined : "Ainda não disponível"}
                  className={`flex flex-col gap-2 rounded-[14px] border-2 bg-white p-2.5 ${
                    t.id === "claro" ? "border-azul" : "border-borda opacity-60"
                  }`}
                >
                  <span aria-hidden="true" className="box-border flex h-14 gap-1 rounded-[10px] p-1.5" style={{ background: t.fundo }}>
                    <span className="w-[22%] rounded-md" style={{ background: t.lado }} />
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="h-2.5 rounded" style={{ background: t.cartao }} />
                      <span className="flex-1 rounded-md" style={{ background: t.cartao }} />
                    </span>
                  </span>
                  <span className="text-[13px] font-bold text-marinho">{t.rotulo}</span>
                </button>
              ))}
            </div>
            <span className="text-[11px] text-texto-3">O portal ainda só tem o tema claro. O escuro entra numa próxima versão.</span>
          </div>
        </Linha>

        {superAdmin && (
          <Linha titulo="Primeira tela ao entrar" dica="Só para super-admin">
            <div role="radiogroup" aria-label="Primeira tela" className="flex gap-1 self-start rounded-[12px] bg-gelo p-1 md:justify-self-start">
              {PRIMEIRAS.map((p) => {
                const marcada = rascunho === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={marcada}
                    onClick={() => setRascunho(p.id)}
                    className={`min-h-10 rounded-[9px] border-0 px-4 text-[13px] font-bold text-marinho transition-[background-color,box-shadow] focus-visible:outline-offset-0 ${
                      marcada ? "bg-white shadow-[0_1px_3px_rgba(28,46,69,0.12)]" : "bg-transparent"
                    }`}
                  >
                    {p.rotulo}
                  </button>
                );
              })}
            </div>
          </Linha>
        )}

        <div className="flex flex-col gap-2">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Fixo rotulo="Idioma" valor="Português (Brasil)" />
            <Fixo rotulo="Fuso horário" valor="Brasília (GMT-3)" />
            <Fixo rotulo="Formato de data" valor={new Date().toLocaleDateString("pt-BR")} />
          </div>
          <span className="text-[11px] text-texto-3">
            Por enquanto o portal funciona em português, no horário de Brasília e com a data no formato dia, mês e ano.
          </span>
        </div>
      </Secao>

      {superAdmin && (
        <BarraDeSalvar
          mudou={rascunho !== salva}
          onDescartar={() => setRascunho(salva)}
          onSalvar={() => {
            primeiraTela.gravar(rascunho);
            toast("Preferência salva.");
          }}
        />
      )}
    </>
  );
}

/** Campo que ainda só tem um valor possível: aparece como lista, travada. */
function Fixo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <label className="flex flex-col gap-2 text-[13px] font-bold">
      {rotulo}
      <select disabled value={valor} className="campo px-2.5 text-[13px] font-medium">
        <option>{valor}</option>
      </select>
    </label>
  );
}

/* ── Notificações ───────────────────────────────────────────────── */

const COLUNAS = "grid grid-cols-[minmax(0,1fr)_repeat(3,64px)] gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,100px)]";

function Notificacoes() {
  const { projeto } = usePainel();
  const mods = modulosDe(projeto);
  const salvas = useRegrasDesligadas();
  const [desligadas, setDesligadas] = useState<RegraDeAviso[]>(salvas);
  useEffect(() => setDesligadas(salvas), [salvas]);

  const regras = REGRAS_DE_AVISO.filter((r) => mods[r.modulo]);
  const mudou = [...desligadas].sort().join() !== [...salvas].sort().join();

  return (
    <>
      <Secao titulo="Notificações" descricao="O que vira aviso e por onde ele chega">
        <div className="flex flex-col overflow-hidden rounded-[14px] border border-borda">
          <div className={`${COLUNAS} bg-superficie-2 px-4 py-3 text-[11px] font-bold tracking-[0.08em] text-texto-3`}>
            <span>AVISO</span>
            <span className="text-center">PORTAL</span>
            <span className="text-center">E-MAIL</span>
            <span className="text-center">WHATSAPP</span>
          </div>
          {regras.map((r) => {
            const ligada = !desligadas.includes(r.id);
            return (
              <div key={r.id} className={`${COLUNAS} min-h-[60px] items-center border-t border-gelo px-4 py-2`}>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[13px]">{r.rotulo}</strong>
                  <span className="text-[11px] text-texto-3">{r.dica}</span>
                </span>
                <Caixa
                  marcada={ligada}
                  rotulo={`${r.rotulo} no portal`}
                  onClick={() => setDesligadas((l) => (ligada ? [...l, r.id] : l.filter((x) => x !== r.id)))}
                />
                <Caixa marcada={false} rotulo={`${r.rotulo} por e-mail`} />
                <Caixa marcada={false} rotulo={`${r.rotulo} por WhatsApp`} />
              </div>
            );
          })}
        </div>
        <span className="-mt-2 text-[11px] text-texto-3">
          Por enquanto os avisos chegam só no portal. E-mail e WhatsApp ainda não estão disponíveis.
        </span>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-superficie-2 px-4 py-3.5">
          <span className="flex flex-col gap-0.5">
            <strong className="text-[13px]">Resumo diário por e-mail</strong>
            <span className="text-[12px] text-texto-3">Uma mensagem com tudo que ficou parado no dia anterior</span>
          </span>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-texto-2">
            Enviar às
            <select
              disabled
              title="Ainda não disponível"
              className="campo min-h-10 rounded-[10px] px-2.5 text-[13px] font-bold"
              defaultValue="nao"
            >
              <option value="nao">Não enviar</option>
            </select>
          </label>
        </div>
      </Secao>

      <BarraDeSalvar
        mudou={mudou}
        onDescartar={() => setDesligadas(salvas)}
        onSalvar={() => {
          definirRegrasDesligadas(desligadas);
          toast("Avisos atualizados.");
        }}
      />
    </>
  );
}

/** Caixa de marcar da tabela de avisos. Sem `onClick`, o canal não existe ainda: fica travada. */
function Caixa({ marcada, rotulo, onClick }: { marcada: boolean; rotulo: string; onClick?: () => void }) {
  return (
    <span className="flex justify-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={marcada}
        aria-label={rotulo}
        onClick={onClick}
        disabled={!onClick}
        title={onClick ? undefined : "Ainda não disponível"}
        className="flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0"
      >
        <span
          className={`box-border flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border-2 text-white transition-colors ${
            marcada ? "border-azul bg-azul" : onClick ? "border-nevoa bg-white" : "border-borda bg-superficie-2"
          }`}
        >
          {marcada && <Check size={12} strokeWidth={3.5} aria-hidden />}
        </span>
      </button>
    </span>
  );
}

/* ── Segurança ──────────────────────────────────────────────────── */

/** "Windows · Chrome", a partir do que o navegador diz de si mesmo. */
function esteAparelho(): { nome: string; celular: boolean } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const sistema = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Computador";
  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  return { nome: `${sistema} · ${navegador}`, celular: /iPhone|Android.+Mobile/.test(ua) };
}

function Seguranca() {
  const aparelho = esteAparelho();

  const encerrarOutras = useMutation({
    mutationFn: async () => {
      // "others": derruba o login em todos os outros navegadores e aparelhos,
      // e mantém este.
      const { error } = await getSupabaseBrowserClient().auth.signOut({ scope: "others" });
      if (error) throw error;
    },
    onSuccess: () => toast("As outras sessões foram encerradas. Só este navegador continua conectado."),
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <Secao titulo="Segurança" descricao="Senha, verificação e onde sua conta está aberta">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2.5 rounded-[16px] bg-superficie-2 p-4">
          <strong className="text-[14px]">Senha</strong>
          <span className="text-[12px] leading-normal text-texto-3">Troque sempre que desconfiar que alguém mais a conhece.</span>
          <Link to="/perfil" className="btn btn-secundario btn-40 self-start font-bold">
            Trocar senha
          </Link>
        </div>

        <div
          role="switch"
          aria-checked={false}
          aria-disabled="true"
          aria-label="Verificação em duas etapas"
          className="flex flex-col items-start gap-2.5 rounded-[16px] border-[1.5px] border-borda bg-white p-4"
        >
          <span className="flex w-full items-center justify-between gap-3">
            <strong className="text-[14px]">Verificação em duas etapas</strong>
            <span className="box-border flex h-6 w-11 flex-none items-center justify-start rounded-full bg-nevoa-2 p-0.5 opacity-60">
              <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            </span>
          </span>
          <span className="text-[12px] leading-normal text-texto-3">
            Pede um código do celular ao entrar. Recomendado para super-admin, que enxerga todos os clientes.
          </span>
          <span className="rounded-md bg-gelo px-2 py-0.5 text-[11px] font-bold text-texto-2">Ainda não disponível</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-[14px]">Sessões abertas</strong>
          <button
            type="button"
            onClick={() => encerrarOutras.mutate()}
            disabled={encerrarOutras.isPending}
            className="min-h-9 rounded-[10px] border-0 bg-transparent px-2.5 text-[12px] font-bold text-erro-texto transition-colors hover:bg-erro-fundo"
          >
            {encerrarOutras.isPending ? "Encerrando…" : "Encerrar todas as outras"}
          </button>
        </div>
        <div className="flex min-h-[60px] items-center gap-3.5 rounded-[14px] border border-borda px-3.5 py-2.5">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-gelo text-texto-2">
            {aparelho.celular ? <Smartphone size={18} strokeWidth={1.8} aria-hidden /> : <Monitor size={18} strokeWidth={1.8} aria-hidden />}
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <strong className="text-[13px]">{aparelho.nome}</strong>
            <span className="text-[12px] text-texto-3">Conectado agora</span>
          </span>
          <span className="rounded-full bg-sucesso-fundo px-[9px] py-[3px] text-[11px] font-bold text-sucesso">Esta sessão</span>
        </div>
        <span className="text-[11px] leading-normal text-texto-3">
          O portal ainda não lista os outros aparelhos um a um. Se a conta ficou aberta em outro lugar, "Encerrar todas as outras"
          derruba todos de uma vez e mantém só este.
        </span>
      </div>
    </Secao>
  );
}

/* ── Equipe ─────────────────────────────────────────────────────── */

const CABECALHO_TABELA = "bg-superficie-2 px-4 py-3 text-[11px] font-bold tracking-[0.08em] text-texto-3";
const GRADE_EQUIPE = "grid grid-cols-[minmax(0,1.6fr)_1fr_1fr_120px] items-center gap-3";

function Pessoa({ email, escuro = false }: { email: string; escuro?: boolean }) {
  const nome = email.split("@")[0] ?? email;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12px] font-bold ${
          escuro ? "bg-marinho text-white" : "bg-nevoa text-marinho"
        }`}
      >
        {iniciais(nome.replace(/[._-]+/g, " "))}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="truncate">{nome}</strong>
        <span className="truncate text-[12px] text-texto-3">{email}</span>
      </span>
    </span>
  );
}

function Selo({ children, escuro = false }: { children: ReactNode; escuro?: boolean }) {
  return (
    <span className={`rounded-full px-[9px] py-[3px] text-[11px] font-bold ${escuro ? "bg-marinho text-white" : "bg-[#ECEEF1] text-[#4A5868]"}`}>
      {children}
    </span>
  );
}

/** Linha de formulário "e-mail + botão" para dar acesso a alguém. */
function Convite({
  placeholder,
  botao,
  ocupado,
  erro,
  onEnviar,
  children,
}: {
  placeholder: string;
  botao: string;
  ocupado: boolean;
  erro: string | null;
  onEnviar: (email: string) => void;
  /** Controles extras entre o e-mail e o botão (o nível de acesso). */
  children?: ReactNode;
}) {
  const [email, setEmail] = useState("");
  const pronto = email.trim().length > 3 && email.includes("@");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (pronto) onEnviar(email.trim());
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[220px] flex-1">
          <span className="sr-only">E-mail da pessoa</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={placeholder}
            className="campo w-full font-medium"
          />
        </label>
        {children}
        <button type="submit" disabled={!pronto || ocupado} className="btn btn-primario px-4">
          <Plus size={16} strokeWidth={2.2} aria-hidden />
          {ocupado ? "Adicionando…" : botao}
        </button>
      </div>
      {erro && <span className="text-[12px] font-semibold text-erro-texto">{erro}</span>}
      <span className="text-[11px] text-texto-3">
        A conta precisa existir antes: não há cadastro aberto, quem cria as contas é a OVERSO.
      </span>
    </form>
  );
}

type Global = { user_id: string; email: string };

/** Super-admins: a equipe da agência, que enxerga todos os clientes. */
function EquipeOverso({ totalDeClientes }: { totalDeClientes: number }) {
  const qc = useQueryClient();
  const sb = getSupabaseBrowserClient();

  const { data: globais = [] } = useQuery({
    queryKey: ["globais"],
    queryFn: async (): Promise<Global[]> => {
      const { data, error } = await sb.rpc("listar_globais");
      if (error) throw error;
      return (data ?? []) as Global[];
    },
  });

  const definir = useMutation({
    mutationFn: async (v: { email: string; ativar: boolean }) => {
      const { error } = await sb.rpc("definir_global", { p_email: v.email, p_ativar: v.ativar });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: ["globais"] });
      toast(v.ativar ? "Pessoa adicionada à equipe OVERSO." : "Pessoa removida da equipe OVERSO.");
    },
  });

  return (
    <Secao
      titulo="Equipe OVERSO"
      descricao="Quem da agência acessa o portal. As contas são criadas aqui, não existe cadastro aberto."
    >
      <Convite
        placeholder="email@daequipe.com"
        botao="Adicionar pessoa"
        ocupado={definir.isPending}
        erro={definir.isError && definir.variables?.ativar ? (definir.error as Error).message : null}
        onEnviar={(email) => definir.mutate({ email, ativar: true })}
      />

      <div className="overflow-x-auto">
        <div className="flex min-w-[560px] flex-col overflow-hidden rounded-[14px] border border-borda">
          <div className={`${GRADE_EQUIPE} ${CABECALHO_TABELA}`}>
            <span>PESSOA</span>
            <span>NÍVEL</span>
            <span>CLIENTES</span>
            <span />
          </div>
          {globais.map((g) => (
            <div key={g.user_id} className={`${GRADE_EQUIPE} min-h-16 border-t border-gelo px-4 py-2 text-[13px]`}>
              <Pessoa email={g.email} escuro />
              <span>
                <Selo escuro>Super-admin</Selo>
              </span>
              <span className="text-texto-2">Todos ({totalDeClientes})</span>
              <span className="flex justify-end">
                <BotaoRemover
                  rotulo={`Remover ${g.email} da equipe OVERSO`}
                  ocupado={definir.isPending}
                  onConfirmar={() => definir.mutate({ email: g.email, ativar: false })}
                />
              </span>
            </div>
          ))}
          {globais.length === 0 && <div className="border-t border-gelo px-4 py-6 text-center text-[13px] text-texto-3">Carregando a equipe…</div>}
        </div>
      </div>
    </Secao>
  );
}

type Membro = { user_id: string; email: string; papel: string };

/** Quem acessa o cliente aberto no menu, e com que nível. */
function AcessosDoCliente() {
  const { projeto } = usePainel();
  const qc = useQueryClient();
  const sb = getSupabaseBrowserClient();
  const [papel, setPapel] = useState("membro");

  const { data: membros = [], isLoading } = useQuery({
    queryKey: ["equipe", projeto?.id],
    enabled: Boolean(projeto),
    queryFn: async (): Promise<Membro[]> => {
      const { data, error } = await sb.rpc("equipe_membros", { p_project: projeto!.id });
      if (error) throw error;
      return (data ?? []) as Membro[];
    },
  });

  const conceder = useMutation({
    mutationFn: async (v: { email: string; papel: string }) => {
      const { error } = await sb.rpc("equipe_conceder", { p_email: v.email, p_project: projeto!.id, p_papel: v.papel });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["equipe", projeto?.id] });
      toast("Acesso concedido.");
    },
  });

  const revogar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await sb.rpc("equipe_revogar", { p_user: userId, p_project: projeto!.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["equipe", projeto?.id] });
      toast("Acesso removido.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  if (!projeto) return null;

  return (
    <Secao
      titulo={`Acessos de ${projeto.nome}`}
      descricao="Quem entra na conta deste cliente. Membro trabalha leads e conteúdo; admin também apaga lead, edita a ficha e gerencia estes acessos."
    >
      <Convite
        placeholder="email@dapessoa.com"
        botao="Dar acesso"
        ocupado={conceder.isPending}
        erro={conceder.isError ? (conceder.error as Error).message : null}
        onEnviar={(email) => conceder.mutate({ email, papel })}
      >
        <label className="campo flex items-center gap-2 px-3 text-[12px] font-semibold text-texto-3">
          Nível
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value)}
            className="cursor-pointer border-0 bg-transparent text-[13px] font-bold text-marinho outline-none"
          >
            <option value="membro">Membro</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </Convite>

      <div className="overflow-x-auto">
        <div className="flex min-w-[560px] flex-col overflow-hidden rounded-[14px] border border-borda">
          <div className={`${GRADE_EQUIPE} ${CABECALHO_TABELA}`}>
            <span>PESSOA</span>
            <span>NÍVEL</span>
            <span>CLIENTES</span>
            <span />
          </div>
          {membros.map((m) => (
            <div key={m.user_id} className={`${GRADE_EQUIPE} min-h-16 border-t border-gelo px-4 py-2 text-[13px]`}>
              <Pessoa email={m.email} />
              <span>
                <Selo>{m.papel === "admin" ? "Admin do cliente" : "Membro"}</Selo>
              </span>
              <span className="text-texto-2">Só este</span>
              <span className="flex justify-end">
                <BotaoRemover
                  rotulo={`Remover o acesso de ${m.email}`}
                  ocupado={revogar.isPending}
                  onConfirmar={() => revogar.mutate(m.user_id)}
                />
              </span>
            </div>
          ))}
          {membros.length === 0 && (
            <div className="border-t border-gelo px-4 py-6 text-center text-[13px] text-texto-3">
              {isLoading ? "Carregando os acessos…" : "Ninguém com acesso direto a este cliente ainda."}
            </div>
          )}
        </div>
      </div>
    </Secao>
  );
}

/** Remover em dois cliques: o primeiro arma, o segundo confirma. */
function BotaoRemover({ rotulo, ocupado, onConfirmar }: { rotulo: string; ocupado: boolean; onConfirmar: () => void }) {
  const [armado, setArmado] = useState(false);
  // Desarma sozinho: um "Confirmar" esquecido na tela não pode ser clicado por engano depois.
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);

  return armado ? (
    <button
      type="button"
      onClick={() => {
        setArmado(false);
        onConfirmar();
      }}
      disabled={ocupado}
      className="btn btn-36 bg-erro font-bold text-white hover:bg-erro-texto"
    >
      Confirmar
    </button>
  ) : (
    <button type="button" onClick={() => setArmado(true)} aria-label={rotulo} title={rotulo} className="btn btn-secundario btn-36 font-bold">
      <Trash2 size={14} strokeWidth={1.8} aria-hidden />
      Remover
    </button>
  );
}
