import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MessageCircle, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { ModalColuna, ModalColunas, ModalDegrade, ModalFaixa } from "@/components/ds/modal";
import { chegouEm, horaDe, linkWhatsApp, nomeDoLead, paginaDoLead, respostasDe, telefoneBonito, valorDaResposta } from "@/lib/leads";
import {
  aberturaDoLeadQuery,
  anotarLead,
  atualizarStatus,
  excluirLead,
  notasDoLeadQuery,
} from "@/lib/queries";
import { COR_LEAD } from "@/lib/status";
import { toast } from "@/lib/toast";
import type { Lead, Status } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";
import { iniciais, useUsuario } from "@/lib/usuario";

/**
 * Identificadores de clique de anúncio. São tokens opacos e longuíssimos
 * (`fbclid=IwAR3x…`) que não dizem nada a quem lê: servem pra devolver a
 * conversão à plataforma depois. Continuam gravados no banco; na tela viram
 * o nome de quem trouxe o lead, com o token no title pra quem precisar copiar.
 */
const CLIQUE_ANUNCIO: Record<string, string> = { fbclid: "Meta", gclid: "Google Ads" };

/** UTMs na ordem do design; o que sobrar entra depois, em ordem alfabética. */
const ORDEM_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const FORA_DA_LISTA = new Set(["dispositivo", "sistema", "navegador", ...Object.keys(CLIQUE_ANUNCIO)]);

/**
 * Popup do lead, em três colunas: origem e jornada, respostas e contato,
 * anotações da equipe. O status fica numa faixa abaixo do cabeçalho. O status muda na tela e só vai para o
 * banco em "Salvar alterações"; a anotação é gravada na hora.
 */
export function LeadDetalhe({
  lead,
  onFechar,
  podeExcluir,
}: {
  /** null = fechado. */
  lead: Lead | null;
  onFechar: () => void;
  /** Só admin do cliente e super-admin apagam lead (a RLS confere de novo). */
  podeExcluir: boolean;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("novo");
  const [confirmando, setConfirmando] = useState(false);

  // Cada lead aberto começa do status gravado e com a exclusão desarmada.
  useEffect(() => {
    if (lead) setStatus(lead.status);
    setConfirmando(false);
  }, [lead?.id, lead?.status]);

  const salvar = useMutation({
    mutationFn: () => atualizarStatus(lead!.id, status),
    onSuccess: () => {
      toast("Status do lead atualizado.", "success");
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["leads-por-status"] });
      void qc.invalidateQueries({ queryKey: ["resumo-periodo"] });
      void qc.invalidateQueries({ queryKey: ["leads-novos"] });
      onFechar();
    },
    // Sem isto, uma recusa da RLS não aparecia em lugar nenhum.
    onError: (e) => toast((e as Error).message, "error"),
  });

  const excluir = useMutation({
    mutationFn: () => excluirLead(lead!.id),
    onSuccess: () => {
      toast("Lead excluído.", "success");
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["leads-por-status"] });
      void qc.invalidateQueries({ queryKey: ["resumo-periodo"] });
      void qc.invalidateQueries({ queryKey: ["leads-novos"] });
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  if (!lead) return null;

  const nome = nomeDoLead(lead);
  const pagina = paginaDoLead(lead.origem);
  const telefone = telefoneBonito(lead.whatsapp);
  const respostas = respostasDe(lead);
  const mudou = status !== lead.status;

  const dispositivo = [lead.utms.dispositivo, lead.utms.sistema, lead.utms.navegador].filter(Boolean).join(" · ");
  const anuncios = Object.entries(CLIQUE_ANUNCIO).filter(([chave]) => lead.utms[chave]);
  const utms = Object.entries(lead.utms)
    .filter(([k, v]) => !FORA_DA_LISTA.has(k) && v)
    .sort(([a], [b]) => {
      const [ia, ib] = [ORDEM_UTM.indexOf(a), ORDEM_UTM.indexOf(b)];
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });

  // Data, dispositivo (se houver), anúncio (se houver) e as UTMs, ou "direto" na falta delas.
  const celulasDeOrigem = 1 + (dispositivo ? 1 : 0) + (anuncios.length ? 1 : 0) + (utms.length || (anuncios.length ? 0 : 1));

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      livre
      icone={iniciais(lead.nome)}
      titulo={nome}
      selo={pagina ? `LP ${pagina}` : lead.completo ? undefined : "Parcial"}
      contexto={
        <>
          {telefone && (
            <span className="rounded-full border border-white/[0.24] bg-white/[0.16] px-[9px] py-[3px] font-bold">{telefone}</span>
          )}
          Chegou {chegouEm(lead.criado_em).replace(/^(Hoje|Ontem)/, (m) => m.toLowerCase())}
        </>
      }
      faixa={
        <ModalFaixa rotulo="Status">
          <div role="radiogroup" aria-label="Status do lead" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => {
              const cor = COR_LEAD[s];
              const marcado = s === status;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  onClick={() => setStatus(s)}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-[12px] border-[1.5px] px-2 text-[13px] font-bold transition-colors ${
                    marcado ? "" : "border-borda-campo bg-white text-texto-2 hover:border-borda-campo-hover"
                  }`}
                  style={marcado ? { background: cor.fundo, color: cor.texto, borderColor: cor.ponto } : undefined}
                >
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: cor.ponto }} />
                  {STATUS_LABEL[s]}
                </button>
              );
            })}
          </div>
        </ModalFaixa>
      }
      acoes={
        lead.whatsapp && (
          <a
            href={linkWhatsApp(lead.whatsapp)}
            target="_blank"
            rel="noreferrer"
            className="btn bg-white text-sucesso hover:bg-sucesso-fundo focus-visible:outline-white"
          >
            <MessageCircle size={18} strokeWidth={1.8} aria-hidden />
            Abrir WhatsApp
          </a>
        )
      }
      rodape={
        <>
          {podeExcluir ? (
            confirmando ? (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold text-erro-texto">Excluir para sempre?</span>
                <button
                  type="button"
                  onClick={() => excluir.mutate()}
                  disabled={excluir.isPending}
                  className="btn btn-40 bg-erro text-white hover:bg-erro-texto"
                >
                  {excluir.isPending ? "Excluindo…" : "Sim, excluir"}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} className="btn btn-secundario btn-40">
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="flex min-h-11 items-center gap-2 rounded-[12px] border-0 bg-transparent px-3 text-[13px] font-bold text-erro-texto transition-colors hover:bg-erro-fundo"
              >
                <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                Excluir lead
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2.5">
            <button type="button" onClick={onFechar} className="btn btn-secundario font-bold">
              Fechar
            </button>
            <button
              type="button"
              onClick={() => salvar.mutate()}
              disabled={!mudou || salvar.isPending}
              className="btn btn-primario px-5"
            >
              {salvar.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </>
      }
    >
      <ModalColunas colunas="minmax(0,1fr) minmax(0,1fr) 340px">
        <ModalColuna>
          <Secao titulo="Origem e campanha" nota="Lido da URL (UTMs)">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-borda bg-borda">
              <Origem rotulo="DATA">
                {new Date(lead.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </Origem>
              {dispositivo && <Origem rotulo="DISPOSITIVO">{dispositivo}</Origem>}
              {anuncios.length > 0 && (
                <Origem rotulo="ANÚNCIO" azul>
                  <span title={anuncios.map(([chave]) => `${chave}: ${lead.utms[chave]}`).join("\n")}>
                    {anuncios.map(([, rotulo]) => rotulo).join(" · ")}
                  </span>
                </Origem>
              )}
              {utms.map(([k, v]) => (
                <Origem key={k} rotulo={k.replace(/^utm_/, "").toUpperCase()} azul>
                  {String(v)}
                </Origem>
              ))}
              {utms.length === 0 && anuncios.length === 0 && <Origem rotulo="SOURCE">direto</Origem>}
              {/* Número ímpar de caixas: a última célula fica branca, não cinza. */}
              {celulasDeOrigem % 2 === 1 && <span className="bg-white" />}
            </div>
          </Secao>

          <Jornada lead={lead} />
        </ModalColuna>

        <ModalColuna>
          <Secao titulo="Respostas do formulário" nota="Definidas pela landing page">
            {respostas.length === 0 ? (
              <p className="m-0 rounded-[14px] border border-borda px-3.5 py-3 text-[13px] text-texto-3">
                Nenhuma resposta ainda.
              </p>
            ) : (
              <div className="flex flex-col overflow-hidden rounded-[14px] border border-borda">
                {respostas.map(([pergunta, valor]) => (
                  <div
                    key={pergunta}
                    className="grid gap-x-3 gap-y-1 border-b border-gelo px-3.5 py-3 text-[13px] last:border-b-0 sm:grid-cols-[170px_minmax(0,1fr)]"
                  >
                    <span className="font-semibold text-texto-3 [overflow-wrap:anywhere]">{pergunta}</span>
                    <span className="font-bold [overflow-wrap:anywhere]">{valorDaResposta(valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </Secao>

          <Secao titulo="Contato">
            <div className="grid gap-2 sm:grid-cols-2">
              <Caixa rotulo="WHATSAPP">{telefone ?? "Sem telefone"}</Caixa>
              <Caixa rotulo="LANDING PAGE">{pagina ?? "Não informada"}</Caixa>
              {lead.email && <Caixa rotulo="EMAIL">{lead.email}</Caixa>}
            </div>
          </Secao>
        </ModalColuna>

        <Anotacoes leadId={lead.id} />
      </ModalColunas>
    </ModalDegrade>
  );
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="m-0 text-[14px] font-bold">{titulo}</h3>
        {nota && <span className="text-[11px] text-texto-3">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Caixa({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] bg-superficie-2 px-3.5 py-3">
      <span className="text-[11px] font-bold text-texto-3">{rotulo}</span>
      <span className="text-[14px] font-bold [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

function Origem({ rotulo, azul = false, children }: { rotulo: string; azul?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-white px-3.5 py-3">
      <span className="text-[11px] font-bold tracking-[0.06em] text-texto-3">{rotulo}</span>
      <span className={`text-[13px] font-bold [overflow-wrap:anywhere] ${azul ? "text-[#1A57A6]" : ""}`}>{children}</span>
    </div>
  );
}

/** Abriu, começou, enviou: os três horários do formulário. */
function Jornada({ lead }: { lead: Lead }) {
  const { data: abertura } = useQuery(aberturaDoLeadQuery(lead.project_id, lead.session_id));

  const passos = [
    { rotulo: "Abriu", quando: abertura ?? null },
    { rotulo: "Começou", quando: lead.criado_em },
    { rotulo: "Enviou", quando: lead.completo ? (lead.completado_em ?? lead.criado_em) : null },
  ];

  const inicio = abertura ?? lead.criado_em;
  const minutos =
    lead.completo && lead.completado_em
      ? Math.max(0, Math.round((new Date(lead.completado_em).getTime() - new Date(inicio).getTime()) / 60000))
      : null;

  return (
    <Secao titulo="Jornada no formulário">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {passos.map((p, i) => (
          <div
            key={p.rotulo}
            className={`flex flex-col gap-1.5 rounded-[14px] border px-3.5 py-3 ${
              p.quando ? "border-[#CFE0F5] bg-azul-claro" : "border-dashed border-nevoa-2 bg-superficie-2"
            }`}
          >
            <span className={`flex items-center gap-2 text-[12px] font-bold ${p.quando ? "text-[#1A57A6]" : "text-texto-4"}`}>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white ${
                  p.quando ? "bg-azul" : "bg-nevoa"
                }`}
              >
                {i + 1}
              </span>
              {p.rotulo}
            </span>
            <span className={`text-[16px] font-extrabold ${p.quando ? "" : "text-texto-4"}`}>
              {p.quando ? horaDe(p.quando) : i === 0 ? "Sem registro" : "Não enviou"}
            </span>
          </div>
        ))}
      </div>
      <span className="text-[12px] text-texto-3">
        {!lead.completo
          ? `Lead parcial: começou o formulário e ainda não enviou${lead.parou_em ? `. Parou em "${lead.parou_em}"` : ""}. Se voltar e enviar, este cadastro é completado.`
          : minutos == null
            ? "Formulário enviado."
            : minutos < 1
              ? "Levou menos de um minuto entre abrir e enviar."
              : `Levou ${minutos} ${minutos === 1 ? "minuto" : "minutos"} entre abrir e enviar.`}
      </span>
    </Secao>
  );
}

/** Anotações internas da equipe sobre o lead. Gravadas na hora. */
function Anotacoes({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const usuario = useUsuario();
  const [rascunho, setRascunho] = useState("");
  const { data: notas = [], isLoading } = useQuery(notasDoLeadQuery(leadId));

  const anotar = useMutation({
    mutationFn: (texto: string) => anotarLead(leadId, usuario.id, texto),
    onSuccess: () => {
      setRascunho("");
      void qc.invalidateQueries({ queryKey: ["lead-notas", leadId] });
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  function enviar() {
    const texto = rascunho.trim();
    if (texto && !anotar.isPending) anotar.mutate(texto);
  }

  return (
    <ModalColuna
      aria-label="Anotações"
      fundo
      className="!gap-2.5"
      rodape={
        <div className="campo flex min-h-0 items-center gap-2 py-1 pl-3 pr-1">
          <label className="flex min-w-0 flex-1">
            <span className="sr-only">Escrever anotação</span>
            <input
              type="text"
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviar();
              }}
              placeholder="Escreva uma anotação"
              maxLength={2000}
              className="min-h-9 min-w-0 flex-1 border-0 bg-transparent text-[12px] text-marinho"
            />
          </label>
          <button
            type="button"
            onClick={enviar}
            disabled={!rascunho.trim() || anotar.isPending}
            aria-label="Salvar anotação"
            className="btn btn-primario h-9 !min-h-0 w-9 flex-none rounded-[10px] p-0"
          >
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      }
    >
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[14px] font-bold">Anotações da equipe</h3>
        <span className="rounded-full bg-azul-claro-2 px-2 py-0.5 text-[11px] font-bold text-[#1A57A6]">{notas.length}</span>
      </div>

      {!isLoading && notas.length === 0 && (
        <p className="m-0 text-[12px] leading-normal text-texto-3">
          Nenhuma anotação ainda. Registre aqui o que foi combinado com o lead: só a equipe vê.
        </p>
      )}

      {notas.map((n) => {
        // Anotação anterior ao 30_portal_novo.sql não tem o nome gravado: aí só dá para nomear a própria.
        const minha = n.user_id != null && n.user_id === usuario.id;
        const autor = minha ? usuario.nome || "Você" : n.autor_nome || "Equipe";
        return (
          <div key={n.id} className="flex gap-2.5">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-marinho text-[10px] font-bold text-white">
              {minha ? usuario.iniciais : n.autor_nome ? iniciais(n.autor_nome) : "EQ"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-[4px_12px_12px_12px] bg-white px-[11px] py-[9px]">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-[12px] font-bold">{autor}</span>
                <span className="text-[10px] text-texto-3">{chegouEm(n.criado_em)}</span>
              </span>
              <span className="whitespace-pre-wrap text-[12px] leading-[1.45] [overflow-wrap:anywhere]">{n.texto}</span>
            </div>
          </div>
        );
      })}
    </ModalColuna>
  );
}
