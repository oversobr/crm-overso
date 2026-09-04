import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ComponentType } from "react";

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
  return (
    <PainelProvider>
      {/* h-screen + overflow-hidden trava a moldura na altura do monitor; só o
          <main> rola. Assim a sidebar fica fixa e nunca some ao rolar a tela. */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </PainelProvider>
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

function ItemNav({ to, rotulo, Icone }: { to: string; rotulo: string; Icone: IconeNav }) {
  return (
    <Link
      to={to}
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

function Sidebar() {
  const router = useRouter();
  const { projeto, projetos, setProjetoId } = usePainel();
  const { data: podeConectar } = useQuery(podeConectarQuery());

  async function sair() {
    await getSupabaseBrowserClient().auth.signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line/50 bg-sidebar px-3 pb-4 pt-6">
      <Logo />

      {/* CLIENTES — seletor de página como card com bolinha, fiel à ref. */}
      <Secao>Clientes</Secao>
      <div className="px-1">
        <Dropdown
          value={projeto?.id ?? ""}
          onChange={setProjetoId}
          options={projetos.map((p) => ({ value: p.id, label: p.nome }))}
          placeholder="Nenhuma página ainda"
          leading={<span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />}
          triggerClassName="w-full rounded-xl border border-line/70 bg-surface py-3 pl-4 pr-4 text-sm font-medium text-ink shadow-sm shadow-black/5 hover:border-gold/40"
        />
      </div>

      <Secao>Menu</Secao>
      <nav className="flex flex-col gap-1">
        {MENU.map((item) => (
          <ItemNav key={item.to} {...item} />
        ))}
      </nav>

      <Secao>Preferências</Secao>
      <nav className="flex flex-col gap-1">
        {/* Enquanto a resposta não chega, o item fica fora: melhor aparecer um
            instante depois do que piscar na tela de quem não pode usá-lo. */}
        {PREFERENCIAS.filter((item) => !item.somenteAdmin || podeConectar === true).map(
          ({ somenteAdmin: _, ...item }) => (
            <ItemNav key={item.to} {...item} />
          ),
        )}
      </nav>

      <div className="mt-auto">
        <Usuario />
        <div className="flex flex-col gap-1">
          <BotaoTema />
          <button
            onClick={sair}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface/70 hover:text-ink"
          >
            <IconeSair />
            Sair
          </button>
        </div>
      </div>
    </aside>
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
