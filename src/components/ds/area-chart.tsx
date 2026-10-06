import type { KeyboardEvent, MouseEvent } from "react";
import { useId, useState } from "react";

export type PontoArea = {
  /** Rótulo no eixo X ("22/09", "23"). */
  eixo: string;
  /** Título da dica ("Sex, 02 out"). */
  titulo: string;
  valor: number;
};

const W = 700;
const H = 180;
/** Folga no topo: o pico não encosta na borda do gráfico. */
const TOPO = 10;
/** Quantos rótulos cabem no eixo X sem encavalar. */
const MAX_ROTULOS = 15;

/** Teto "redondo" do eixo Y, divisível em 4 faixas: 19 vira 20, 130 vira 200. */
function tetoRedondo(maior: number): number {
  if (maior <= 4) return 4;
  for (let p = 1; ; p *= 10) {
    for (const passo of [1, 2, 2.5, 5]) {
      if (passo * p * 4 >= maior && Number.isInteger(passo * p)) return passo * p * 4;
    }
  }
}

/** Curva suave pelos pontos (Catmull-Rom convertida em Bézier), como no design. */
function curva(pts: [number, number][]): string {
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    // O y fica preso à área: a curva suave não pode mergulhar abaixo do zero.
    const y = (v: number) => Math.min(H, Math.max(0, v)).toFixed(1);
    d += ` C${c1x.toFixed(1)} ${y(c1y)} ${c2x.toFixed(1)} ${y(c2y)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Gráfico de área com dica. A dica segue o mouse; parada, fica no último
 * ponto (hoje). Pelo teclado, as setas andam entre os dias.
 */
export function AreaChart({
  pontos,
  unidade,
  descricao,
}: {
  pontos: PontoArea[];
  /** Texto do valor na dica: (19) => "19 leads". */
  unidade: (n: number) => string;
  /** O que o gráfico mostra, para leitor de tela. */
  descricao: string;
}) {
  const idGradiente = useId();
  const [sobre, setSobre] = useState<number | null>(null);

  if (pontos.length < 2) return null;

  const teto = tetoRedondo(Math.max(...pontos.map((p) => p.valor)));
  const xy = pontos.map((p, i): [number, number] => [
    (i * W) / (pontos.length - 1),
    H - (p.valor / teto) * (H - TOPO),
  ]);
  const linha = curva(xy);
  const area = `${linha} L${W} ${H} L0 ${H} Z`;

  const ativo = sobre ?? pontos.length - 1;
  const tipX = (xy[ativo]![0] / W) * 100;
  const tipY = (xy[ativo]![1] / H) * 100;
  // Perto da borda esquerda a dica vira para a direita, senão sai do card.
  const tipLado = tipX < 22 ? "translate(12%, -20%)" : "translate(-112%, -20%)";

  function mover(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const fracao = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setSobre(Math.round(fracao * (pontos.length - 1)));
  }

  function tecla(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const passo = e.key === "ArrowLeft" ? -1 : 1;
    setSobre(Math.min(pontos.length - 1, Math.max(0, ativo + passo)));
  }

  const pulo = Math.ceil(pontos.length / MAX_ROTULOS);
  const faixas = [4, 3, 2, 1, 0].map((n) => (teto / 4) * n);

  return (
    <div className="flex gap-3">
      <div className="flex h-[180px] min-w-[18px] flex-col justify-between text-right text-[11px] text-texto-3" aria-hidden="true">
        {faixas.map((n) => (
          <span key={n}>{n.toLocaleString("pt-BR")}</span>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div
          role="img"
          tabIndex={0}
          aria-label={`${descricao}. ${pontos[ativo]!.titulo}: ${unidade(pontos[ativo]!.valor)}. Use as setas para percorrer os dias.`}
          onMouseMove={mover}
          onMouseLeave={() => setSobre(null)}
          onKeyDown={tecla}
          onBlur={() => setSobre(null)}
          className="relative h-[180px] rounded-[4px]"
          style={{ backgroundImage: "linear-gradient(#EDF1F4 1px, transparent 1px)", backgroundSize: "100% 45px" }}
        >
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="block">
            <defs>
              <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1A66C2" stopOpacity="0.22" />
                <stop offset="1" stopColor="#1A66C2" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${idGradiente})`} />
            <path d={linha} fill="none" stroke="#1A66C2" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          </svg>

          <div
            className="pointer-events-none absolute bottom-0 -ml-px w-0.5 bg-azul opacity-35"
            style={{ left: `${tipX}%`, top: `${tipY}%` }}
          />
          <div
            className="pointer-events-none absolute -ml-[7px] -mt-[7px] h-3.5 w-3.5 rounded-full border-[3px] border-white bg-azul shadow-[0_2px_6px_rgba(28,46,69,0.25)]"
            style={{ left: `${tipX}%`, top: `${tipY}%` }}
          />
          <div
            className="pointer-events-none absolute z-[1] flex flex-col gap-1 whitespace-nowrap rounded-[12px] border border-borda bg-white px-3 py-2.5 shadow-[0_6px_18px_rgba(28,46,69,0.12)]"
            style={{ left: `${tipX}%`, top: `${tipY}%`, transform: tipLado }}
          >
            <span className="text-[11px] font-semibold text-texto-3">{pontos[ativo]!.titulo}</span>
            <span className="text-[15px] font-extrabold">{unidade(pontos[ativo]!.valor)}</span>
          </div>
        </div>

        {/* Cada rótulo fica sob o seu ponto; as pontas alinham nas bordas. */}
        <div className="relative h-4 text-[11px] text-texto-3" aria-hidden="true">
          {pontos.map((p, i) => {
            const ultimo = i === pontos.length - 1;
            // O último sempre aparece; os de perto dele cedem o lugar.
            if (!ultimo && (i % pulo !== 0 || pontos.length - 1 - i < pulo)) return null;
            return (
              <span
                key={i}
                className="absolute top-0 whitespace-nowrap"
                style={{
                  left: `${(i / (pontos.length - 1)) * 100}%`,
                  transform: i === 0 ? "none" : ultimo ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {p.eixo}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
