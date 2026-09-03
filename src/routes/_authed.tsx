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
import { PainelProvider, usePainel } from "@/components/painel";
import { Toaster } from "@/components/toaster";
import { trocarTema, useTema } from "@/lib/theme";
import { fetchCurrentUser } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/_authed")({
  // O guard roda no servidor: a tela protegida nunca chega a ser enviada
  // pra quem não tem sessão válida.
  beforeLoad: async () => {
    const user = await fetchCurrentUser();
    if (!user) throw redirect({ to: "/login" });
    return { user };
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

const PREFERENCIAS: { to: string; rotulo: string; Icone: IconeNav }[] = [
  { to: "/configuracao", rotulo: "Configuração", Icone: IconeConfiguracao },
  { to: "/conectar", rotulo: "Conectar Cliente", Icone: IconeConectar },
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

/**
 * Wordmark oficial da OVERSO. `fill="currentColor"` faz o logo herdar a cor:
 * navy da marca no tema claro, claro no escuro (senão navy some no fundo navy).
 */
function Logo() {
  return (
    <div className="flex h-10 items-center px-3 text-[#012b43] dark:text-ink">
      <svg
        viewBox="0 0 163 24"
        fill="currentColor"
        className="h-5 w-auto"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="OVERSO"
      >
        <path d="M0.313014 13.6544L25.8794 23.9636C26.2083 24.0959 26.5677 23.854 26.5677 23.4995V18.4669C26.5677 18.2625 26.4433 18.0788 26.2547 18.0028L0.688236 7.69269C0.359423 7.56038 0 7.80229 0 8.15675V13.1894C0 13.3938 0.124416 13.5774 0.313014 13.6534V13.6544Z" />
        <path d="M26.5677 0H20.8989V8.13988L0.710947 0C0.318939 0 0 0.31892 0 0.710906V0.794833C0 1.08512 0.175762 1.34578 0.445329 1.4544L24.5652 11.18C25.523 11.5661 26.5677 10.8611 26.5677 9.82828V0Z" />
        <path d="M54.8316 3.00099H42.2932C40.2354 3.00099 38.5677 4.66865 38.5677 6.72633V15.2779C38.5677 17.3356 40.2354 19.0033 42.2932 19.0033H54.8355C56.8943 19.0033 58.5621 17.3346 58.5611 15.276L58.5571 6.72436C58.5571 4.66767 56.8884 3 54.8316 3V3.00099ZM52.1477 16.7531H44.9741C44.1042 16.7531 43.4001 16.0481 43.4001 15.1792V6.82803C43.4001 5.95816 44.1052 5.25417 44.9741 5.25417H52.1477C53.0177 5.25417 53.7217 5.95915 53.7217 6.82803V15.1792C53.7217 16.0491 53.0167 16.7531 52.1477 16.7531Z" />
        <path d="M158.358 3.00099H145.82C143.762 3.00099 142.094 4.66865 142.094 6.72633V15.2779C142.094 17.3356 143.762 19.0033 145.82 19.0033H158.362C160.421 19.0033 162.089 17.3346 162.088 15.276L162.084 6.72436C162.084 4.66767 160.415 3 158.358 3V3.00099ZM155.674 16.7531H148.501C147.631 16.7531 146.927 16.0481 146.927 15.1792V6.82803C146.927 5.95816 147.632 5.25417 148.501 5.25417H155.674C156.544 5.25417 157.248 5.95915 157.248 6.82803V15.1792C157.248 16.0491 156.543 16.7531 155.674 16.7531Z" />
        <path d="M134.699 9.66672L126.294 8.78105C125.394 8.68626 124.711 7.92698 124.711 7.02156C124.711 6.04505 125.503 5.25318 126.479 5.25318H137.318C137.52 5.25318 137.682 5.09026 137.682 4.88884V3.36434C137.682 3.16292 137.52 3 137.318 3H123.65C121.567 3 119.878 4.6884 119.878 6.77175V8.70107C119.878 10.3579 121.129 11.7471 122.777 11.9209L124.711 12.1243L133.116 13.0109C134.016 13.1057 134.699 13.865 134.699 14.7704V14.9827C134.699 15.9592 133.908 16.7511 132.931 16.7511H120.803C120.602 16.7511 120.439 16.914 120.439 17.1154V18.639C120.439 18.8404 120.602 19.0033 120.803 19.0033H135.761C137.844 19.0033 139.533 17.3149 139.533 15.2315V13.0909C139.533 11.4341 138.283 10.0449 136.635 9.87111L134.699 9.66672Z" />
        <path d="M82.2869 6.98403V15.0202C82.2869 17.2201 84.0702 19.0033 86.2701 19.0033H101.016C101.262 19.0033 101.462 18.8048 101.462 18.559V17.1984C101.462 16.9525 101.262 16.7531 101.016 16.7531H88.5284C87.7503 16.7531 87.1203 16.1221 87.1203 15.3451V13.0011C87.1203 12.7552 87.3198 12.5558 87.5656 12.5558H101.831C102.077 12.5558 102.276 12.3563 102.276 12.1105V6.98403C102.276 4.78417 100.493 3.00098 98.293 3.00098H86.2711C84.0711 3.00098 82.2879 4.78417 82.2879 6.98403H82.2869ZM96.9966 10.3046H87.5647C87.3188 10.3046 87.1193 10.1051 87.1193 9.85925V6.66116C87.1193 5.88311 87.7503 5.25317 88.5274 5.25317H96.0328C96.8109 5.25317 97.4409 5.8841 97.4409 6.66116V9.85925C97.4409 10.1051 97.2414 10.3046 96.9956 10.3046H96.9966Z" />
        <path d="M76.5756 3.19055L71.364 14.9324C71.2514 15.1851 70.893 15.1851 70.7814 14.9324L65.5698 3.19055C65.5184 3.07503 65.4039 3.00098 65.2785 3.00098H60.993C60.762 3.00098 60.6079 3.23795 60.7017 3.44924L67.2237 18.1443C67.4587 18.6735 67.984 19.0151 68.5636 19.0151H72.1993C72.779 19.0151 73.3043 18.6735 73.5393 18.1443L80.236 3.05726L80.1718 3.02862C80.1313 3.01085 80.0869 3.00098 80.0425 3.00098H76.8699C76.7435 3.00098 76.6299 3.07503 76.5786 3.19055H76.5756Z" />
        <path d="M117.583 3.0217H114.122C112.479 3.0217 110.973 3.93403 110.211 5.3904L110.193 5.42397V3.26163C110.193 3.11846 110.077 3.00195 109.934 3.00195H105.619C105.476 3.00195 105.359 3.11846 105.359 3.26163V18.7446C105.359 18.8877 105.476 19.0043 105.619 19.0043H109.934C110.077 19.0043 110.193 18.8877 110.193 18.7446V9.67657C110.193 7.89536 111.638 6.45084 113.419 6.45084H117.583C117.727 6.45084 117.843 6.33433 117.843 6.19116V3.28039C117.843 3.13722 117.727 3.02071 117.583 3.02071V3.0217Z" />
      </svg>
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
        {PREFERENCIAS.map((item) => (
          <ItemNav key={item.to} {...item} />
        ))}
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
