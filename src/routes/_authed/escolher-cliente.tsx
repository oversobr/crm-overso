import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate, useRouter } from "@tanstack/react-router";
import { ArrowRight, Check, LogOut, Plus, Search, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { Checkbox } from "@/components/ds/controles";
import { usePainel } from "@/components/painel";
import { LogoOverso } from "@/components/logo";
import { IconeClientes } from "@/components/shell/icones-menu";
import { acessosPorCliente, primeiraTela } from "@/lib/guardado";
import { chegouEm } from "@/lib/leads";
import { pendenciasDosClientesQuery, podeConectarQuery } from "@/lib/queries";
import { esquecerSessaoCurta } from "@/lib/sessao";
import { CORES_CAMPANHA } from "@/lib/status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Modulo } from "@/lib/types";
import { MODULO_LABEL, modulosDe } from "@/lib/types";
import { iniciais, useUsuario } from "@/lib/usuario";

/**
 * Pós-login do super-admin: qual cliente abrir. É uma página inteira, sem o
 * menu lateral (routes/_authed.tsx tira a moldura neste endereço). Membros e
 * admins de cliente não passam por aqui: entram direto na própria conta.
 */
export const Route = createFileRoute("/_authed/escolher-cliente")({ component: EscolherCliente });

const MODULOS: Modulo[] = ["crm", "conteudo", "eventos"];

/** Cores dos selos de alerta: lead em azul, post em roxo, aviso em laranja. */
const COR_ALERTA = {
  lead: { fundo: "#E3EEFA", texto: "#1A57A6" },
  post: { fundo: "#F3E8FB", texto: "#6B3696" },
  aviso: { fundo: "#FDF0DD", texto: "#8A4B08" },
} as const;

function EscolherCliente() {
  const router = useRouter();
  const usuario = useUsuario();
  const { projeto, projetos, setProjetoId } = usePainel();
  const { data: superAdmin, isLoading: conferindo } = useQuery(podeConectarQuery());
  const { data: pendencias = {} } = useQuery(pendenciasDosClientesQuery(projetos));
  const acessos = acessosPorCliente.usar();

  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [sempreOUltimo, setSempreOUltimo] = useState(primeiraTela.ler() === "ultimo");
  const [saindo, setSaindo] = useState(false);

  // Só a equipe OVERSO escolhe cliente; os demais vão para o painel deles.
  if (!conferindo && superAdmin === false) return <Navigate to="/" replace />;

  // Sem clique, vale o cliente que já estava aberto (ou o primeiro da lista).
  const selecionado = projetos.find((p) => p.id === (escolhido ?? projeto?.id)) ?? null;
  const termo = busca.trim().toLowerCase();
  const visiveis = projetos.filter((p) => p.nome.toLowerCase().includes(termo));

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  function entrar() {
    if (!selecionado) return;
    primeiraTela.gravar(sempreOUltimo ? "ultimo" : "escolher");
    setProjetoId(selecionado.id);
    void router.navigate({ to: "/" });
  }

  async function sair() {
    setSaindo(true);
    await getSupabaseBrowserClient().auth.signOut();
    esquecerSessaoCurta();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gelo text-marinho">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borda-campo px-5 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <LogoOverso className="h-[22px] w-auto" />
          <span className="rounded-md bg-borda-campo px-[7px] py-[3px] text-[10px] font-bold tracking-[0.1em] text-texto-2">PORTAL</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2.5 rounded-full border border-borda-campo bg-white py-1.5 pl-1.5 pr-3.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full bg-marinho text-[12px] font-bold text-white">
              {usuario.avatarUrl ? <img src={usuario.avatarUrl} alt="" className="h-full w-full object-cover" /> : usuario.iniciais}
            </span>
            <span className="flex flex-col gap-px">
              <span className="text-[13px] font-bold">{usuario.nome || "Você"}</span>
              <span className="text-[11px] text-texto-3">Super-admin</span>
            </span>
          </span>
          <button type="button" onClick={() => void sair()} disabled={saindo} className="btn btn-secundario px-3.5">
            <LogOut size={16} strokeWidth={1.8} aria-hidden />
            {saindo ? "Saindo…" : "Sair"}
          </button>
        </div>
      </header>

      <main className="mx-auto box-border flex w-full max-w-[1180px] flex-1 flex-col gap-[26px] px-5 pb-14 pt-11 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-2.5">
            <span className="flex items-center gap-1.5 self-start rounded-full bg-marinho px-2.5 py-[5px] text-[11px] font-bold tracking-[0.08em] text-white">
              <ShieldCheck size={12} strokeWidth={2.4} aria-hidden />
              VISÃO DE SUPER-ADMIN
            </span>
            <h1 className="m-0 text-[28px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[34px]">
              {saudacao}
              {usuario.primeiroNome ? `, ${usuario.primeiroNome}` : ""}. Qual cliente você quer abrir?
            </h1>
            <span className="text-[14px] text-texto-3">
              Dá para trocar depois pelo menu lateral. Membros e admins de cliente entram direto na própria conta.
            </span>
          </div>
          <Link to="/clientes" className="btn btn-secundario px-4 font-bold">
            <IconeClientes tamanho={16} />
            Gerenciar clientes
          </Link>
        </div>

        <label className="campo flex min-h-14 items-center gap-3 rounded-[16px] border-[1.5px] px-[18px] text-texto-3">
          <Search size={20} strokeWidth={1.8} aria-hidden className="flex-none" />
          <span className="sr-only">Buscar cliente</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente pelo nome"
            autoFocus
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-marinho"
          />
          <span className="flex-none text-[12px] font-semibold">
            {visiveis.length} {visiveis.length === 1 ? "cliente" : "clientes"}
          </span>
        </label>

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr))]">
          {visiveis.map((p) => {
            const marcado = p.id === selecionado?.id;
            const mods = modulosDe(p);
            const pend = pendencias[p.id];
            const acesso = acessos[p.id];
            const alertas = [
              pend?.leadsNovos ? { tom: "lead" as const, texto: `${pend.leadsNovos} ${pend.leadsNovos === 1 ? "lead novo" : "leads novos"}` } : null,
              pend?.postsParaAprovar
                ? { tom: "post" as const, texto: `${pend.postsParaAprovar} ${pend.postsParaAprovar === 1 ? "post para aprovar" : "posts para aprovar"}` }
                : null,
              pend?.postsDeHojeSemArte
                ? { tom: "aviso" as const, texto: pend.postsDeHojeSemArte === 1 ? "Post de hoje sem arte" : `${pend.postsDeHojeSemArte} posts de hoje sem arte` }
                : null,
            ].filter((a) => a != null);

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setEscolhido(p.id)}
                onDoubleClick={entrar}
                aria-pressed={marcado}
                className={`relative flex flex-col gap-4 rounded-[20px] border-2 p-5 text-left text-marinho transition-[border-color,box-shadow,background-color] ${
                  marcado
                    ? "border-azul bg-azul-claro shadow-[0_10px_26px_rgba(26,102,194,0.16)]"
                    : "border-borda bg-white hover:border-azul-borda"
                }`}
              >
                {marcado && (
                  <span className="absolute right-4 top-4 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-azul text-white">
                    <Check size={14} strokeWidth={3.5} aria-hidden />
                  </span>
                )}
                <span className="flex items-center gap-3.5">
                  <span
                    className="flex h-14 w-14 flex-none items-center justify-center rounded-[16px] text-[17px] font-extrabold text-white"
                    style={{ background: CORES_CAMPANHA[projetos.indexOf(p) % CORES_CAMPANHA.length] }}
                  >
                    {iniciais(p.nome)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1 pr-7">
                    <span className="text-[17px] font-extrabold leading-tight [overflow-wrap:anywhere]">{p.nome}</span>
                    <span className="text-[12px] font-normal text-texto-3">
                      {acesso ? `Último acesso: ${chegouEm(acesso).replace(/^(Hoje|Ontem)/, (m) => m.toLowerCase())}` : "Ainda não aberto por você"}
                    </span>
                  </span>
                </span>

                <span className="flex flex-wrap gap-1.5">
                  {alertas.map((a) => (
                    <span
                      key={a.texto}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-[5px] text-[12px] font-bold"
                      style={{ background: COR_ALERTA[a.tom].fundo, color: COR_ALERTA[a.tom].texto }}
                    >
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: COR_ALERTA[a.tom].texto }} />
                      {a.texto}
                    </span>
                  ))}
                  {pend && alertas.length === 0 && (
                    <span className="rounded-lg bg-sucesso-fundo px-2.5 py-[5px] text-[12px] font-bold text-sucesso">Tudo em dia</span>
                  )}
                </span>

                <span className="mt-auto flex flex-wrap gap-2 border-t border-gelo pt-3 text-[11px] font-bold">
                  {MODULOS.map((m) => (
                    <span key={m} className={`flex items-center gap-1 ${mods[m] ? "text-sucesso" : "text-texto-4"}`}>
                      {mods[m] ? <Check size={11} strokeWidth={3} aria-hidden /> : <X size={11} strokeWidth={3} aria-hidden />}
                      {MODULO_LABEL[m]}
                      {mods[m] ? "" : " bloqueado"}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}

          {!termo && (
            <Link
              to="/clientes"
              className="flex min-h-[190px] flex-col items-center justify-center gap-2.5 rounded-[20px] border-2 border-dashed border-azul-borda bg-azul-claro p-5 text-[#1A57A6] no-underline transition-colors hover:border-azul"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
                <Plus size={22} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="text-[15px] font-extrabold">Novo cliente</span>
              <span className="text-[12px] text-texto-2">Cadastrar e ligar os módulos</span>
            </Link>
          )}
        </div>

        {visiveis.length === 0 && (
          <p className="m-0 py-6 text-center text-[14px] text-texto-3">Nenhum cliente com esse nome.</p>
        )}

        <div className="sticky bottom-5 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-marinho py-4 pl-[22px] pr-[18px] text-white shadow-[0_16px_40px_rgba(14,24,38,0.25)]">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-[#DCE8F7]">
            <Checkbox checked={sempreOUltimo} onChange={(e) => setSempreOUltimo(e.target.checked)} className="!accent-[#5C9DE6]" />
            Abrir sempre o último cliente que usei
          </label>
          <span className="flex flex-wrap items-center gap-3.5">
            <span className="text-[13px] text-[#C9D6E6]">
              Selecionado: <strong className="text-white">{selecionado?.nome ?? "nenhum"}</strong>
            </span>
            <button
              type="button"
              onClick={entrar}
              disabled={!selecionado}
              className="btn min-h-12 rounded-[14px] px-[22px] text-[14px] text-white transition-opacity hover:opacity-90 focus-visible:outline-white disabled:opacity-40"
              style={{ background: "var(--degrade-claro)" }}
            >
              Entrar no painel
              <ArrowRight size={16} strokeWidth={2} aria-hidden />
            </button>
          </span>
        </div>
      </main>
    </div>
  );
}
