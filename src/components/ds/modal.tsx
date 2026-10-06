import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

/**
 * Popup do design: cabeçalho em degradê profundo (ícone num círculo branco,
 * título, selo e uma linha de contexto), corpo que rola e rodapé de ações.
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
  largura = 900,
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
  /** Largura máxima em px (o design usa 900, 980 e 1040). */
  largura?: number;
  /** O corpo vem sem padding nem coluna: a tela monta o próprio miolo. */
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:py-10">
      <div className="modal-backdrop fixed inset-0 bg-[rgba(28,46,69,0.55)]" onClick={onFechar} aria-hidden="true" />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="modal-panel relative flex w-full flex-col rounded-[24px] bg-white text-marinho shadow-[var(--sombra-modal)] outline-none"
        style={{ maxWidth: largura }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-t-[24px] px-5 py-6 text-white sm:px-7"
          style={{ background: "var(--degrade-profundo)" }}
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-[60px] w-[60px] flex-none items-center justify-center rounded-full bg-white text-[20px] font-extrabold text-[#1A57A6]">
              {icone}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 id={idTitulo} className="m-0 text-[22px] font-extrabold leading-tight">
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

        {faixa}

        {livre ? children : <div className="flex flex-col gap-[22px] px-5 py-[22px] sm:px-7">{children}</div>}

        {rodape && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borda px-5 pb-[22px] pt-4 sm:px-7">
            {rodape}
          </div>
        )}
      </div>
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
    <ol aria-label="Etapas" className="m-0 flex list-none items-center gap-3 border-b border-borda px-5 py-4 sm:px-7">
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
