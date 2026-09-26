import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { Lock, Megaphone, Menu, Moon, Sun, UserRound, X } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";

import {
  IconeCalendario,
  IconeEventos,
  IconeConectar,
  IconeConfiguracao,
  IconeDashboard,
  IconeFunil,
  IconeLeads,
  IconeSair,
} from "@/components/icons";
import { Dropdown } from "@/components/dropdown";
import { LogoOverso } from "@/components/logo";
import { PainelProvider, usePainel } from "@/components/painel";
import { podeConectarQuery } from "@/lib/queries";
import type { Modulo } from "@/lib/types";
import { modulosDe } from "@/lib/types";
import { Toaster } from "@/components/toaster";
import { trocarTema, useTema } from "@/lib/theme";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/_authed")({
  // App estático: o guard roda no navegador. Ele existe pra UX (mandar quem
  // não entrou pro login) — quem protege o DADO é o RLS do Postgres, que não
  // devolve linha nenhuma sem uma sessão válida.
  beforeLoad: async () => {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    const user = data.session?.user;
    if (!user?.email) throw redirect({ to: "/login" });
    return { user: { id: user.id, email: user.email } };
  },
  component: Layout,
});

type IconeNav = ComponentType<{ className?: string }>;

// O portal é dividido por área: CRM (leads das LPs) e Conteúdo (redes sociais
// do cliente). Todas as telas seguem o cliente escolhido no topo da sidebar.
// Calendário é a visão geral (eventos, posts e tarefas) e vale pra todo
// cliente — por isso mora em Geral, e não num módulo.
const GERAL: { to: string; rotulo: string; Icone: IconeNav }[] = [
  { to: "/", rotulo: "Dashboard", Icone: IconeDashboard },
  { to: "/calendario", rotulo: "Calendário", Icone: IconeCalendario },
];

const CRM: { to: string; rotulo: string; Icone: IconeNav }[] = [
  { to: "/leads", rotulo: "Leads", Icone: IconeLeads },
  { to: "/funil", rotulo: "Funil", Icone: IconeFunil },
];

/** Ícone do lucide no mesmo tamanho e traço dos ícones da marca. */
function IconePostagem({ className = "" }: { className?: string }) {
  return <Megaphone size={18} strokeWidth={1.6} className={`shrink-0 ${className}`} />;
}

// Cada item da seção Conteúdo apaga conforme o SEU módulo: a Programação
// segue o Conteúdo, os Eventos seguem o módulo Eventos.
const CONTEUDO: { to: string; rotulo: string; Icone: IconeNav; modulo: Modulo }[] = [
  { to: "/postagens", rotulo: "Programação de Postagem", Icone: IconePostagem, modulo: "conteudo" },
  { to: "/eventos", rotulo: "Eventos", Icone: IconeEventos, modulo: "eventos" },
];



// `somenteAdmin` esconde o item de quem não administra nenhuma página. É só a
// interface: quem chamar a API direto esbarra no banco do mesmo jeito
// (16_conectar_admin.sql).
/** Ícone do lucide no mesmo tamanho e traço dos ícones da marca. */
function IconePerfil({ className = "" }: { className?: string }) {
  return <UserRound size={18} strokeWidth={1.6} className={`shrink-0 ${className}`} />;
}

const PREFERENCIAS: { to: string; rotulo: string; Icone: IconeNav; somenteAdmin?: boolean }[] = [
  { to: "/perfil", rotulo: "Meu perfil", Icone: IconePerfil },
  { to: "/configuracao", rotulo: "Configuração", Icone: IconeConfiguracao },
  { to: "/clientes", rotulo: "Clientes", Icone: IconeConectar, somenteAdmin: true },
];

function Layout() {
  // Gaveta do menu no celular. No desktop (lg+) a sidebar é fixa e este
  // estado não é usado pra nada.
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <PainelProvider>
      {/* h-dvh (não h-screen) porque no celular a barra do navegador entra e
          sai: com 100vh o rodapé do painel fica escondido atrás dela.
          overflow-hidden trava a moldura; só o <main> rola. */}
      <div className="flex h-dvh overflow-hidden">
        <Sidebar aberto={menuAberto} onFechar={() => setMenuAberto(false)} />

        {/* min-w-0 é o que impede uma tabela larga de esticar a coluna inteira
            e empurrar o layout — sem isso o flex-1 cresce além da tela. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <BarraMobile onAbrirMenu={() => setMenuAberto(true)} />
          <AreaDoCliente />
        </div>
      </div>
      <CortinaDeTroca />
      <Toaster />
    </PainelProvider>
  );
}

/**
 * Conteúdo da tela. O `key` muda a cada troca de cliente e remonta a tela,
 * então os filtros da anterior (que eram do outro cliente) voltam ao padrão.
 * Fica fora do Layout porque precisa do contexto do painel.
 */
function AreaDoCliente() {
  const { trocas } = usePainel();
  const main = useRef<HTMLElement>(null);

  // A tela nova começa do topo — rolada no meio parecia continuação da antiga.
  useEffect(() => {
    if (trocas > 0) main.current?.scrollTo({ top: 0 });
  }, [trocas]);

  return (
    <main ref={main} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div key={trocas}>
        <Outlet />
      </div>
    </main>
  );
}

/** Quanto a cortina da troca fica cheia na tela, antes de começar a sumir. */
const TROCA_VISIVEL_MS = 1000;
const TROCA_SAIDA_MS = 250;

/**
 * Cortina da troca de cliente: cobre o portal inteiro com a identidade da
 * OVERSO e o nome do cliente, enquanto a barra enche; depois some em fade e
 * revela o Dashboard do cliente novo. É o que deixa a troca impossível de
 * passar despercebida — antes só os números mudavam.
 */
function CortinaDeTroca() {
  const { trocas, projeto } = usePainel();
  const [fase, setFase] = useState<"cheia" | "saindo" | null>(null);

  useEffect(() => {
    if (trocas === 0) return;
    setFase("cheia");
    // Trocas seguidas reiniciam a cortina em vez de empilhar timers.
    const sair = setTimeout(() => setFase("saindo"), TROCA_VISIVEL_MS);
    const fim = setTimeout(() => setFase(null), TROCA_VISIVEL_MS + TROCA_SAIDA_MS);
    return () => {
      clearTimeout(sair);
      clearTimeout(fim);
    };
  }, [trocas]);

  if (!fase) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // key: a cada troca a cortina renasce, e as animações de entrada e da
      // barra recomeçam do zero.
      key={trocas}
      className={`cortina-troca fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-brand-950 ${
        fase === "saindo" ? "cortina-saindo" : ""
      }`}
    >
      {/* Mesmos brilhos do painel do login: a cortina é "a marca" falando. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 -top-28 h-[26rem] w-[26rem] rounded-full bg-brand-500/25 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-brand-700/40 blur-[130px]"
      />

      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="text-brand-100">
          <LogoOverso className="h-6 w-auto" />
        </div>
        <p className="cortina-nome mt-14 text-[11px] sm:mt-16 font-semibold uppercase tracking-[0.2em] text-brand-300">
          Abrindo cliente
        </p>
        <p className="cortina-nome display mt-2 max-w-[80vw] truncate text-3xl font-bold text-brand-100 sm:text-4xl">
          {projeto?.nome}
        </p>
        <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-brand-100/10">
          <div className="cortina-progresso h-full rounded-full bg-brand-400" />
        </div>
      </div>
    </div>
  );
}

/** Barra de topo do celular: só ela dá acesso ao menu quando a gaveta fecha. */
function BarraMobile({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/70 bg-sidebar px-4 lg:hidden">
      <button
        onClick={onAbrirMenu}
        aria-label="Abrir menu"
        className="rounded-xl p-2 text-muted transition hover:bg-surface/70 hover:text-ink"
      >
        <Menu size={20} strokeWidth={1.75} />
      </button>
      <div className="text-[#012b43] dark:text-ink">
        <LogoOverso className="h-4 w-auto" />
      </div>
    </header>
  );
}

/** Wordmark da marca no topo da sidebar: navy no claro, claro no escuro. */
function Logo() {
  return (
    <div className="flex h-10 items-center px-3 text-[#012b43] dark:text-ink">
      <LogoOverso />
    </div>
  );
}

function ItemNav({
  to,
  rotulo,
  Icone,
  onNavegar,
  desativado = false,
}: {
  to: string;
  rotulo: string;
  Icone: IconeNav;
  /** Fecha a gaveta no celular; no desktop não faz diferença. */
  onNavegar?: () => void;
  /**
   * Módulo que o cliente não usa: o item continua no menu (lembra que o
   * módulo existe), apagado e com cadeado. Clicar abre a tela com o aviso.
   */
  desativado?: boolean;
}) {
  return (
    <Link
      to={to}
      onClick={onNavegar}
      activeOptions={{ exact: to === "/" }}
      // hover:bg-surface/70 clareia o fundo do item pra destacar a opção sob o
      // cursor — antes só a cor do ícone/texto mudava.
      title={desativado ? "Módulo não ativado para este cliente" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface/70 hover:text-ink ${
        desativado ? "opacity-45" : ""
      }`}
      // Ativo = card cheio com sombra, como na referência.
      activeProps={{ className: "!bg-surface !text-ink shadow-sm shadow-black/5" }}
    >
      <Icone />
      {rotulo}
      {desativado && <Lock size={13} className="ml-auto shrink-0" />}
    </Link>
  );
}

function Secao({ children }: { children: string }) {
  return (
    <p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-wider text-muted">
      {children}
    </p>
  );
}

function Sidebar({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const router = useRouter();
  const { projeto, projetos, trocarCliente, trocas } = usePainel();
  const mods = modulosDe(projeto);
  const { data: podeConectar } = useQuery(podeConectarQuery());

  async function sair() {
    await getSupabaseBrowserClient().auth.signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <>
      {/* Véu do celular: escurece o conteúdo e fecha a gaveta ao tocar fora. */}
      {aberto && (
        <div
          onClick={onFechar}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Abaixo de lg a sidebar é uma gaveta que desliza por cima; a partir de
          lg volta a ser coluna fixa do layout (static), e o translate não vale. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-line/70 bg-sidebar px-3 pb-4 pt-6 transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* No celular o logo do topo já está na barra; aqui vira o botão de
            fechar, que é o que a mão procura com a gaveta aberta. */}
        <div className="flex items-center justify-between">
          <Logo />
          <button
            onClick={onFechar}
            aria-label="Fechar menu"
            className="rounded-xl p-2 text-muted transition hover:bg-surface/70 hover:text-ink lg:hidden"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

      {/* CLIENTES — seletor de página como card com bolinha, fiel à ref. */}
      <Secao>Clientes</Secao>
      {/* O anel acende no card a cada troca, ligando o aviso ao seletor. */}
      <div key={trocas} className={`mx-1 ${trocas > 0 ? "cliente-destaque" : ""}`}>
        <Dropdown
          value={projeto?.id ?? ""}
          onChange={(id) => {
            // Cliente novo sempre abre no Dashboard: é a visão geral dele, e
            // cair no meio de outra tela (ex.: um lead aberto) confundia.
            if (id !== projeto?.id) void router.navigate({ to: "/" });
            trocarCliente(id);
            onFechar();
          }}
          options={projetos.map((p) => ({ value: p.id, label: p.nome }))}
          placeholder="Nenhuma página ainda"
          leading={<span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />}
          triggerClassName="w-full rounded-xl border border-line/70 bg-surface py-3 pl-4 pr-4 text-sm font-medium text-ink shadow-sm shadow-black/5 hover:border-gold/40"
        />
      </div>

      <Secao>Geral</Secao>
      <nav className="flex flex-col gap-1">
        {GERAL.map((item) => (
          <ItemNav key={item.to} {...item} onNavegar={onFechar} />
        ))}
      </nav>

      <Secao>CRM</Secao>
      <nav className="flex flex-col gap-1">
        {CRM.map((item) => (
          <ItemNav key={item.to} {...item} onNavegar={onFechar} desativado={!mods.crm} />
        ))}
      </nav>

      <Secao>Conteúdo</Secao>
      <nav className="flex flex-col gap-1">
        {CONTEUDO.map(({ modulo, ...item }) => (
          <ItemNav key={item.to} {...item} onNavegar={onFechar} desativado={!mods[modulo]} />
        ))}
      </nav>

      <Secao>Preferências</Secao>
      <nav className="flex flex-col gap-1">
        {/* Enquanto a resposta não chega, o item fica fora: melhor aparecer um
            instante depois do que piscar na tela de quem não pode usá-lo. */}
        {PREFERENCIAS.filter((item) => !item.somenteAdmin || podeConectar === true).map(
          ({ somenteAdmin: _, ...item }) => (
            <ItemNav key={item.to} {...item} onNavegar={onFechar} />
          ),
        )}
      </nav>

      <div className="mt-auto">
        <Usuario onNavegar={onFechar} />
        <div className="flex flex-col gap-1">
          <BotaoTema />
          <button
            onClick={() => {
              onFechar();
              void sair();
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface/70 hover:text-ink"
          >
            <IconeSair />
            Sair
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}

/** Bloco de identidade: avatar (imagem ou inicial do nome), nome e email. */
function Usuario({ onNavegar }: { onNavegar?: () => void }) {
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient().auth.getUser();
      return data.user;
    },
  });

  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string };
  const email = user?.email ?? "";
  // Nome: metadata > parte antes do @ > "Usuário".
  const nome = meta.full_name || meta.name || (email ? email.split("@")[0] : "Usuário");
  const inicial = (nome.trim()[0] ?? "?").toUpperCase();

  return (
    // Clicar no próprio nome/foto leva a Meu perfil.
    <Link
      to="/perfil"
      onClick={onNavegar}
      title="Meu perfil"
      className="mb-2 mt-6 flex items-center gap-3 rounded-xl border-t border-line/70 px-2 pt-4 transition hover:opacity-80"
    >
      {meta.avatar_url ? (
        <img
          src={meta.avatar_url}
          alt={nome}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-semibold text-white">
          {inicial}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{nome}</p>
        <p className="truncate text-xs text-muted">{email}</p>
      </div>
    </Link>
  );
}

function BotaoTema() {
  const tema = useTema();
  const escuro = tema === "dark";
  return (
    <button
      onClick={() => trocarTema()}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface/70 hover:text-ink"
    >
      {escuro ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
      {escuro ? "Tema claro" : "Tema escuro"}
    </button>
  );
}
