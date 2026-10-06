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

/* Peças do post usadas pelos dois popups (nova postagem e detalhes): a
   prévia de como ele sai na rede e o campo das artes. */

/** Formatos em pé (9:16). Feed e carrossel são 4:5; o que sobra fica quadrado. */
const VERTICAIS: Formato[] = ["reels", "story", "shorts", "tiktok"];
const RETRATO: Formato[] = ["post", "carrossel"];
/** Quantas artes um post aceita (o limite de um carrossel no Instagram é 20; 10 cobre o uso). */
export const MAX_ARTES = 10;

function proporcaoDo(formato: Formato): { altura: number; rotulo: string } {
  if (VERTICAIS.includes(formato)) return { altura: 400, rotulo: "9:16" };
  if (RETRATO.includes(formato)) return { altura: 390, rotulo: "4:5" };
  return { altura: 312, rotulo: "1:1" };
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
    <>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold">Prévia</span>
        <span className="rounded-full bg-white px-[9px] py-[3px] text-[11px] font-bold text-texto-2">
          {FORMATO_LABEL[formato]} · {rotulo}
        </span>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[18px] border border-borda bg-white">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-azul text-[11px] font-bold text-white">
            {iniciais(cliente)}
          </span>
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-[13px] font-bold">{cliente}</span>
            <span className="text-[11px] text-texto-3">{quando || "Sem data"}</span>
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
                <span className="absolute right-3 top-3 rounded-full bg-[rgba(28,46,69,0.6)] px-[9px] py-1 text-[11px] font-bold text-white">
                  {indice + 1}/{midias.length}
                </span>
                {/* As mesmas setas do popup de detalhes; dão a volta nas pontas. */}
                <button
                  type="button"
                  onClick={() => onAtivo((indice + midias.length - 1) % midias.length)}
                  aria-label="Arte anterior"
                  className="absolute left-2.5 top-1/2 -mt-5 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-marinho transition-colors hover:bg-white"
                >
                  <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onAtivo((indice + 1) % midias.length)}
                  aria-label="Próxima arte"
                  className="absolute right-2.5 top-1/2 -mt-5 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-marinho transition-colors hover:bg-white"
                >
                  <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 bg-gelo text-[12px] font-semibold text-texto-3"
            style={{ height: altura }}
          >
            <IconeImagem size={32} strokeWidth={1.6} aria-hidden />
            Nenhuma arte anexada
          </div>
        )}

        {varias && (
          <div className="flex justify-center gap-[5px] pt-2.5">
            {midias.map((m, i) => (
              <button
                key={m}
                type="button"
                onClick={() => onAtivo(i)}
                aria-label={`Ver arte ${i + 1}`}
                aria-pressed={i === indice}
                className={`h-1.5 w-1.5 rounded-full border-0 p-0 ${i === indice ? "bg-azul" : "bg-nevoa-2"}`}
              />
            ))}
          </div>
        )}

        <p className={`m-0 whitespace-pre-line px-3.5 pb-4 pt-3 text-[12px] leading-normal [overflow-wrap:anywhere] ${legenda ? "" : "text-texto-3"}`}>
          <strong className="font-bold text-marinho">{cliente}</strong>{" "}
          {legenda || "A legenda aparece aqui enquanto você escreve."}
        </p>
      </div>
    </>
  );
}

/**
 * As artes do post: a área de envio e as miniaturas, na ordem do carrossel.
 * Cada imagem sobe pro bucket assim que é escolhida ou solta na área. Tirar
 * uma miniatura só a tira do formulário; quem chama decide quando o arquivo
 * sai do bucket (depois de salvar, ou ao cancelar).
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

  return (
    <div className="flex flex-col gap-2.5">
      <span className="flex justify-between text-[13px] font-bold">
        Arte
        <span className="font-semibold text-texto-3">
          {midias.length} {midias.length === 1 ? "anexada" : "anexadas"}
        </span>
      </span>

      <button
        type="button"
        {...soltavel}
        onClick={() => input.current?.click()}
        disabled={cheio}
        className={`flex min-h-16 items-center gap-3.5 rounded-[16px] border-[1.5px] border-dashed px-4 py-2.5 text-left text-marinho transition-colors disabled:opacity-60 ${
          arrastando ? "border-azul bg-azul-claro-2" : "border-azul-borda bg-azul-claro hover:border-azul"
        }`}
      >
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] bg-white text-azul">
          {enviando > 0 ? (
            <LoaderCircle size={20} className="animate-spin" aria-hidden />
          ) : (
            <Upload size={20} strokeWidth={1.8} aria-hidden />
          )}
        </span>
        <span className="flex flex-col gap-[3px]">
          <span className="text-[14px] font-bold">
            {enviando > 0
              ? `Enviando ${enviando} ${enviando === 1 ? "arte" : "artes"}…`
              : cheio
                ? `Limite de ${MAX_ARTES} artes atingido`
                : "Arraste a arte ou clique para enviar"}
          </span>
          <span className="text-[12px] text-texto-3">
            JPG, PNG, WebP ou GIF, até {MAX_MIDIA_MB} MB cada. Vídeo e pasta do Drive vão pelo link abaixo.
          </span>
        </span>
      </button>

      {midias.length > 0 && (
        <div className="flex flex-wrap gap-2.5 pt-1">
          {midias.map((m, i) => (
            <div key={m} className="relative flex w-24 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onAtivo(i)}
                aria-label={`Ver arte ${i + 1} na prévia`}
                aria-pressed={i === ativo}
                className={`box-border flex h-24 w-24 items-center justify-center overflow-hidden rounded-[14px] border-[2.5px] bg-gelo p-0 text-texto-3 ${
                  i === ativo ? "border-azul" : "border-white"
                }`}
              >
                {urls[m] ? (
                  <img src={urls[m]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <LoaderCircle size={18} className="animate-spin" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(midias.filter((x) => x !== m));
                  onAtivo(0);
                }}
                aria-label={`Remover arte ${i + 1}`}
                className="absolute -right-2 -top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-white bg-marinho p-0 text-white transition-colors hover:bg-erro"
              >
                <X size={12} strokeWidth={3} aria-hidden />
              </button>
              <span className="truncate text-[11px] font-semibold text-texto-2">Arte {i + 1}</span>
            </div>
          ))}
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
