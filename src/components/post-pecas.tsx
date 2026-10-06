import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Image as IconeImagem, LoaderCircle, Upload, X } from "lucide-react";
import type { DragEvent } from "react";
import { useRef, useState } from "react";

import { fmt, hhmm } from "@/lib/datas";
import { enviarMidia, MAX_MIDIA_MB, TIPOS_MIDIA, urlsMidiaQuery } from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Formato } from "@/lib/types";
import { FORMATO_LABEL } from "@/lib/types";
import { iniciais } from "@/lib/usuario";

/* Peças da coluna do meio do popup de postagem: a prévia de como o post sai
   na rede e, embaixo dela, o campo das artes. */

/** Formatos em pé (9:16). Feed e carrossel são 4:5; o que sobra fica quadrado. */
const VERTICAIS: Formato[] = ["reels", "story", "shorts", "tiktok"];
const RETRATO: Formato[] = ["post", "carrossel"];
/** Quantas artes um post aceita (o limite de um carrossel no Instagram é 20; 10 cobre o uso). */
export const MAX_ARTES = 10;

/**
 * A altura da prévia é a do design, e não a proporção exata: a coluna tem
 * 336px de largura, e um 9:16 de verdade teria 600px de altura. O rótulo diz
 * a proporção em que o post sai na rede.
 */
function proporcaoDo(formato: Formato): { altura: number; rotulo: string } {
  if (VERTICAIS.includes(formato)) return { altura: 320, rotulo: "9:16" };
  if (RETRATO.includes(formato)) return { altura: 290, rotulo: "4:5" };
  return { altura: 250, rotulo: "1:1" };
}

/** Links assinados das artes (bucket privado): um mapa caminho → URL. */
export function useUrlsDasArtes(midias: string[]) {
  const { data = {} } = useQuery(urlsMidiaQuery(midias));
  return data;
}

/** Como o post aparece na rede: cabeçalho do perfil, a arte e a legenda. */
export function PostPreview({
  cliente,
  data,
  hora,
  formato,
  midias,
  ativo,
  onAtivo,
  legenda,
}: {
  cliente: string;
  data: string;
  hora: string | null;
  formato: Formato;
  midias: string[];
  /** Índice da arte em exibição. */
  ativo: number;
  onAtivo: (i: number) => void;
  legenda: string | null;
}) {
  const urls = useUrlsDasArtes(midias);
  const { altura, rotulo } = proporcaoDo(formato);
  const indice = Math.min(ativo, Math.max(0, midias.length - 1));
  const atual = midias[indice];
  const varias = midias.length > 1;
  const quando = [data ? fmt(data, { day: "numeric", month: "short" }).replace(".", "").replace(" de ", " ") : null, hhmm(hora)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold">Prévia</span>
        <span className="rounded-full bg-gelo px-[9px] py-[3px] text-[11px] font-bold text-texto-2">
          {FORMATO_LABEL[formato]} · {rotulo}
        </span>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[16px] border border-borda bg-white">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-azul text-[10px] font-bold text-white">
            {iniciais(cliente)}
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-[12px] font-bold">{cliente}</span>
            <span className="text-[10px] text-texto-3">{quando || "Sem data"}</span>
          </span>
        </div>

        {atual ? (
          <div className="relative bg-gelo" style={{ height: altura }}>
            {urls[atual] ? (
              <img src={urls[atual]} alt={`Arte ${indice + 1}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-texto-3">
                <LoaderCircle size={24} className="animate-spin" aria-label="Carregando arte" />
              </div>
            )}
            {varias && (
              <>
                <span className="absolute right-2.5 top-2.5 rounded-full bg-[rgba(28,46,69,0.6)] px-[9px] py-1 text-[11px] font-bold text-white">
                  {indice + 1}/{midias.length}
                </span>
                {/* As mesmas setas do popup de detalhes; dão a volta nas pontas. */}
                <button
                  type="button"
                  onClick={() => onAtivo((indice + midias.length - 1) % midias.length)}
                  aria-label="Arte anterior"
                  className="absolute left-2.5 top-1/2 -mt-[18px] flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-marinho transition-colors hover:bg-white"
                >
                  <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onAtivo((indice + 1) % midias.length)}
                  aria-label="Próxima arte"
                  className="absolute right-2.5 top-1/2 -mt-[18px] flex h-9 w-9 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-marinho transition-colors hover:bg-white"
                >
                  <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
                </button>
                <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-[5px]">
                  {midias.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onAtivo(i)}
                      aria-label={`Ver arte ${i + 1}`}
                      aria-pressed={i === indice}
                      className={`h-1.5 w-1.5 rounded-full border-0 p-0 shadow-[0_0_0_1px_rgba(28,46,69,0.25)] ${i === indice ? "bg-azul" : "bg-white"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 bg-gelo text-[12px] font-semibold text-texto-3"
            style={{ height: altura }}
          >
            <IconeImagem size={30} strokeWidth={1.6} aria-hidden />
            Nenhuma arte anexada
          </div>
        )}

        {/* Três linhas: a legenda inteira está no campo ao lado; aqui é só o começo, como na rede. */}
        <p
          className={`m-0 line-clamp-3 whitespace-pre-line px-3 pb-3 pt-2.5 text-[12px] leading-normal [overflow-wrap:anywhere] ${legenda ? "" : "text-texto-3"}`}
        >
          <strong className="font-bold text-marinho">{cliente}</strong> {legenda || "A legenda aparece aqui enquanto você escreve."}
        </p>
      </div>
    </div>
  );
}

/**
 * As artes do post, na ordem do carrossel. Sem nenhuma, aparece a caixa
 * inteira de envio. Com alguma, só as miniaturas e, ao lado delas, um
 * quadrado tracejado do mesmo tamanho para enviar mais.
 *
 * Cada imagem sobe pro bucket assim que é escolhida ou solta. Tirar uma
 * miniatura só a tira do formulário; quem chama decide quando o arquivo sai
 * do bucket (depois de salvar, ou ao cancelar).
 */
export function CampoArtes({
  projectId,
  midias,
  onChange,
  ativo,
  onAtivo,
  enviando,
  setEnviando,
  onEnviada,
}: {
  projectId: string;
  midias: string[];
  onChange: (m: string[]) => void;
  ativo: number;
  onAtivo: (i: number) => void;
  /** Quantas ainda estão subindo: enquanto houver, salvar gravaria a lista sem elas. */
  enviando: number;
  setEnviando: (f: (n: number) => number) => void;
  /** Avisa cada caminho novo, pra quem chama poder limpar se a pessoa desistir. */
  onEnviada: (caminho: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const urls = useUrlsDasArtes(midias);
  const cheio = midias.length >= MAX_ARTES;

  async function enviar(arquivos: FileList | File[]) {
    const vagas = MAX_ARTES - midias.length;
    const lista = [...arquivos].slice(0, vagas);
    if (arquivos.length > vagas) toast(`Um post aceita até ${MAX_ARTES} artes. As que passaram disso ficaram de fora.`, "info");
    if (!lista.length) return;

    setEnviando((n) => n + lista.length);
    // Uma por vez: mantém a ordem em que foram escolhidas (a do carrossel).
    let atuais = midias;
    for (const arquivo of lista) {
      try {
        const caminho = await enviarMidia(projectId, arquivo);
        onEnviada(caminho);
        atuais = [...atuais, caminho];
        onChange(atuais);
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
  }

  const soltavel = {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      setArrastando(true);
    },
    onDragLeave: () => setArrastando(false),
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setArrastando(false);
      void enviar(e.dataTransfer.files);
    },
  };
  const tracejado = arrastando ? "border-azul bg-azul-claro-2" : "border-azul-borda bg-azul-claro hover:border-azul";
  const oQuePode = `JPG, PNG, WebP ou GIF, até ${MAX_MIDIA_MB} MB cada`;

  return (
    <div className="flex flex-col gap-2.5">
      <span className="flex justify-between text-[13px] font-bold">
        Arte
        <span className="font-semibold text-texto-3">
          {enviando > 0
            ? `Enviando ${enviando}…`
            : `${midias.length} ${midias.length === 1 ? "anexada" : "anexadas"}`}
        </span>
      </span>

      {midias.length === 0 ? (
        <button
          type="button"
          {...soltavel}
          onClick={() => input.current?.click()}
          className={`flex min-h-14 items-center gap-3 rounded-[14px] border-[1.5px] border-dashed px-3 py-2 text-left text-marinho transition-colors ${tracejado}`}
        >
          <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-white text-azul">
            {enviando > 0 ? <LoaderCircle size={18} className="animate-spin" aria-hidden /> : <Upload size={18} strokeWidth={1.8} aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-bold">{enviando > 0 ? "Enviando a arte…" : "Arraste ou clique para enviar"}</span>
            <span className="text-[11px] text-texto-3">{oQuePode}</span>
          </span>
        </button>
      ) : (
        <div className="flex flex-wrap gap-1.5 pt-1.5" {...soltavel}>
          {midias.map((m, i) => (
            <div key={m} className="relative flex">
              <button
                type="button"
                onClick={() => onAtivo(i)}
                aria-label={`Ver arte ${i + 1} na prévia`}
                aria-pressed={i === ativo}
                title={`Arte ${i + 1}`}
                className={`box-border flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-[12px] border-[2.5px] bg-gelo p-0 text-texto-3 ${
                  i === ativo ? "border-azul" : "border-transparent"
                }`}
              >
                {urls[m] ? <img src={urls[m]} alt="" className="h-full w-full object-cover" /> : <LoaderCircle size={16} className="animate-spin" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(midias.filter((x) => x !== m));
                  onAtivo(0);
                }}
                aria-label={`Remover arte ${i + 1}`}
                className="absolute -right-[7px] -top-[7px] flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-marinho p-0 text-white transition-colors hover:bg-erro"
              >
                <X size={10} strokeWidth={3} aria-hidden />
              </button>
            </div>
          ))}
          {!cheio && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-label="Enviar mais artes"
              title={`Arraste ou clique para enviar mais artes. ${oQuePode}.`}
              className={`box-border flex h-[60px] w-[60px] items-center justify-center rounded-[12px] border-[1.5px] border-dashed p-0 text-azul transition-colors ${tracejado}`}
            >
              {enviando > 0 ? <LoaderCircle size={20} className="animate-spin" aria-hidden /> : <Upload size={20} strokeWidth={1.8} aria-hidden />}
            </button>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={TIPOS_MIDIA.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void enviar(e.target.files);
          // Limpa pra permitir escolher o mesmo arquivo de novo.
          e.target.value = "";
        }}
      />
    </div>
  );
}
