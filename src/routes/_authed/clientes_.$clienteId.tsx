import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, Link2, Lock, Megaphone, Pencil, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  AdicionarPessoaModal,
  BotaoCopiar,
  CampanhasModal,
  EditarDadosModal,
  RemoverClienteModal,
  ScriptModal,
} from "@/components/cliente-ficha-modais";
import { Card, EmptyState } from "@/components/ds/card";
import { CAMPO_MODULO, useAplicarModulos } from "@/components/modulo";
import { usePainel } from "@/components/painel";
import { MarcaOverso } from "@/components/shell/icones-menu";
import { TopBar } from "@/components/shell/top-bar";
import { useAcesso } from "@/lib/acesso";
import { linkWhatsApp, telefoneBonito } from "@/lib/leads";
import { enviarLogoCliente, TIPOS_DE_LOGO } from "@/lib/logo-cliente";
import {
  atualizarModulos,
  conteudosQuery,
  hojeBrasilia,
  landingPagesQuery,
  membrosDoClienteQuery,
  perfilClienteQuery,
  projectsQuery,
  projetosGerenciaveisQuery,
  resumoPeriodoQuery,
  salvarPerfilCliente,
  type LandingPage,
} from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { LinkCliente, Modulo, PerfilCliente } from "@/lib/types";
import { MODULO_LABEL, modulosDe } from "@/lib/types";
import { urlSegura } from "@/lib/url";
import { iniciais } from "@/lib/usuario";

/**
 * Ficha de um cliente: contato, links, observações, captura das landing
 * pages, módulos, quem acessa e a remoção. Entra quem gerencia o cliente;
 * módulos e remoção são só da equipe OVERSO. O banco confere tudo de novo.
 */
export const Route = createFileRoute("/_authed/clientes_/$clienteId")({ component: FichaDoCliente });

const MODULOS: { id: Modulo; dica: string }[] = [
  { id: "crm", dica: "Leads, funil e exportação" },
  { id: "conteudo", dica: "Calendário, aprovação e comentários" },
  { id: "eventos", dica: "Demandas, materiais e divulgação" },
];

const CARTAO = "flex flex-col rounded-[20px] border border-borda bg-white p-[22px]";

type Popup = "dados" | "script" | "pessoa" | "campanhas" | "remover" | null;

function FichaDoCliente() {
  const { clienteId } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { projeto, trocarCliente } = usePainel();
  const { superAdmin, podeGerenciar } = useAcesso(clienteId);
  const [popup, setPopup] = useState<Popup>(null);

  const { data: projetos = [], isLoading: carregandoProjetos } = useQuery(projectsQuery());
  const { data: gerenciaveis = [] } = useQuery({ ...projetosGerenciaveisQuery(), enabled: podeGerenciar });
  const { data: perfil, error: erroPerfil } = useQuery({ ...perfilClienteQuery(clienteId), enabled: podeGerenciar });

  const base = projetos.find((p) => p.id === clienteId);
  const chave = gerenciaveis.find((p) => p.id === clienteId)?.ingest_key;
  const mods = modulosDe(base);

  const hoje = hojeBrasilia();
  const ha30 = new Date(Date.now() - 29 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, mes] = hoje.split("-").map(Number) as [number, number];
  const fimDoMes = `${hoje.slice(0, 7)}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;

  const { data: resumo } = useQuery({ ...resumoPeriodoQuery(clienteId, ha30, hoje), enabled: podeGerenciar && mods.crm });
  const { data: posts } = useQuery({
    ...conteudosQuery(clienteId, `${hoje.slice(0, 7)}-01`, fimDoMes),
    enabled: podeGerenciar && mods.conteudo,
  });
  const { data: paginas } = useQuery({ ...landingPagesQuery(clienteId), enabled: podeGerenciar && mods.crm });
  const { data: membros = [] } = useQuery(membrosDoClienteQuery(clienteId, podeGerenciar));
  const { data: globais = [] } = useQuery({
    queryKey: ["globais"],
    enabled: superAdmin,
    queryFn: async (): Promise<{ user_id: string; email: string; nome?: string | null }[]> => {
      const { data, error } = await getSupabaseBrowserClient().rpc("listar_globais");
      if (error) throw error;
      return (data ?? []) as { user_id: string; email: string; nome?: string | null }[];
    },
  });

  const aplicarModulos = useAplicarModulos();
  const alternar = useMutation({
    mutationFn: (m: Modulo) => atualizarModulos(clienteId, { [CAMPO_MODULO[m]]: !mods[m] }),
    onSuccess: async (salvo, m) => {
      await aplicarModulos(salvo);
      toast(`${MODULO_LABEL[m]} ${salvo[CAMPO_MODULO[m]] ? "ligado" : "desligado"} para ${base?.nome ?? "o cliente"}.`);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const revogar = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await getSupabaseBrowserClient().rpc("equipe_revogar", { p_user: userId, p_project: clienteId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["equipe", clienteId] });
      toast("Acesso removido.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  async function recarregar() {
    await qc.invalidateQueries({ queryKey: ["perfil-cliente", clienteId] });
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
  }

  const trilha = (nome?: string) => (
    <nav aria-label="Caminho" className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-texto-3">
      <Link to="/clientes" className="flex min-h-9 items-center gap-1.5 text-texto-3 no-underline hover:text-marinho">
        <ChevronLeft size={16} strokeWidth={2} aria-hidden />
        Clientes
      </Link>
      {nome && (
        <>
          <span aria-hidden>/</span>
          <span className="truncate font-bold text-marinho">{nome}</span>
        </>
      )}
    </nav>
  );

  // Portão que falha fechado: sem a confirmação de que a conta gerencia este
  // cliente, nada da ficha é pedido ao banco nem aparece.
  if (!podeGerenciar || !base) {
    const procurando = carregandoProjetos;
    return (
      <div className="flex flex-col gap-5">
        <TopBar titulo="Ficha do cliente" caminho={trilha()} acoes={<></>} />
        <Card>
          <EmptyState
            icone={<ShieldAlert size={20} strokeWidth={1.8} aria-hidden />}
            titulo={procurando ? "Abrindo a ficha…" : base ? "Ficha só para quem gerencia este cliente" : "Cliente não encontrado"}
          >
            {procurando
              ? undefined
              : base
                ? "Peça a um admin deste cliente ou à equipe OVERSO."
                : "Ele pode ter sido removido, ou sua conta não tem acesso a ele."}
          </EmptyState>
        </Card>
      </div>
    );
  }

  const noPainel = projeto?.id === clienteId;
  const ligados = MODULOS.filter((m) => mods[m.id]).length;
  const esperando = posts?.filter((p) => p.status === "aprovacao").length ?? 0;
  const recebendoHoje = paginas?.filter((p) => diaDe(p.ultimoLead) === hoje).length ?? 0;
  const mesAtual = new Date(`${hoje}T12:00:00`).toLocaleDateString("pt-BR", { month: "long" });

  const numeros: { rotulo: string; valor: string; nota: string }[] = [
    {
      rotulo: "Leads em 30 dias",
      valor: !mods.crm ? "0" : resumo ? resumo.iniciaram.toLocaleString("pt-BR") : "…",
      nota: !mods.crm
        ? "Módulo CRM desligado"
        : !resumo
          ? "Contando…"
          : resumo.aberturas > 0
            ? `${Math.round((resumo.enviaram / resumo.aberturas) * 100)}% de conversão do formulário`
            : "Nenhuma abertura de formulário",
    },
    {
      rotulo: `Posts em ${mesAtual}`,
      valor: !mods.conteudo ? "0" : posts ? String(posts.length) : "…",
      nota: !mods.conteudo ? "Módulo Conteúdo desligado" : posts ? `${esperando} esperando aprovação` : "Contando…",
    },
    {
      rotulo: "Landing pages",
      valor: !mods.crm ? "0" : paginas ? String(paginas.length) : "…",
      nota: !mods.crm ? "Módulo CRM desligado" : paginas ? `${recebendoHoje} recebendo leads hoje` : "Contando…",
    },
    {
      rotulo: "Pessoas com acesso",
      valor: String(membros.length + globais.length),
      nota: superAdmin ? `${membros.length} do cliente, ${globais.length} da OVERSO` : `${membros.length} do cliente`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <TopBar titulo={`Ficha de ${base.nome}`} caminho={trilha(base.nome)} acoes={<></>} />

      {/* Capa */}
      <section
        className="relative flex flex-wrap items-center gap-[22px] overflow-hidden rounded-[20px] p-7 text-white"
        style={{ background: "var(--degrade-profundo)" }}
      >
        <MarcaOverso largura={260} altura={235} className="pointer-events-none absolute right-[30px] top-[-30px] text-white opacity-[0.08]" />
        <Logo perfil={perfil} nome={base.nome} onSalvo={recarregar} />
        <div className="relative flex min-w-[min(260px,100%)] flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="m-0 text-[28px] font-extrabold leading-tight [overflow-wrap:anywhere]">{base.nome}</h2>
            {noPainel && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-[#1A57A6]">No painel agora</span>
            )}
          </div>
          <span className="text-[14px] text-azul-claro-2">
            {perfil
              ? `${perfil.segmento ? `${perfil.segmento} · cliente` : "Cliente"} desde ${new Date(perfil.criado_em).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}`
              : base.slug}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MODULOS.map((m) => (
              <span
                key={m.id}
                className={`flex items-center gap-[5px] rounded-lg border px-2.5 py-[5px] text-[12px] font-bold ${
                  mods[m.id] ? "border-white/[0.28] bg-white/[0.18]" : "border-dashed border-white/[0.45] text-[#DCE8F7]"
                }`}
              >
                {mods[m.id] ? <Check size={12} strokeWidth={3} aria-hidden /> : <Lock size={12} strokeWidth={2.4} aria-hidden />}
                {MODULO_LABEL[m.id]}
              </span>
            ))}
          </div>
        </div>
        <div className="relative flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setPopup("dados")}
            disabled={!perfil}
            className="btn border border-white/30 bg-white/[0.14] px-4 font-bold text-white hover:bg-white/[0.24] focus-visible:outline-white disabled:opacity-60"
          >
            <Pencil size={16} strokeWidth={2} aria-hidden />
            Editar dados
          </button>
          <button
            type="button"
            onClick={() => {
              trocarCliente(clienteId);
              void router.navigate({ to: mods.crm ? "/" : mods.conteudo ? "/postagens" : "/eventos" });
            }}
            className="btn bg-white px-[18px] font-bold text-marinho hover:bg-azul-claro focus-visible:outline-white"
          >
            Abrir no painel
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </section>

      {/* Números */}
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {numeros.map((n) => (
          <div key={n.rotulo} className="flex flex-col gap-2 rounded-[18px] border border-borda bg-white px-5 py-[18px]">
            <span className="text-[12px] font-semibold text-texto-3">{n.rotulo}</span>
            <span className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{n.valor}</span>
            <span className="text-[12px] text-texto-3">{n.nota}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-4">
          {erroPerfil ? (
            <Card>
              <EmptyState titulo="Não consegui abrir os dados da ficha">
                {/column|does not exist|schema cache/i.test((erroPerfil as Error).message)
                  ? "A ficha do cliente ainda não foi ativada no banco (supabase/28_perfil_cliente.sql)."
                  : (erroPerfil as Error).message}
              </EmptyState>
            </Card>
          ) : !perfil ? (
            <Card>
              <EmptyState titulo="Carregando a ficha…" />
            </Card>
          ) : (
            <>
              <section className={`${CARTAO} gap-3.5`}>
                <div className="flex items-center justify-between">
                  <h2 className="m-0 text-[16px] font-bold">Contato do cliente</h2>
                  <button type="button" onClick={() => setPopup("dados")} className="link min-h-9 border-0 bg-transparent px-2.5 text-[12px] font-bold">
                    Editar
                  </button>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <Dado rotulo="RESPONSÁVEL">{perfil.contato_nome}</Dado>
                  <Dado rotulo="WHATSAPP" href={perfil.contato_telefone ? linkWhatsApp(perfil.contato_telefone) : undefined}>
                    {telefoneBonito(perfil.contato_telefone)}
                  </Dado>
                  <Dado rotulo="E-MAIL" href={perfil.contato_email ? `mailto:${perfil.contato_email}` : undefined}>
                    {perfil.contato_email}
                  </Dado>
                </div>
              </section>

              <Links perfil={perfil} onSalvo={recarregar} />

              <section className={`${CARTAO} gap-3`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="m-0 text-[16px] font-bold">Observações</h2>
                  {perfil.atualizado_em && (
                    <span className="text-[11px] text-texto-3">
                      Editado {perfil.atualizado_por_nome ? `por ${perfil.atualizado_por_nome} ` : ""}em{" "}
                      {new Date(perfil.atualizado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}
                    </span>
                  )}
                </div>
                {perfil.observacoes ? (
                  <p className="m-0 whitespace-pre-line rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[13px] leading-[1.6]">{perfil.observacoes}</p>
                ) : (
                  <p className="m-0 rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[13px] leading-[1.6] text-texto-3">
                    Nada anotado ainda. Use "Editar dados" para registrar tom de voz, procedimentos em destaque, restrições de imagem e
                    datas importantes.
                  </p>
                )}
              </section>
            </>
          )}

          <section className={`${CARTAO} gap-3.5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[16px] font-bold">Landing pages e captura</h2>
                <span className="text-[12px] text-texto-3">Páginas que já enviam leads para o CRM deste cliente</span>
              </div>
              {mods.crm && (
                <button type="button" onClick={() => setPopup("campanhas")} className="btn btn-secundario btn-36 px-3 text-[12px] font-bold">
                  <Megaphone size={14} strokeWidth={1.8} aria-hidden />
                  Campanhas
                </button>
              )}
            </div>

            {!mods.crm ? (
              <p className="m-0 rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[13px] text-texto-2">
                Este cliente não usa o CRM, então não há landing page para ligar.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-borda-campo py-3 pl-4 pr-3.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-texto-3">CHAVE DE CAPTURA</span>
                    <code className="font-mono text-[13px] font-semibold [overflow-wrap:anywhere]">{chave ?? "…"}</code>
                  </span>
                  {chave && (
                    <span className="flex gap-2">
                      <BotaoCopiar texto={chave} rotulo="Copiar chave" copiado="Copiada" />
                      <button type="button" onClick={() => setPopup("script")} className="btn btn-primario btn-40 px-3 text-[12px] font-bold">
                        Ver script
                      </button>
                    </span>
                  )}
                </div>

                <div className="flex flex-col">
                  {!paginas ? (
                    <p className="m-0 py-4 text-[13px] text-texto-3">Procurando as páginas…</p>
                  ) : paginas.length === 0 ? (
                    <p className="m-0 py-4 text-[13px] text-texto-3">
                      Nenhuma página enviou lead nos últimos 30 dias. Cole o script na landing page para começar a receber.
                    </p>
                  ) : (
                    paginas.map((p) => <LinhaDePagina key={p.endereco} pagina={p} />)
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          {superAdmin && (
            <section className={`${CARTAO} gap-2.5`}>
              <div className="flex flex-col gap-1">
                <h2 className="m-0 text-[16px] font-bold">Módulos</h2>
                <span className="text-[12px] text-texto-3">Desligado aparece no menu do cliente com cadeado</span>
              </div>
              {MODULOS.map((m) => {
                const ligado = mods[m.id];
                // O último ligado não desliga: cliente sem módulo nenhum ficaria vazio.
                const ultimo = ligado && ligados === 1;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="switch"
                    aria-checked={ligado}
                    disabled={ultimo || alternar.isPending}
                    onClick={() => alternar.mutate(m.id)}
                    className={`flex min-h-[60px] items-center justify-between gap-3.5 rounded-[14px] border-[1.5px] px-3.5 py-2.5 text-left text-marinho transition-colors disabled:cursor-default ${
                      ligado ? "border-azul bg-azul-claro" : "border-borda bg-white hover:border-nevoa"
                    }`}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[14px] font-bold">{MODULO_LABEL[m.id]}</span>
                      <span className="text-[11px] text-texto-3">{ultimo ? "O cliente precisa de ao menos um módulo" : m.dica}</span>
                    </span>
                    <span
                      aria-hidden
                      className={`box-border flex h-6 w-11 flex-none items-center rounded-full p-0.5 ${
                        ligado ? "justify-end bg-azul" : "justify-start bg-nevoa-2"
                      }`}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          <section className={`${CARTAO} gap-2.5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-[16px] font-bold">Quem acessa</h2>
              <button type="button" onClick={() => setPopup("pessoa")} className="btn btn-secundario btn-36 px-3 text-[12px] font-bold">
                <Plus size={14} strokeWidth={2.2} aria-hidden />
                Adicionar pessoa
              </button>
            </div>
            {globais.map((g) => (
              <Pessoa key={g.user_id} email={g.email} nome={g.nome} de="OVERSO" papel="Super-admin" tom="super" />
            ))}
            {membros.map((m) => (
              <Pessoa
                key={m.user_id}
                email={m.email}
                nome={m.nome}
                de={base.nome}
                papel={m.papel === "admin" ? "Admin do cliente" : "Membro"}
                tom={m.papel === "admin" ? "admin" : "membro"}
                onRemover={() => revogar.mutate(m.user_id)}
                ocupado={revogar.isPending}
              />
            ))}
            {membros.length === 0 && (
              <p className="m-0 rounded-[12px] bg-superficie-2 px-3 py-3 text-[12px] text-texto-3">
                Ninguém do cliente com acesso ainda.
              </p>
            )}
            <span className="text-[11px] leading-normal text-texto-3">
              Membro trabalha leads e conteúdo. Admin do cliente também apaga lead e gerencia acessos.
            </span>
          </section>

          {superAdmin && (
            <section className="flex flex-col gap-2.5 rounded-[20px] border-[1.5px] border-[#F2C7C2] bg-white p-[22px]">
              <h2 className="m-0 text-[16px] font-bold text-erro-texto">Remover cliente</h2>
              <span className="text-[12px] leading-normal text-texto-2">
                Apaga leads, posts e acessos deste cliente. A landing page para de enviar leads. Não dá para desfazer.
              </span>
              <button
                type="button"
                onClick={() => setPopup("remover")}
                className="btn self-start border-[1.5px] border-erro bg-white px-4 font-bold text-erro-texto hover:bg-erro-fundo"
              >
                <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                Remover {base.nome}
              </button>
            </section>
          )}
        </div>
      </div>

      {popup === "dados" && perfil && (
        <EditarDadosModal perfil={perfil} podeRenomear={superAdmin} onFechar={() => setPopup(null)} onSalvo={recarregar} />
      )}
      {popup === "script" && chave && <ScriptModal nome={base.nome} chave={chave} onFechar={() => setPopup(null)} />}
      {popup === "pessoa" && <AdicionarPessoaModal clienteId={clienteId} nome={base.nome} onFechar={() => setPopup(null)} />}
      {popup === "campanhas" && <CampanhasModal clienteId={clienteId} nome={base.nome} onFechar={() => setPopup(null)} />}
      {popup === "remover" && (
        <RemoverClienteModal
          clienteId={clienteId}
          nome={base.nome}
          onFechar={() => setPopup(null)}
          onRemovido={async () => {
            await router.navigate({ to: "/clientes" });
            await recarregar();
            await qc.invalidateQueries({ queryKey: ["leads"] });
            await qc.invalidateQueries({ queryKey: ["conteudos"] });
          }}
        />
      )}
    </div>
  );
}

/** O dia de Brasília (AAAA-MM-DD) de um instante. */
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/* ── Logo ───────────────────────────────────────────────────────────── */

/** O logo do cliente com o botão de trocar. Sem logo, valem as iniciais. */
function Logo({ perfil, nome, onSalvo }: { perfil: PerfilCliente | undefined; nome: string; onSalvo: () => Promise<void> }) {
  const entrada = useRef<HTMLInputElement>(null);

  const trocar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (perfil) await enviarLogoCliente(perfil.id, arquivo, perfil.logo_caminho);
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Logo atualizado.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <span className="relative flex h-24 w-24 flex-none items-center justify-center rounded-[24px] bg-white text-[30px] font-extrabold text-azul">
      {perfil?.logo_url ? (
        <img src={perfil.logo_url} alt="" className="h-full w-full rounded-[24px] object-contain p-2" />
      ) : (
        iniciais(nome)
      )}
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_DE_LOGO}
        className="hidden"
        onChange={(e) => {
          const a = e.target.files?.[0];
          // Zera o input: escolher o mesmo arquivo de novo precisa disparar o evento.
          e.target.value = "";
          if (a) trocar.mutate(a);
        }}
      />
      <button
        type="button"
        aria-label="Trocar logo"
        title={trocar.isPending ? "Enviando…" : "Trocar logo"}
        disabled={!perfil || trocar.isPending}
        onClick={() => entrada.current?.click()}
        className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-[#1757A6] bg-white p-0 text-marinho transition-colors hover:bg-azul-claro focus-visible:outline-white disabled:opacity-70"
      >
        <Pencil size={14} strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}

/* ── Contato ────────────────────────────────────────────────────────── */

function Dado({ rotulo, href, children }: { rotulo: string; href?: string | undefined; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] bg-superficie-2 px-3.5 py-3">
      <span className="text-[11px] font-bold text-texto-3">{rotulo}</span>
      {!children ? (
        <span className="text-[14px] font-semibold text-texto-3">Não informado</span>
      ) : href ? (
        <a href={href} target="_blank" rel="noreferrer" className="link truncate text-[14px] font-bold">
          {children}
        </a>
      ) : (
        <span className="truncate text-[14px] font-bold">{children}</span>
      )}
    </div>
  );
}

/* ── Links úteis ────────────────────────────────────────────────────── */

function Links({ perfil, onSalvo }: { perfil: PerfilCliente; onSalvo: () => Promise<void> }) {
  const [adicionando, setAdicionando] = useState(false);
  const [rotulo, setRotulo] = useState("");
  const [url, setUrl] = useState("");
  const links = (perfil.links ?? []).filter((l) => l.url.trim());

  const salvar = useMutation({
    mutationFn: (novos: LinkCliente[]) =>
      salvarPerfilCliente(perfil.id, {
        contato_nome: perfil.contato_nome,
        contato_email: perfil.contato_email,
        contato_telefone: perfil.contato_telefone,
        observacoes: perfil.observacoes,
        links: novos,
      }),
    onSuccess: async () => {
      await onSalvo();
      setAdicionando(false);
      setRotulo("");
      setUrl("");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <section className={`${CARTAO} gap-3`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[16px] font-bold">Links úteis</h2>
        {!adicionando && (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="btn btn-36 border border-dashed border-azul-borda bg-azul-claro px-3 text-[12px] font-bold text-[#1A57A6] hover:bg-azul-claro-2"
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden />
            Adicionar link
          </button>
        )}
      </div>

      {adicionando && (
        <form
          className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-superficie-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const endereco = urlSegura(url);
            if (!endereco) return toast("Use um endereço que comece com http:// ou https://.", "error");
            salvar.mutate([...links, { rotulo: rotulo.trim(), url: endereco }]);
          }}
        >
          <input
            autoFocus
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            placeholder="Nome (Site, Instagram…)"
            aria-label="Nome do link"
            className="campo min-w-0 flex-[1_1_160px]"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            aria-label="Endereço do link"
            className="campo min-w-0 flex-[2_1_220px]"
          />
          <button type="submit" disabled={!url.trim() || salvar.isPending} className="btn btn-primario btn-40 font-bold">
            {salvar.isPending ? "Salvando…" : "Adicionar"}
          </button>
          <button type="button" onClick={() => setAdicionando(false)} className="btn btn-secundario btn-40 font-bold">
            Cancelar
          </button>
        </form>
      )}

      {links.length === 0 ? (
        !adicionando && (
          <p className="m-0 rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[13px] text-texto-3">
            Nenhum link ainda. Guarde aqui o site, o Instagram, a pasta de artes e o briefing.
          </p>
        )
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {links.map((l, i) => (
            <div key={`${l.url}-${i}`} className="card-clicavel flex min-h-14 min-w-0 items-center gap-1 rounded-[14px] pr-1.5">
              <a
                // Link antigo com protocolo estranho não vira clicável.
                href={urlSegura(l.url) ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] py-2.5 pl-3.5 text-marinho no-underline"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-azul-claro-2 text-azul">
                  <Link2 size={16} strokeWidth={2} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-bold">{l.rotulo || "Link"}</span>
                  <span className="truncate text-[12px] text-texto-3">{l.url.replace(/^https?:[/][/]/, "")}</span>
                </span>
                <ArrowUpRight size={16} strokeWidth={2} color="#55657A" aria-hidden className="flex-none" />
              </a>
              <button
                type="button"
                aria-label={`Remover o link ${l.rotulo || l.url}`}
                title="Remover link"
                disabled={salvar.isPending}
                onClick={() => salvar.mutate(links.filter((_, j) => j !== i))}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border-0 bg-transparent text-texto-3 transition-colors hover:bg-erro-fundo hover:text-erro-texto"
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Landing pages ──────────────────────────────────────────────────── */

/** "site.com.br/lp/harmonizacao-facial" vira "Harmonizacao facial". */
function nomeDaPagina(endereco: string): string {
  const partes = endereco.split("/").filter(Boolean);
  const ultima = (partes.length > 1 ? partes[partes.length - 1]! : "Página inicial").replace(/[-_]+/g, " ");
  return ultima.charAt(0).toUpperCase() + ultima.slice(1);
}

function LinhaDePagina({ pagina }: { pagina: LandingPage }) {
  const dias = Math.floor((Date.now() - new Date(pagina.ultimoLead).getTime()) / 864e5);
  const recebendo = dias < 2;
  return (
    <div className="grid min-h-14 grid-cols-1 items-center gap-x-3.5 gap-y-1.5 border-b border-gelo px-1 py-2 text-[13px] sm:grid-cols-[minmax(0,1.6fr)_1fr_1fr]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="truncate font-bold">{nomeDaPagina(pagina.endereco)}</strong>
        <span className="truncate text-[12px] text-texto-3">{pagina.endereco}</span>
      </span>
      <span className="text-texto-2">
        {pagina.leads.toLocaleString("pt-BR")} {pagina.leads === 1 ? "lead" : "leads"} em 30 dias
      </span>
      <span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${
            recebendo ? "bg-sucesso-fundo text-sucesso" : "bg-alerta-fundo text-alerta"
          }`}
        >
          <span className="h-[7px] w-[7px] flex-none rounded-full bg-current" />
          {recebendo ? "Recebendo" : `Sem leads há ${dias} dias`}
        </span>
      </span>
    </div>
  );
}

/* ── Quem acessa ────────────────────────────────────────────────────── */

const TOM_PESSOA = {
  super: { avatar: "bg-marinho text-white", selo: "bg-marinho text-white" },
  admin: { avatar: "bg-azul text-white", selo: "bg-azul-claro-2 text-[#1A57A6]" },
  membro: { avatar: "bg-azul-claro-2 text-[#1A57A6]", selo: "bg-[#ECEEF1] text-[#4A5868]" },
} as const;

function Pessoa({
  email,
  nome,
  de,
  papel,
  tom,
  onRemover,
  ocupado = false,
}: {
  email: string;
  /** Nome do cadastro (30_portal_novo.sql). Sem ele, a linha mostra o email. */
  nome?: string | null | undefined;
  de: string;
  papel: string;
  tom: keyof typeof TOM_PESSOA;
  /** Sem isto a linha não tem como ser removida (equipe OVERSO sai em Configurações). */
  onRemover?: (() => void) | undefined;
  ocupado?: boolean;
}) {
  const [armado, setArmado] = useState(false);
  // Desarma sozinho: um "Confirmar" esquecido na tela não pode ser clicado por engano depois.
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), 4000);
    return () => clearTimeout(t);
  }, [armado]);

  const usuario = email.split("@")[0] ?? email;
  return (
    <div className="flex min-h-[52px] items-center gap-3 rounded-[12px] bg-superficie-2 px-2.5 py-2">
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12px] font-bold ${TOM_PESSOA[tom].avatar}`}>
        {iniciais(nome || usuario.replace(/[._-]+/g, " "))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-bold" title={email}>
          {nome || email}
        </span>
        <span className="truncate text-[11px] text-texto-3">{de}</span>
      </span>
      {armado ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            setArmado(false);
            onRemover?.();
          }}
          className="btn btn-36 flex-none bg-erro px-3 text-[12px] font-bold text-white hover:bg-erro-texto"
        >
          Confirmar
        </button>
      ) : (
        <>
          <span className={`flex-none whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-bold ${TOM_PESSOA[tom].selo}`}>{papel}</span>
          {onRemover && (
            <button
              type="button"
              aria-label={`Remover o acesso de ${email}`}
              title="Remover acesso"
              onClick={() => setArmado(true)}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border-0 bg-transparent text-texto-3 transition-colors hover:bg-erro-fundo hover:text-erro-texto"
            >
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          )}
        </>
      )}
    </div>
  );
}
