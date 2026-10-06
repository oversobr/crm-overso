export type Fatia = { rotulo: string; valor: number; cor: string };

/**
 * Reparte `barras` entre as fatias na proporção dos valores, pelo método do
 * maior resto: a soma dá sempre `barras`, e toda fatia com valor ganha ao
 * menos uma (senão um status com 1 lead em 500 sumiria do desenho).
 */
function repartir(valores: number[], barras: number): number[] {
  const total = valores.reduce((t, v) => t + v, 0);
  if (total <= 0) return valores.map(() => 0);

  const exato = valores.map((v) => (v / total) * barras);
  const partes = exato.map((e, i) => (valores[i]! > 0 ? Math.max(1, Math.floor(e)) : 0));
  let sobra = barras - partes.reduce((t, n) => t + n, 0);

  // Faltando: dá para quem ficou com o maior resto. Sobrando (o mínimo de 1
  // estourou a conta): tira de quem tem mais.
  const porResto = exato.map((e, i) => ({ i, resto: e - Math.floor(e) })).sort((a, b) => b.resto - a.resto);
  for (let k = 0; sobra > 0; k++, sobra--) partes[porResto[k % porResto.length]!.i]!++;
  while (sobra < 0) {
    const maior = partes.indexOf(Math.max(...partes));
    partes[maior]!--;
    sobra++;
  }
  return partes;
}

/**
 * Barras verticais coloridas por fatia: o desenho de "Leads por status" e
 * do mês em números. É decoração do total ao lado; quem lê a tela com leitor
 * recebe os números pela lista que vem embaixo (ListaStatus).
 */
export function SegmentedBars({ fatias, barras = 40 }: { fatias: Fatia[]; barras?: number }) {
  const partes = repartir(
    fatias.map((f) => f.valor),
    barras,
  );
  const cores = fatias.flatMap((f, i) => Array.from({ length: partes[i] ?? 0 }, () => f.cor));
  // Sem dado nenhum, o desenho continua lá, em cinza: mantém a altura do card.
  const desenho = cores.length ? cores : Array.from({ length: barras }, () => "#EDF1F4");

  return (
    <div className="flex h-16 gap-[3px]" aria-hidden="true">
      {desenho.map((cor, i) => (
        <div key={i} className="flex-1 rounded-full" style={{ background: cor }} />
      ))}
    </div>
  );
}

/** Linhas "bolinha, rótulo, número" que acompanham as barras. */
export function ListaStatus({ fatias }: { fatias: Fatia[] }) {
  return (
    <div className="flex flex-col gap-2">
      {fatias.map((f) => (
        <div key={f.rotulo} className="flex min-h-10 items-center gap-2.5 rounded-[12px] bg-superficie-2 px-3 text-[13px]">
          <span className="box-border h-3 w-3 flex-none rounded-full border-[3px]" style={{ borderColor: f.cor }} />
          <span className="flex-1 font-semibold">{f.rotulo}</span>
          <strong className="font-extrabold tabular-nums">{f.valor.toLocaleString("pt-BR")}</strong>
        </div>
      ))}
    </div>
  );
}
