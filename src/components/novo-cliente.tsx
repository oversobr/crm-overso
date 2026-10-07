import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Info, Lock, Plus, Trash2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BotaoCopiar, DicasDeInstalacao, ScriptDaLanding } from "@/components/cliente-ficha-modais";
import { ModalColuna, ModalColunas, ModalDegrade, Stepper } from "@/components/ds/modal";
import { usePainel } from "@/components/painel";
import { enviarLogoCliente, TIPOS_DE_LOGO } from "@/lib/logo-cliente";
import { criarCliente, salvarPerfilCliente, type NovoCliente as ClienteCriado } from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { LinkCliente, Modulo } from "@/lib/types";
import { MODULO_LABEL } from "@/lib/types";
import { urlSegura } from "@/lib/url";
import { iniciais } from "@/lib/usuario";

/**
 * Cadastro de cliente em três passos, no popup horizontal: dados (em três
 * colunas), módulos e pronto (com o script da landing page). Só o nome é obrigatório. O cliente nasce no fim do passo
 * 2; contato, links, observações e logo são gravados logo em seguida, e uma
 * falha neles não desfaz o cadastro: dá para completar na ficha.
 */

const ETAPAS = ["Dados", "Módulos", "Pronto"];
const CONTEXTO = ["Quem é o cliente", "Escolha os módulos", "Cliente cadastrado"];

const MODULOS: { id: Modulo; descricao: string }[] = [
  { id: "crm", descricao: "Captura de leads da landing page, funil de conversão, leads parciais e exportação para Excel." },
  { id: "conteudo", descricao: "Calendário de posts, stories, reels e vídeos, com status, artes, aprovação e comentários do cliente." },
  { id: "eventos", descricao: "Eventos do cliente, cada um com quadro de demandas, materiais e posts de divulgação." },
];

type LinkEmEdicao = LinkCliente & { id: number };

export function NovoCliente({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const { trocarCliente } = usePainel();

  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [responsavel, setResponsavel] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [links, setLinks] = useState<LinkEmEdicao[]>([
    { id: 1, rotulo: "Site", url: "" },
    { id: 2, rotulo: "Instagram", url: "" },
  ]);
  const proximoId = useRef(3);
  const [observacoes, setObservacoes] = useState("");
  const [escolha, setEscolha] = useState<Record<Modulo, boolean>>({ crm: true, conteudo: true, eventos: false });
  const [criado, setCriado] = useState<(ClienteCriado & { modulos: Record<Modulo, boolean> }) | null>(null);
  // Banco sem o 20_modulos_cliente.sql: o cliente nasce com tudo ligado.
  const [semModulos, setSemModulos] = useState(false);

  const entradaLogo = useRef<HTMLInputElement>(null);
  const previaDoLogo = useMemo(() => (logo ? URL.createObjectURL(logo) : null), [logo]);
  useEffect(() => () => void (previaDoLogo && URL.revokeObjectURL(previaDoLogo)), [previaDoLogo]);

  /** Grava o que foi preenchido além do nome. Devolve o que não deu certo. */
  async function gravarExtras(id: string): Promise<string[]> {
    const falhas: string[] = [];
    // Só http e https entram: endereço com outro protocolo é descartado.
    const linksValidos = links.flatMap((l) => {
      const url = urlSegura(l.url);
      return url ? [{ rotulo: l.rotulo.trim(), url }] : [];
    });
    if (responsavel.trim() || telefone.trim() || email.trim() || observacoes.trim() || linksValidos.length) {
      try {
        await salvarPerfilCliente(id, {
          contato_nome: responsavel.trim() || null,
          contato_telefone: telefone.trim() || null,
          contato_email: email.trim() || null,
          observacoes: observacoes.trim() || null,
          links: linksValidos,
        });
      } catch {
        falhas.push("o contato, os links e as observações");
      }
    }
    if (logo) {
      try {
        await enviarLogoCliente(id, logo);
      } catch {
        falhas.push("o logo");
      }
    }
    return falhas;
  }

  async function concluir(novo: ClienteCriado, modulos: Record<Modulo, boolean>) {
    const falhas = await gravarExtras(novo.id);
    await qc.invalidateQueries({ queryKey: ["projects"] });
    await qc.invalidateQueries({ queryKey: ["projetos-gerenciaveis"] });
    setCriado({ ...novo, modulos });
    setPasso(2);
    if (falhas.length) toast(`Cliente criado, mas não consegui gravar ${falhas.join(" nem ")}. Complete na ficha do cliente.`, "error", 7000);
  }

  const criar = useMutation({
    mutationFn: async () => {
      try {
        const novo = await criarCliente(nome.trim(), escolha.crm, escolha.conteudo, escolha.eventos);
        await concluir(novo, escolha);
      } catch (e) {
        const cliente = (e as { cliente?: ClienteCriado }).cliente;
        if ((e as Error).message !== "MODULOS_INDISPONIVEIS" || !cliente) throw e;
        setSemModulos(true);
        await concluir(cliente, { crm: true, conteudo: true, eventos: false });
      }
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const marcados = MODULOS.filter((m) => escolha[m.id]);
  const nomeLimpo = nome.trim();

  const avatar = (
    <span
      className="box-border flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[3px] border-white text-[18px] font-extrabold text-white"
      style={{ background: "linear-gradient(135deg, #1A66C2 0%, #5C9DE6 100%)" }}
    >
      {previaDoLogo ? <img src={previaDoLogo} alt="" className="h-full w-full bg-white object-contain" /> : iniciais(nomeLimpo)}
    </span>
  );

  const rodape: ReactNode[] = [
    <>
      <button type="button" onClick={onFechar} className="btn btn-secundario px-[18px] font-bold">
        Cancelar
      </button>
      <button type="submit" form="novo-cliente-dados" disabled={!nomeLimpo} className="btn btn-primario px-[22px] font-bold">
        Continuar
        <ArrowRight size={16} strokeWidth={2} aria-hidden />
      </button>
    </>,
    <>
      <button type="button" onClick={() => setPasso(0)} disabled={criar.isPending} className="btn btn-secundario px-[18px] font-bold">
        <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        Voltar
      </button>
      <div className="flex flex-wrap items-center gap-3.5">
        <span className={`text-[12px] font-semibold ${marcados.length ? "text-texto-3" : "text-erro-texto"}`}>
          {marcados.length === 0
            ? "Escolha ao menos um módulo"
            : `${marcados.length} ${marcados.length === 1 ? "módulo selecionado" : "módulos selecionados"}`}
        </span>
        <button
          type="button"
          onClick={() => criar.mutate()}
          disabled={marcados.length === 0 || criar.isPending}
          className="btn btn-primario px-[22px] font-bold"
        >
          {criar.isPending ? "Criando…" : "Criar cliente"}
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </>,
    <>
      <button
        type="button"
        onClick={() => {
          onFechar();
          if (criado) void router.navigate({ to: "/clientes/$clienteId", params: { clienteId: criado.id } });
        }}
        className="btn btn-secundario px-[18px] font-bold"
      >
        Ver ficha do cliente
      </button>
      <button
        type="button"
        onClick={() => {
          if (!criado) return;
          onFechar();
          trocarCliente(criado.id);
          void router.navigate({ to: criado.modulos.crm ? "/" : criado.modulos.conteudo ? "/postagens" : "/eventos" });
        }}
        className="btn btn-primario px-[22px] font-bold"
      >
        Abrir cliente
        <ArrowRight size={16} strokeWidth={2} aria-hidden />
      </button>
    </>,
  ];

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      livre
      icone={passo === 0 ? <IconeNovoCliente /> : avatar}
      titulo={passo === 0 ? "Novo cliente" : nomeLimpo}
      selo={`Passo ${passo + 1} de 3`}
      contexto={CONTEXTO[passo]}
      faixa={<Stepper etapas={ETAPAS} atual={passo} />}
      rodape={rodape[passo]}
    >
      {passo === 0 && (
        <form
          id="novo-cliente-dados"
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (nomeLimpo) setPasso(1);
          }}
        >
          <ModalColunas colunas="340px minmax(0,1fr) minmax(0,1fr)">
            {/* Coluna 1: logo e nome, o único campo obrigatório */}
            <ModalColuna fundo>
              <div className="flex items-center gap-4">
                <input
                  ref={entradaLogo}
                  type="file"
                  accept={TIPOS_DE_LOGO}
                  className="hidden"
                  onChange={(e) => {
                    const a = e.target.files?.[0];
                    e.target.value = "";
                    if (a) setLogo(a);
                  }}
                />
                <button
                  type="button"
                  onClick={() => entradaLogo.current?.click()}
                  aria-label="Enviar logo do cliente"
                  className={`flex h-[104px] w-[104px] flex-none flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[22px] p-0 transition-colors ${
                    previaDoLogo
                      ? "border border-borda bg-white"
                      : "border-[1.5px] border-dashed border-azul-borda bg-azul-claro text-[#1A57A6] hover:bg-azul-claro-2"
                  }`}
                >
                  {previaDoLogo ? (
                    <img src={previaDoLogo} alt="" className="h-full w-full object-contain p-2" />
                  ) : (
                    <>
                      <Upload size={24} strokeWidth={1.8} aria-hidden />
                      <span className="text-[12px] font-bold">Enviar logo</span>
                    </>
                  )}
                </button>
                <span className="flex min-w-0 flex-col gap-1">
                  <strong className="text-[13px]">Logo</strong>
                  <span className="text-[11px] leading-[1.45] text-texto-3 [overflow-wrap:anywhere]">
                    {logo ? `${logo.name} · clique para trocar` : "PNG ou JPG, de preferência quadrada"}
                  </span>
                </span>
              </div>
              <label className="flex flex-col gap-2 text-[13px] font-bold">
                <span>
                  Nome do cliente <span className="text-erro-texto">*</span>
                </span>
                <input
                  autoFocus
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Clínica Delmo Sakabe"
                  className="campo min-h-12 text-[15px] font-semibold"
                />
              </label>
              <span className="flex items-start gap-2 rounded-[12px] bg-white p-3 text-[12px] leading-normal text-texto-2">
                <Info size={16} strokeWidth={2} color="#1A66C2" aria-hidden className="mt-px flex-none" />
                Só o nome é obrigatório. O resto dá para preencher agora ou depois, na ficha do cliente.
              </span>
            </ModalColuna>

            {/* Coluna 2: contato e observações */}
            <ModalColuna>
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="m-0 text-[14px] font-bold">Contato do cliente</h3>
                  <span className="rounded-md bg-gelo px-[7px] py-0.5 text-[10px] font-bold tracking-[0.08em] text-texto-3">OPCIONAL</span>
                </div>
                <label className="flex min-w-0 flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
                  Responsável
                  <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Nome de quem fala com a OVERSO" className="campo" />
                </label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
                    WhatsApp
                    <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" className="campo" />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
                    E-mail
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@cliente.com.br" className="campo" />
                  </label>
                </div>
              </section>
              <label className="flex flex-col gap-2 text-[14px] font-bold">
                <span className="flex items-center gap-2">
                  Observações
                  <span className="rounded-md bg-gelo px-[7px] py-0.5 text-[10px] font-bold tracking-[0.08em] text-texto-3">OPCIONAL</span>
                </span>
                <textarea
                  rows={5}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="O que foi combinado, tom de voz, restrições, datas importantes"
                  className="campo h-auto resize-none py-3 text-[13px] font-medium leading-normal"
                />
              </label>
            </ModalColuna>

            {/* Coluna 3: links úteis */}
            <ModalColuna className="!gap-2.5">
              <div className="flex items-center gap-2">
                <h3 className="m-0 text-[14px] font-bold">Links úteis</h3>
                <span className="rounded-md bg-gelo px-[7px] py-0.5 text-[10px] font-bold tracking-[0.08em] text-texto-3">OPCIONAL</span>
              </div>
              <span className="-mt-1 text-[11px] text-texto-3">Site, Instagram, pasta do Drive, landing pages</span>
              {links.map((l) => {
                const mudar = (parte: Partial<LinkCliente>) => setLinks((ls) => ls.map((x) => (x.id === l.id ? { ...x, ...parte } : x)));
                return (
                  <div key={l.id} className="grid flex-none grid-cols-[130px_minmax(0,1fr)_44px] gap-2">
                    <input
                      value={l.rotulo}
                      onChange={(e) => mudar({ rotulo: e.target.value })}
                      placeholder="Nome"
                      aria-label="Nome do link"
                      className="campo w-full px-3 font-semibold"
                    />
                    {/* type="text": "site.com.br" sem https:// é aceito e completado ao gravar. */}
                    <input
                      value={l.url}
                      onChange={(e) => mudar({ url: e.target.value })}
                      placeholder="https://"
                      aria-label={`Endereço do link ${l.rotulo}`}
                      inputMode="url"
                      className="campo w-full px-3"
                    />
                    <button
                      type="button"
                      onClick={() => setLinks((ls) => ls.filter((x) => x.id !== l.id))}
                      aria-label={`Remover link ${l.rotulo}`}
                      className="btn btn-secundario h-11 w-11 p-0 text-texto-3"
                    >
                      <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setLinks((ls) => [...ls, { id: proximoId.current++, rotulo: "", url: "" }])}
                className="btn btn-40 flex-none self-start border border-dashed border-azul-borda bg-azul-claro px-3 text-[12px] font-bold text-[#1A57A6] hover:bg-azul-claro-2"
              >
                <Plus size={14} strokeWidth={2.2} aria-hidden />
                Adicionar link
              </button>
            </ModalColuna>
          </ModalColunas>
        </form>
      )}

      {passo === 1 && (
        <div className="flex flex-col gap-[18px] px-5 py-[22px] sm:px-7">
          <p className="m-0 text-[15px] leading-normal">
            O que <strong className="font-extrabold">{nomeLimpo}</strong> vai usar? Dá para mudar depois.
          </p>
          <div role="group" aria-label="Módulos" className="grid gap-3.5 md:grid-cols-3">
            {MODULOS.map((m) => {
              const ligado = escolha[m.id];
              return (
                <button
                  key={m.id}
                  type="button"
                  role="checkbox"
                  aria-checked={ligado}
                  onClick={() => setEscolha((e) => ({ ...e, [m.id]: !e[m.id] }))}
                  className={`relative flex flex-col items-start gap-3 rounded-[18px] border-2 p-[22px] text-left text-marinho transition-colors md:min-h-[200px] ${
                    ligado ? "border-azul bg-azul-claro" : "border-borda-campo bg-white hover:border-nevoa"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute right-4 top-4 box-border flex h-6 w-6 items-center justify-center rounded-[7px] border-2 text-white ${
                      ligado ? "border-azul bg-azul" : "border-nevoa bg-white"
                    }`}
                  >
                    {ligado && <Check size={14} strokeWidth={3.5} />}
                  </span>
                  <span className={`flex h-12 w-12 items-center justify-center rounded-[14px] ${ligado ? "bg-azul text-white" : "bg-gelo text-texto-3"}`}>
                    <IconeModulo modulo={m.id} cheio={ligado} />
                  </span>
                  <span className="text-[18px] font-extrabold">{MODULO_LABEL[m.id]}</span>
                  <span className="text-[13px] leading-[1.55] text-texto-2">{m.descricao}</span>
                </button>
              );
            })}
          </div>
          <span className="flex items-center gap-2 rounded-[12px] bg-superficie-2 px-3 py-2.5 text-[12px] leading-[1.45] text-texto-2">
            <Lock size={16} strokeWidth={2} color="#55657A" aria-hidden className="flex-none" />
            Módulos não marcados continuam no menu do cliente, com cadeado.
          </span>
        </div>
      )}

      {passo === 2 && criado && (
        // Uma coluna só. O script fica com a altura que sobrar e rola por dentro;
        // em tela baixa ele para em 240px e é o miolo do popup que rola.
        <div className="flex flex-[1_0_auto] flex-col gap-4 px-5 py-[22px] sm:px-7">
          <div className="flex flex-none flex-wrap items-center gap-3.5 rounded-[16px] bg-sucesso-fundo px-4 py-3.5 text-sucesso">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-sucesso text-white">
              <Check size={18} strokeWidth={3} aria-hidden />
            </span>
            <span className="min-w-[min(200px,100%)] flex-1 text-[14px] leading-[1.45]">
              <strong className="font-extrabold">{criado.nome}</strong> foi cadastrado com {frase(criado.modulos)}.
            </span>
            <span className="flex gap-1.5">
              {MODULOS.filter((m) => criado.modulos[m.id]).map((m) => (
                <span key={m.id} className="rounded-lg bg-white px-2.5 py-[5px] text-[12px] font-bold">
                  {MODULO_LABEL[m.id]}
                </span>
              ))}
            </span>
          </div>

          {semModulos && (
            <p className="m-0 flex-none rounded-[12px] bg-alerta-fundo px-3 py-2.5 text-[12px] leading-[1.45] text-alerta">
              Os módulos ainda não foram ativados no banco (supabase/20_modulos_cliente.sql), então o cliente foi criado com CRM e
              Conteúdo ligados.
            </p>
          )}

          {criado.modulos.crm ? (
            <>
              <div className="flex flex-none flex-col gap-1">
                <h3 className="m-0 text-[16px] font-extrabold">Ligar a landing page</h3>
                <span className="text-[13px] text-texto-3">Cole o script abaixo na landing page do cliente para os leads caírem no CRM.</span>
              </div>
              <div className="grid flex-none gap-3 md:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-borda-campo bg-white pb-3.5 pl-4 pr-3.5 pt-3">
                  <span className="flex items-center justify-between gap-2.5">
                    <span className="text-[11px] font-bold tracking-[0.1em] text-texto-3">CHAVE DE CAPTURA</span>
                    <BotaoCopiar texto={criado.ingest_key} rotulo="Copiar chave" copiado="Copiada" />
                  </span>
                  <code className="font-mono text-[13px] font-semibold [overflow-wrap:anywhere]">{criado.ingest_key}</code>
                </div>
                <DicasDeInstalacao />
              </div>
              <ScriptDaLanding chave={criado.ingest_key} nome={criado.nome} largo />
            </>
          ) : (
            <p className="m-0 rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[13px] leading-normal text-texto-2">
              Este cliente não usa o CRM, então não há landing page para ligar. Os módulos dele já estão prontos para usar.
            </p>
          )}
        </div>
      )}
    </ModalDegrade>
  );
}

/** "os módulos CRM e Conteúdo", "o módulo CRM". */
function frase(modulos: Record<Modulo, boolean>): string {
  const nomes = MODULOS.filter((m) => modulos[m.id]).map((m) => MODULO_LABEL[m.id]);
  if (nomes.length === 1) return `o módulo ${nomes[0]}`;
  return `os módulos ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function IconeNovoCliente() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  );
}

/** Os ícones dos módulos como no design: preenchidos quando o módulo está marcado. */
function IconeModulo({ modulo, cheio }: { modulo: Modulo; cheio: boolean }) {
  const fill = cheio ? "#FFFFFF" : "none";
  const dentro = cheio ? "#1A66C2" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {modulo === "crm" && (
        <>
          <circle cx="9" cy="8" r="4" fill={fill} />
          <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7z" fill={fill} />
          <path d="M16 4.5a4 4 0 0 1 0 7M22 21c0-3-1.8-5.6-4.5-6.6" />
        </>
      )}
      {modulo === "conteudo" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" fill={fill} />
          <path d="M3 10h18" stroke={dentro} />
          <path d="M7 14h2M11 14h2M15 14h2M7 17.5h2M11 17.5h2" stroke={dentro} strokeWidth="2" />
          <path d="M8 3v4M16 3v4" />
        </>
      )}
      {modulo === "eventos" && (
        <>
          <path d="M4 4h12l-2 4 2 4H4z" fill={fill} />
          <path d="M4 21V4" />
        </>
      )}
    </svg>
  );
}
