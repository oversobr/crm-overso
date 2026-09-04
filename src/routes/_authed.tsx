import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { Menu, Moon, Sun, X } from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";

import {
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

// Nav em duas seções rotuladas, como na referência, com os ícones da marca.
const MENU: { to: string; rotulo: string; Icone: IconeNav }[] = [
  { to: "/", rotulo: "Dashboard", Icone: IconeDashboard },
  { to: "/leads", rotulo: "Leads", Icone: IconeLeads },
  { to: "/funil", rotulo: "Funil", Icone: IconeFunil },
];

// `somenteAdmin` esconde o item de quem não administra nenhuma página. É só a
// interface: quem chamar a API direto esbarra no banco do mesmo jeito
// (16_conectar_admin.sql).
const PREFERENCIAS: { to: string; rotulo: string; Icone: IconeNav; somenteAdmin?: boolean }[] = [
  { to: "/configuracao", rotulo: "Configuração", Icone: IconeConfiguracao },
  { to: "/conectar", rotulo: "Conectar Cliente", Icone: IconeConectar, somenteAdmin: true },
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
          <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster />
    </PainelProvider>
  );
}

/** Barra de topo do celular: só ela dá acesso ao menu quando a gaveta fecha. */
function BarraMobile({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/50 bg-sidebar px-4 lg:hidden">
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
}: {
  to: string;
  rotulo: string;
  Icone: IconeNav;
  /** Fecha a gaveta no celular; no desktop não faz diferença. */
  onNavegar?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onNavegar}
      activeOptions={{ exact: to === "/" }}
      // hover:bg-surface/70 clareia o fundo do item pra destacar a opção sob o
      // cursor — antes só a cor do ícone/texto mudava.
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface/70 hover:text-ink"
      // Ativo = card cheio com sombra, como na referência.
      activeProps={{ className: "!bg-surface !text-ink shadow-sm shadow-black/5" }}
    >
      <Icone />
      {rotulo}
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
  const { projeto, projetos, setProjetoId } = usePainel();
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-line/50 bg-sidebar px-3 pb-4 pt-6 transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
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
      <div className="px-1">
        <Dropdown
          value={projeto?.id ?? ""}
          onChange={(id) => {
            setProjetoId(id);
            onFechar();
          }}
          options={projetos.map((p) => ({ value: p.id, label: p.nome }))}
          placeholder="Nenhuma página ainda"
          leading={<span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />}
          triggerClassName="w-full rounded-xl border border-line/70 bg-surface py-3 pl-4 pr-4 text-sm font-medium text-ink shadow-sm shadow-black/5 hover:border-gold/40"
        />
      </div>

      <Secao>Menu</Secao>
      <nav className="flex flex-col gap-1">
        {MENU.map((item) => (
          <ItemNav key={item.to} {...item} onNavegar={onFechar} />
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
        <Usuario />
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
function Usuario() {
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
    <div className="mb-2 mt-6 flex items-center gap-3 border-t border-line/50 px-2 pt-4">
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
    </div>
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
