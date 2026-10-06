import { Check, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

/**
 * Popup do design: horizontal, para ter o mínimo de rolagem. Cabeçalho em
 * degradê profundo (ícone num círculo branco, título, selo e uma linha de
 * contexto) e rodapé de ações ficam fixos; só o miolo rola.
 *
 * O popup nunca passa da altura da tela (100vh - 72px). O miolo pode ser:
 *  - colunas (<ModalColunas> com <ModalColuna>): cada coluna rola por dentro,
 *    e o popup em si não rola. É o formato dos popups grandes;
 *  - conteúdo corrido (o padrão): o miolo inteiro rola quando não cabe.
 *
 * Fecha no Esc e ao clicar fora; trava a rolagem do fundo enquanto aberto.
 */
export function ModalDegrade({
  aberto,
  onFechar,
  icone,
  titulo,
  selo,
  contexto,
  acoes,
  faixa,
  rodape,
  largura = 1320,
  livre = false,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** Ícone de 26px dentro do círculo branco. */
  icone: ReactNode;
  titulo: string;
  /** Pílula translúcida antes do contexto: o cliente, "Passo 1 de 3". */
  selo?: ReactNode;
  contexto?: ReactNode;
  /** Botões no cabeçalho, antes do fechar (ex.: Abrir WhatsApp). */
  acoes?: ReactNode;
  /** Entre o cabeçalho e o corpo, sem rolar junto: o Stepper. */
  faixa?: ReactNode;
  /** Botões do pé: Cancelar à esquerda, ação principal à direita. */
  rodape?: ReactNode;
  /** Largura máxima em px. O design usa 1320 nos popups em colunas; os de confirmação passam uma menor. */
  largura?: number;
  /** O miolo vem sem padding nem rolagem próprios: quem chama monta as colunas (<ModalColunas>). */
  livre?: boolean;
  children: ReactNode;
}) {
  const idTitulo = useId();
  const painel = useRef<HTMLDivElement>(null);

  // Em ref: quem chama costuma passar uma função nova a cada render, e o
  // efeito abaixo não pode rodar de novo por isso. Rodar de novo devolvia o
  // foco ao painel a cada tecla, tirando o cursor do campo em que se digitava.
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberto) return;
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") fechar.current();
    }
    document.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // O foco entra no popup: quem navega por teclado não fica na tela de trás.
    const tinhaFoco = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
      tinhaFoco?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 lg:px-[60px] lg:py-9">
      <div className="modal-backdrop fixed inset-0 bg-[rgba(28,46,69,0.55)]" onClick={onFechar} aria-hidden="true" />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="modal-panel relative flex max-h-[calc(100dvh-24px)] w-full flex-col rounded-[24px] bg-white text-marinho shadow-[var(--sombra-modal)] outline-none sm:max-h-[calc(100dvh-40px)] lg:max-h-[calc(100dvh-72px)]"
        style={{ maxWidth: largura }}
      >
        <div
          className="flex flex-none flex-wrap items-center justify-between gap-4 rounded-t-[24px] px-5 py-[18px] text-white sm:px-7"
          style={{ background: "var(--degrade-profundo)" }}
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white text-[16px] font-extrabold text-[#1A57A6] [&>svg]:h-[22px] [&>svg]:w-[22px]">
              {icone}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id={idTitulo} className="m-0 text-[20px] font-extrabold leading-tight">
                {titulo}
              </h2>
              {(selo || contexto) && (
                <span className="flex flex-wrap items-center gap-2 text-[13px] text-azul-claro-2">
                  {selo && (
                    <span className="rounded-full border border-white/[0.24] bg-white/[0.16] px-[9px] py-[3px] font-bold">
                      {selo}
                    </span>
                  )}
                  {contexto}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {acoes}
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] border-0 bg-white/[0.16] text-white transition-colors hover:bg-white/[0.28] focus-visible:outline-white"
            >
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        {faixa && <div className="flex-none">{faixa}</div>}

        {livre ? (
          // Mesmo sem padding próprio, o miolo fica dentro da altura do popup:
          // com <ModalColunas> são as colunas que rolam; sem elas, rola tudo.
          <div className={`rolagem-fina flex min-h-0 flex-1 flex-col overflow-y-auto ${rodape ? "" : "rounded-b-[24px]"}`}>{children}</div>
        ) : (
          <div className="rolagem-fina flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-5 py-[22px] sm:px-7">{children}</div>
        )}

        {rodape && (
          <div className="flex flex-none flex-wrap items-center justify-between gap-3 rounded-b-[24px] border-t border-borda px-5 py-3.5 sm:px-7 [&_.btn]:min-h-11">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O miolo em colunas dos popups grandes. No desktop cada coluna tem a altura
 * que sobrar e rola por dentro; abaixo de 1024px as colunas empilham e é o
 * miolo inteiro que rola, porque não há largura para três lado a lado.
 *
 * `colunas` é o grid-template-columns do desktop ("1fr 1.2fr 1fr").
 */
export function ModalColunas({ colunas, children, className = "" }: { colunas: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={`rolagem-fina grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:overflow-hidden lg:[grid-template-columns:var(--colunas)] ${className}`}
      style={{ "--colunas": colunas } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * Uma coluna do popup. O conteúdo rola por dentro; o `rodape` fica preso
 * embaixo, fora da rolagem: é onde vai o campo de escrever dos comentários
 * e das anotações.
 */
export function ModalColuna({
  children,
  rodape,
  fundo = false,
  className = "",
  ...resto
}: {
  children: ReactNode;
  rodape?: ReactNode;
  /** Fundo cinza claro, para a coluna que é apoio e não o assunto principal. */
  fundo?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col border-borda max-lg:border-b max-lg:last:border-b-0 lg:border-r lg:last:border-r-0 ${fundo ? "bg-superficie-2" : ""}`}
      {...resto}
    >
      <div className={`rolagem-fina flex min-h-0 flex-1 flex-col gap-[18px] px-5 py-5 sm:px-6 lg:overflow-y-auto [section:first-child>&]:sm:pl-7 ${className}`}>{children}</div>
      {rodape && <div className="flex-none px-5 pb-5 pt-1 sm:px-6">{rodape}</div>}
    </section>
  );
}

/**
 * Faixa de uma linha entre o cabeçalho e o miolo: o rótulo à esquerda e, ao
 * lado, o controle (status do lead, etapas do post). Vai na prop `faixa`.
 */
export function ModalFaixa({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-x-3 gap-y-2 border-b border-borda px-5 py-3.5 sm:px-7 md:grid-cols-[90px_minmax(0,1fr)]">
      <span className="text-[13px] font-bold">{rotulo}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Etapas numeradas de um fluxo (cadastro de cliente): feita com check azul
 * claro, atual em azul cheio, as próximas em cinza. A linha entre duas
 * etapas pinta de azul quando a de trás já foi feita.
 */
export function Stepper({ etapas, atual }: { etapas: string[]; atual: number }) {
  return (
    <ol aria-label="Etapas" className="m-0 flex list-none items-center gap-3 border-b border-borda px-5 py-3 sm:px-7">
      {etapas.map((nome, i) => {
        const feita = i < atual;
        const agora = i === atual;
        return (
          <li key={nome} className="contents">
            {i > 0 && (
              <span aria-hidden="true" className={`h-0.5 flex-1 rounded-full ${i <= atual ? "bg-azul" : "bg-borda-campo"}`} />
            )}
            <span
              aria-current={agora ? "step" : undefined}
              className={`flex items-center gap-2.5 text-[13px] ${
                agora ? "font-bold text-marinho" : feita ? "font-semibold text-texto-2" : "font-semibold text-texto-3"
              }`}
            >
              <span
                className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${
                  agora ? "bg-azul text-white" : feita ? "bg-azul-claro-2 text-azul" : "bg-gelo text-texto-3"
                }`}
              >
                {feita ? <Check size={14} strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className="hidden sm:inline">{nome}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Etapas clicáveis em grade (as 5 do post: ideia até publicado). Diferente
 * do Stepper, aqui cada etapa é um botão: clicar move o post para ela.
 */
export function StepperBotoes<T extends string>({
  etapas,
  atual,
  onChange,
  rotulo,
  disabled = false,
}: {
  /** `cor` é a do status da etapa: pinta só a etapa atual. */
  etapas: { id: T; rotulo: string; cor: { fundo: string; texto: string; ponto: string } }[];
  atual: T;
  onChange: (id: T) => void;
  rotulo: string;
  disabled?: boolean;
}) {
  const iAtual = etapas.findIndex((e) => e.id === atual);
  return (
    <ol
      aria-label={rotulo}
      className="m-0 grid list-none gap-2 p-0"
      style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}
    >
      {etapas.map((e, i) => {
        const agora = i === iAtual;
        const feita = i < iAtual;
        return (
          <li key={e.id} className="flex">
            <button
              type="button"
              onClick={() => onChange(e.id)}
              disabled={disabled}
              aria-current={agora ? "step" : undefined}
              className={`flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[12px] border-[1.5px] text-[13px] font-bold transition-colors ${
                agora
                  ? ""
                  : feita
                    ? "border-borda bg-superficie-2 text-texto-2 hover:border-borda-campo-hover"
                    : "border-borda bg-white text-texto-3 hover:border-borda-campo-hover hover:text-marinho"
              }`}
              style={agora ? { background: e.cor.fundo, color: e.cor.texto, borderColor: e.cor.ponto } : undefined}
            >
              {/* Feita leva o check; a atual e as próximas, a bolinha da cor do status. */}
              {feita ? (
                <Check size={14} strokeWidth={3} aria-hidden className="shrink-0" />
              ) : (
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: e.cor.ponto }} />
              )}
              <span className="truncate">{e.rotulo}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
