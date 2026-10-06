import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CheckCheck } from "lucide-react";
import { useState } from "react";

import { usePainel } from "@/components/painel";
import { COR_NOTIFICACAO, iconeDaNotificacao, useNotificacoes } from "@/components/shell/notificacoes-popover";
import { TopBar } from "@/components/shell/top-bar";
import type { Notificacao } from "@/lib/notificacoes";
import {
  alternarRegra,
  grupoDoDia,
  horaCurta,
  marcarComoLidas,
  quandoCurto,
  REGRAS_DE_AVISO,
  useRegrasDesligadas,
} from "@/lib/notificacoes";
import { modulosDe } from "@/lib/types";

export const Route = createFileRoute("/_authed/notificacoes")({ component: Notificacoes });

type Filtro = "todas" | "naolidas" | "crm" | "conteudo";

const GRUPOS = [
  { id: "hoje", rotulo: "HOJE" },
  { id: "ontem", rotulo: "ONTEM" },
  { id: "antes", rotulo: "ANTES" },
] as const;

/** Etiqueta do módulo: azul para CRM, verde-azulado para Conteúdo. */
const COR_MODULO = {
  CRM: { fundo: "#E3EEFA", texto: "#1A57A6" },
  CONTEÚDO: { fundo: "#E3F1F3", texto: "#1F5F6B" },
} as const;

/**
 * Central de notificações: o que precisa de alguém agir no cliente
 * escolhido, agrupado por dia, e as preferências de aviso ao lado.
 */
function Notificacoes() {
  const { projeto } = usePainel();
  const mods = modulosDe(projeto);
  const { todas, lidas, naoLidas } = useNotificacoes();
  const desligadas = useRegrasDesligadas();
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const doCrm = todas.filter((n) => n.modulo === "CRM");
  const doConteudo = todas.filter((n) => n.modulo === "CONTEÚDO");
  const visiveis =
    filtro === "naolidas" ? naoLidas : filtro === "crm" ? doCrm : filtro === "conteudo" ? doConteudo : todas;

  const abas: { id: Filtro; rotulo: string; n: number }[] = [
    { id: "todas", rotulo: "Todas", n: todas.length },
    { id: "naolidas", rotulo: "Não lidas", n: naoLidas.length },
    ...(mods.crm ? [{ id: "crm" as const, rotulo: "CRM", n: doCrm.length }] : []),
    ...(mods.conteudo ? [{ id: "conteudo" as const, rotulo: "Conteúdo", n: doConteudo.length }] : []),
  ];

  const grupos = GRUPOS.map((g) => ({ ...g, itens: visiveis.filter((n) => grupoDoDia(n.quando) === g.id) })).filter(
    (g) => g.itens.length > 0,
  );

  // Só as regras dos módulos que o cliente usa: avisar de post para quem não
  // tem Conteúdo seria um interruptor que não liga nada.
  const regras = REGRAS_DE_AVISO.filter((r) => mods[r.modulo]);

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Notificações"
        selo={naoLidas.length ? `${naoLidas.length} ${naoLidas.length === 1 ? "não lida" : "não lidas"}` : undefined}
        seloTom="erro"
        subtitulo={`O que precisa de alguém agir em ${projeto?.nome ?? "seu cliente"}`}
        acoes={
          <button
            type="button"
            onClick={() => marcarComoLidas(todas.map((n) => n.id))}
            disabled={naoLidas.length === 0}
            className="btn btn-secundario px-4"
          >
            <CheckCheck size={16} strokeWidth={2} aria-hidden />
            Marcar todas como lidas
          </button>
        }
      />

      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-0 flex-[2_1_562px] flex-col rounded-[20px] border border-borda bg-white">
          <div role="tablist" aria-label="Filtro" className="flex flex-wrap gap-x-[26px] gap-y-1 border-b border-borda px-[22px]">
            {abas.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={a.id === filtro}
                onClick={() => setFiltro(a.id)}
                className="aba flex min-h-[52px] items-center gap-2"
              >
                {a.rotulo}
                <span className="rounded-full bg-gelo px-[7px] py-0.5 text-[11px] font-bold text-texto-2">{a.n}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col px-[22px] pb-[18px] pt-2">
            {grupos.map((g) => (
              <div key={g.id} className="flex flex-col">
                <span className="pb-2 pt-4 text-[11px] font-bold tracking-[0.12em] text-texto-3">{g.rotulo}</span>
                {g.itens.map((n) => (
                  <ItemNotificacao key={n.id} n={n} lida={lidas.has(n.id)} />
                ))}
              </div>
            ))}
            {grupos.length === 0 && (
              <div className="px-5 py-12 text-center text-[14px] text-texto-3">
                {filtro === "naolidas" && todas.length > 0 ? "Nenhuma notificação por ler." : "Nada por aqui. Tudo em dia."}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-w-0 flex-[1_1_366px] flex-col gap-3.5 rounded-[20px] border border-borda bg-white p-[22px]">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-[16px] font-bold">Quando avisar</h2>
            <span className="text-[12px] text-texto-3">Escolha o que vira notificação para você</span>
          </div>

          {regras.map((r) => {
            const ligada = !desligadas.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                role="switch"
                aria-checked={ligada}
                onClick={() => alternarRegra(r.id)}
                className="flex min-h-14 items-center justify-between gap-3.5 rounded-[14px] border-0 bg-superficie-2 px-3.5 py-2.5 text-left text-marinho transition-colors hover:bg-gelo"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold">{r.rotulo}</span>
                  <span className="text-[11px] font-normal text-texto-3">{r.dica}</span>
                </span>
                <span
                  className={`box-border flex h-[22px] w-10 flex-none items-center rounded-full p-0.5 transition-colors ${
                    ligada ? "justify-end bg-azul" : "justify-start bg-nevoa-2"
                  }`}
                >
                  <span className="h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
                </span>
              </button>
            );
          })}

          <div className="flex flex-col gap-2.5 pt-1.5">
            <span className="text-[13px] font-bold">Onde avisar</span>
            <div className="flex flex-wrap gap-2">
              <Canal rotulo="No portal" ligado />
              <Canal rotulo="E-mail" />
              <Canal rotulo="WhatsApp" />
            </div>
            <span className="text-[11px] leading-normal text-texto-3">
              Por enquanto os avisos chegam só aqui no portal. E-mail e WhatsApp ainda não estão disponíveis.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function ItemNotificacao({ n, lida }: { n: Notificacao; lida: boolean }) {
  const icone = COR_NOTIFICACAO[n.tipo];
  const modulo = COR_MODULO[n.modulo];
  const etiqueta = "rounded-md px-[7px] py-0.5 text-[10px] font-bold tracking-[0.08em]";
  // Hoje basta a hora; de ontem para trás, "ontem" ou a data na frente dela.
  const quando = grupoDoDia(n.quando) === "antes" ? `${quandoCurto(n.quando)}, ${horaCurta(n.quando)}` : horaCurta(n.quando);

  return (
    <div className={`mb-2 flex items-start gap-3.5 rounded-[16px] border p-3.5 ${lida ? "border-borda bg-white" : "border-[#CFE0F5] bg-azul-claro"}`}>
      <span
        className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px]"
        style={{ background: icone.fundo, color: icone.texto }}
      >
        {iconeDaNotificacao(n.tipo, 20)}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={etiqueta} style={{ background: modulo.fundo, color: modulo.texto }}>
            {n.modulo}
          </span>
          {n.urgente && <span className={`${etiqueta} bg-erro-fundo text-erro-texto`}>URGENTE</span>}
          <span className="text-[12px] text-texto-3">{quando}</span>
        </div>
        <span className={`text-[14px] leading-[1.4] ${lida ? "font-semibold" : "font-bold"}`}>{n.titulo}</span>
        {n.detalhe && <span className="text-[13px] leading-[1.45] text-texto-2 [overflow-wrap:anywhere]">{n.detalhe}</span>}
        <div className="mt-1 flex flex-wrap gap-2">
          <Link
            to={n.para}
            search={n.busca ?? {}}
            onClick={() => marcarComoLidas([n.id])}
            className="btn btn-primario btn-36 px-3.5 font-bold"
          >
            {n.acao}
          </Link>
          {!lida && (
            <button type="button" onClick={() => marcarComoLidas([n.id])} className="btn btn-secundario btn-36">
              Marcar como lida
            </button>
          )}
        </div>
      </div>

      {!lida && <span aria-label="Não lida" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-azul" />}
    </div>
  );
}

/**
 * Canal de "Onde avisar". Só o portal funciona hoje, e ele não desliga
 * (seria desligar as notificações inteiras); os outros ficam à mostra,
 * travados, até existir o envio por trás.
 */
function Canal({ rotulo, ligado = false }: { rotulo: string; ligado?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      disabled
      title={ligado ? "Os avisos sempre aparecem no portal" : `${rotulo} ainda não está disponível`}
      className={`flex min-h-11 items-center gap-2 rounded-[12px] border-[1.5px] px-3.5 text-[13px] font-semibold ${
        ligado ? "border-azul bg-azul-claro text-marinho" : "border-borda bg-superficie-2 text-texto-4"
      }`}
    >
      <span
        className={`box-border flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] text-white ${
          ligado ? "border-azul bg-azul" : "border-nevoa-2 bg-white"
        }`}
      >
        {ligado && <Check size={12} strokeWidth={3.5} aria-hidden />}
      </span>
      {rotulo}
    </button>
  );
}
