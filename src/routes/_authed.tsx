import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { Filter, LayoutGrid, LogOut, Plug, Users } from "lucide-react";

import { PainelProvider, usePainel } from "@/components/painel";
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

const NAV = [
  { to: "/", rotulo: "Dashboard", Icone: LayoutGrid },
  { to: "/leads", rotulo: "Leads", Icone: Users },
  { to: "/funil", rotulo: "Funil", Icone: Filter },
  { to: "/conectar", rotulo: "Conectar página", Icone: Plug },
] as const;

function Layout() {
  return (
    <PainelProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden px-8 py-6">
          <Outlet />
        </main>
      </div>
    </PainelProvider>
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
    <aside className="flex w-56 shrink-0 flex-col border-r border-line/40 bg-base/80 p-4">
      <h1 className="display px-2 py-3 text-xl font-bold text-gold">Painel CRM</h1>

      <nav className="mt-4 flex flex-col gap-1">
        {NAV.map(({ to, rotulo, Icone }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface/60 hover:text-ink"
            activeProps={{ className: "!bg-gold/10 !text-gold ring-1 ring-gold/25" }}
          >
            <Icone size={16} />
            {rotulo}
          </Link>
        ))}
      </nav>

      {/* Sempre visível, mesmo com um projeto só: é o seletor de cliente, a
          função central do painel. Escondê-lo faz o CRM parecer single-cliente. */}
      <div className="mt-6">
        <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">
          Página / Cliente
        </p>
        <select
          value={projeto?.id ?? ""}
          onChange={(e) => setProjetoId(e.target.value)}
          className="w-full rounded-lg border border-line/60 bg-surface-2 px-2 py-2 text-xs text-ink outline-none focus:border-gold/50"
        >
          {projetos.length === 0 && <option value="">Nenhuma página ainda</option>}
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={sair}
        className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface/60 hover:text-ink"
      >
        <LogOut size={16} />
        Sair
      </button>
    </aside>
  );
}
