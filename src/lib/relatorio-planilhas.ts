/**
 * Importar planilhas no relatório mensal: lê os CSVs exportados do Google Ads
 * e do Meta Ads e preenche o rascunho do mês (lib/relatorios.ts), no lugar de
 * digitar campo a campo.
 *
 * Cada arquivo é reconhecido pelo cabeçalho, não pelo nome:
 *   Google · Relatório de campanha      campos do mês + tabela de campanhas
 *   Google · Informações do leilão      concorrentes
 *   Meta   · Campanhas                  campos do mês + tabela de campanhas
 *   Meta   · Posicionamento             tabela de posicionamentos
 *   Meta   · Idade e gênero             tabela de faixas etárias
 *
 * Os números saem no formato do formulário ("956,44", sem milhar) e os campos
 * calculados ficam vazios: o portal calcula ao salvar.
 */
import type { Linha, Rascunho } from "./relatorios";

export type Leitura = {
  arquivo: string;
  /** O que o arquivo é, para a tela: "Google Ads · Campanhas". */
  tipo: string | null;
  /** Mês do período do arquivo (AAAA-MM), quando dá para saber. */
  referencia: string | null;
  /** O que entrou: "2 campanhas, custo R$ 759,18". */
  resumo: string;
  avisos: string[];
  aplicar: ((r: Rascunho) => Rascunho) | null;
};

/* ── CSV ────────────────────────────────────────────────────────────── */

/** Separa as linhas e colunas, com aspas e quebras dentro de aspas. */
function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  // Separador: o que mais aparece na primeira linha com cara de cabeçalho.
  const amostra = t.split(/\r?\n/).slice(0, 6).join("\n");
  const sep = [",", ";", "\t"].map((s) => [s, amostra.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.map((l) => l.map((c) => c.trim())).filter((l) => l.some((c) => c && c !== "--"));
}

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Linha do cabeçalho: a primeira que tem todas as colunas pedidas. */
function acharCabecalho(linhas: string[][], precisa: string[]): number {
  return linhas.findIndex((l) => {
    const cols = l.map(sem);
    return precisa.every((p) => cols.includes(sem(p)));
  });
}

/** Lê a linha pelo nome da coluna (vários nomes possíveis, o primeiro que existir). */
function leitor(cabecalho: string[]) {
  const cols = cabecalho.map(sem);
  return (linha: string[], ...nomes: string[]) => {
    for (const n of nomes) {
      const i = cols.indexOf(sem(n));
      if (i >= 0) return (linha[i] ?? "").trim();
    }
    return "";
  };
}

/* ── Números ────────────────────────────────────────────────────────── */

/** Google exporta em português ("3.988", "95,29", "29,92%"). */
function numPt(t: string): number | null {
  const s = t.replace(/R\$|%|\s/g, "").replace(/^--$/, "");
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Meta exporta em inglês ("956.44", "3.263238"), sem separador de milhar. */
function numEn(t: string): number | null {
  const s = t.replace(/R\$|%|\s|,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Número no formato do formulário: vírgula decimal, sem milhar. */
function txt(n: number | null, casas = 2): string {
  if (n === null) return "";
  const r = Math.round(n * 10 ** casas) / 10 ** casas;
  return String(r).replace(".", ",");
}

const dinheiro = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const somar = (l: (number | null)[]) => l.reduce<number>((t, n) => t + (n ?? 0), 0);

const MESES: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
  julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

/** "1 de outubro de 2026 - 31 de outubro de 2026" → "2026-10". */
function referenciaPorExtenso(texto: string): string | null {
  const m = /\d{1,2}\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i.exec(sem(texto));
  return m && MESES[m[1]!] ? `${m[2]}-${MESES[m[1]!]}` : null;
}

/** "2026-10-01" → "2026-10". */
const referenciaIso = (texto: string) => (/^(\d{4})-(\d{2})-\d{2}/.exec(texto) ? texto.slice(0, 7) : null);

/** Mantém o "Nome curto" que a equipe já tinha dado à campanha (vem do mês anterior). */
function comRotulos(novas: Linha[], antigas: Linha[]): Linha[] {
  return novas.map((n) => ({ ...n, rotulo: n.rotulo || antigas.find((a) => a.nome === n.nome)?.rotulo || "" }));
}

/* ── Google Ads · Relatório de campanha ─────────────────────────────── */

function googleCampanhas(linhas: string[][], arquivo: string): Leitura | null {
  const h = acharCabecalho(linhas, ["Campanha", "Custo", "Impr."]);
  if (h < 0) return null;
  const col = leitor(linhas[h]!);
  const referencia = linhas.slice(0, h).map((l) => referenciaPorExtenso(l.join(" "))).find(Boolean) ?? null;

  const corpo = linhas.slice(h + 1);
  const campanhas = corpo.filter((l) => {
    const nome = col(l, "Campanha");
    return nome && !/^total/i.test(col(l, "Status da campanha")) && !/^total/i.test(nome);
  });
  // O total da conta já vem pronto no fim do arquivo; sem ele, soma as campanhas.
  const total = corpo.find((l) => /^total:\s*conta/i.test(l[0] ?? ""));
  const pegar = (nome: string) => (total ? numPt(col(total, nome)) : somar(campanhas.map((l) => numPt(col(l, nome)))));

  const custo = pegar("Custo");
  const impressoes = pegar("Impr.");
  const cliques = pegar("Cliques");
  const conversoes = pegar("Conversões");

  const linhasCampanha: Linha[] = campanhas.map((l) => {
    const orc = numPt(col(l, "Orçamento"));
    const tipo = sem(col(l, "Tipo de orçamento"));
    return {
      status: col(l, "Status da campanha") || col(l, "Status"),
      nome: col(l, "Campanha"),
      rotulo: "",
      orcamento: orc === null ? "" : `${dinheiro(orc)}${tipo.startsWith("diario") ? "/dia" : ""}`,
      impressoes: txt(numPt(col(l, "Impr.")), 0),
      cliques: txt(numPt(col(l, "Cliques")), 0),
      custo: txt(numPt(col(l, "Custo"))),
      conversoes: txt(numPt(col(l, "Conversões"))),
    };
  });

  const avisos: string[] = [];
  const limitadas = campanhas.filter((l) => /orcamento/.test(sem(col(l, "Motivos do status"))));
  if (limitadas.length) {
    avisos.push(`${limitadas.length} ${limitadas.length === 1 ? "campanha está limitada" : "campanhas estão limitadas"} pelo orçamento. Vale citar na observação.`);
  }

  return {
    arquivo,
    tipo: "Google Ads · Campanhas",
    referencia,
    resumo: `${campanhas.length} ${campanhas.length === 1 ? "campanha" : "campanhas"} · custo ${dinheiro(custo ?? 0)} · ${inteiro(conversoes ?? 0)} conversões`,
    avisos,
    aplicar: (r) => ({
      ...r,
      google: {
        ...r.google,
        ativo: true,
        campos: { ...r.google.campos, custo: txt(custo), impressoes: txt(impressoes, 0), cliques: txt(cliques, 0), conversoes: txt(conversoes), ctr: "", cpc: "", custoConversao: "", taxaConversao: "" },
        campanhas: comRotulos(linhasCampanha, r.google.campanhas),
      },
    }),
  };
}

/* ── Google Ads · Informações do leilão ─────────────────────────────── */

function googleLeilao(linhas: string[][], arquivo: string): Leitura | null {
  const h = linhas.findIndex((l) => l.map(sem).some((c) => c.startsWith("dominio de exibicao")));
  if (h < 0) return null;
  const col = leitor(linhas[h]!);
  const referencia = linhas.slice(0, h).map((l) => referenciaPorExtenso(l.join(" "))).find(Boolean) ?? null;
  const concorrentes: Linha[] = linhas
    .slice(h + 1)
    .filter((l) => col(l, "Domínio de exibição"))
    .map((l) => ({
      dominio: col(l, "Domínio de exibição"),
      parcela: col(l, "Parcela de impressões", "Parcela de impr."),
      sobreposicao: col(l, "Taxa de sobreposição"),
      posicaoSuperior: col(l, "Taxa de posição superior"),
      topoPagina: col(l, "Taxa de parte superior da página", "Taxa da parte superior da página"),
      primeiraPosicao: col(l, "Taxa de primeira posição na página", "Taxa da posição mais alta na página"),
      vitorias: col(l, "Parcela de superação"),
    }));
  return {
    arquivo,
    tipo: "Google Ads · Informações do leilão",
    referencia,
    resumo: `${concorrentes.length} ${concorrentes.length === 1 ? "domínio" : "domínios"} no leilão`,
    avisos: [],
    aplicar: (r) => ({ ...r, google: { ...r.google, ativo: true, concorrentes } }),
  };
}

/* ── Meta Ads ───────────────────────────────────────────────────────── */

/** "actions:offsite_conversion.fb_pixel_lead" → "leads". */
function oQueEResultado(indicador: string): string {
  const i = indicador.toLowerCase();
  if (/lead/.test(i)) return "leads";
  if (/messaging|conversation/.test(i)) return "conversas";
  if (/profile_visit|visita/.test(i)) return "visitas ao perfil";
  if (/landing_page_view/.test(i)) return "visualizações da página";
  if (/link_click/.test(i)) return "cliques no link";
  if (/follow|like/.test(i)) return "seguidores";
  if (/reach/.test(i)) return "pessoas alcançadas";
  if (/thruplay|video/.test(i)) return "visualizações do vídeo";
  if (/purchase/.test(i)) return "compras";
  if (/engagement/.test(i)) return "engajamentos";
  return "resultados";
}

function statusMeta(v: string): string {
  const s = sem(v);
  if (/^(active|ativ)/.test(s)) return "Ativa";
  if (/pause|paus|inactive|inativ/.test(s)) return "Pausada";
  if (/complet|conclu|not_delivering|encerr/.test(s)) return "Encerrada";
  return v;
}

function metaCampanhas(linhas: string[][], arquivo: string): Leitura | null {
  const h = acharCabecalho(linhas, ["Nome da campanha", "Valor gasto (BRL)"]);
  if (h < 0) return null;
  const cab = linhas[h]!.map(sem);
  // Exportação quebrada por posicionamento ou idade é outro tipo de arquivo.
  if (cab.includes("posicionamento") || cab.includes("idade")) return null;
  const col = leitor(linhas[h]!);
  const campanhas = linhas.slice(h + 1).filter((l) => col(l, "Nome da campanha"));
  const referencia = campanhas.map((l) => referenciaIso(col(l, "Início dos relatórios"))).find(Boolean) ?? null;

  const v = (l: string[], ...n: string[]) => numEn(col(l, ...n));
  const soma = (...n: string[]) => somar(campanhas.map((l) => v(l, ...n)));
  const porTipo = (tipo: string) => somar(campanhas.filter((l) => oQueEResultado(col(l, "Indicador de resultados")) === tipo).map((l) => v(l, "Resultados")));

  const gasto = soma("Valor gasto (BRL)");
  const alcance = soma("Alcance");
  const impressoes = soma("Impressões");

  const linhasCampanha: Linha[] = campanhas.map((l) => {
    const resultados = v(l, "Resultados");
    return {
      status: statusMeta(col(l, "Veiculação da campanha")),
      nome: col(l, "Nome da campanha"),
      rotulo: "",
      alcance: txt(v(l, "Alcance"), 0),
      impressoes: txt(v(l, "Impressões"), 0),
      // "Cliques (todos)", como o total da conta: a linha "Total (conta)" da
      // tabela soma as campanhas, e o CTR/CPC de cada uma sai daqui.
      cliques: txt(v(l, "Cliques (todos)"), 0),
      gasto: txt(v(l, "Valor gasto (BRL)")),
      resultados: resultados === null ? "" : `${inteiro(resultados)} ${oQueEResultado(col(l, "Indicador de resultados"))}`,
      custoResultado: txt(v(l, "Custo por resultados")),
      seguidores: txt(v(l, "Seguidores no Instagram"), 0),
    };
  });

  const avisos: string[] = [];
  if (campanhas.length > 1) {
    avisos.push("O alcance do mês é a soma das campanhas: a mesma pessoa pode ter sido contada mais de uma vez. Se tiver o alcance da conta, corrija na aba Meta ADS.");
  }
  const freq = alcance ? impressoes / alcance : 0;
  if (freq >= 3) avisos.push(`Frequência de ${txt(freq)}: cada pessoa viu o anúncio mais de 3 vezes. Vale citar na observação.`);

  const leads = porTipo("leads");
  return {
    arquivo,
    tipo: "Meta Ads · Campanhas",
    referencia,
    resumo: `${campanhas.length} ${campanhas.length === 1 ? "campanha" : "campanhas"} · gasto ${dinheiro(gasto)}${leads ? ` · ${inteiro(leads)} leads` : ""}`,
    avisos,
    aplicar: (r) => ({
      ...r,
      meta: {
        ...r.meta,
        ativo: true,
        campos: {
          ...r.meta.campos,
          gasto: txt(gasto),
          alcance: txt(alcance, 0),
          impressoes: txt(impressoes, 0),
          cliques: txt(soma("Cliques (todos)"), 0),
          cliquesLink: txt(soma("Cliques no link"), 0),
          visitasPerfil: txt(porTipo("visitas ao perfil") || null, 0),
          conversas: txt(porTipo("conversas") || null, 0),
          novosSeguidores: txt(soma("Seguidores no Instagram") || null, 0),
          frequencia: "",
          ctr: "",
          cpc: "",
          cpm: "",
        },
        campanhas: comRotulos(linhasCampanha, r.meta.campanhas),
      },
    }),
  };
}

function metaPosicionamentos(linhas: string[][], arquivo: string): Leitura | null {
  const h = acharCabecalho(linhas, ["Nome da campanha", "Posicionamento"]);
  if (h < 0) return null;
  const col = leitor(linhas[h]!);
  const corpo = linhas.slice(h + 1).filter((l) => col(l, "Posicionamento"));
  const v = (l: string[], ...n: string[]) => numEn(col(l, ...n));
  const posicionamentos: Linha[] = corpo.map((l) => ({
    campanha: col(l, "Nome da campanha"),
    posicionamento: [col(l, "Plataforma"), col(l, "Posicionamento")].filter(Boolean).join(" · "),
    gasto: txt(v(l, "Valor gasto (BRL)")),
    impressoes: txt(v(l, "Impressões"), 0),
    alcance: txt(v(l, "Alcance"), 0),
    resultados: txt(v(l, "Resultados"), 0),
    custoResultado: txt(v(l, "Custo por resultados")),
    seguidores: txt(v(l, "Seguidores no Instagram"), 0),
  }));
  return {
    arquivo,
    tipo: "Meta Ads · Posicionamentos",
    referencia: corpo.map((l) => referenciaIso(col(l, "Início dos relatórios"))).find(Boolean) ?? null,
    resumo: `${posicionamentos.length} posicionamentos`,
    avisos: [],
    aplicar: (r) => ({ ...r, meta: { ...r.meta, ativo: true, posicionamentos } }),
  };
}

function metaIdades(linhas: string[][], arquivo: string): Leitura | null {
  const h = acharCabecalho(linhas, ["Idade", "Gênero"]);
  if (h < 0) return null;
  const col = leitor(linhas[h]!);
  const corpo = linhas.slice(h + 1).filter((l) => col(l, "Idade"));
  const v = (l: string[], ...n: string[]) => numEn(col(l, ...n)) ?? 0;
  // Uma linha por faixa, com o gasto separado por gênero.
  const faixas = new Map<string, { impressoes: number; seguidores: number; feminino: number; masculino: number; naoIdentificado: number }>();
  for (const l of corpo) {
    const faixa = col(l, "Idade");
    const f = faixas.get(faixa) ?? { impressoes: 0, seguidores: 0, feminino: 0, masculino: 0, naoIdentificado: 0 };
    f.impressoes += v(l, "Impressões");
    f.seguidores += v(l, "Seguidores no Instagram");
    const g = sem(col(l, "Gênero"));
    const gasto = v(l, "Valor gasto (BRL)");
    if (/^(female|fem|mulher)/.test(g)) f.feminino += gasto;
    else if (/^(male|masc|homem)/.test(g)) f.masculino += gasto;
    else f.naoIdentificado += gasto;
    faixas.set(faixa, f);
  }
  const idades: Linha[] = [...faixas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([faixa, f]) => ({
      faixa,
      impressoes: txt(f.impressoes, 0),
      seguidores: txt(f.seguidores, 0),
      feminino: txt(f.feminino),
      masculino: txt(f.masculino),
      naoIdentificado: txt(f.naoIdentificado),
    }));
  return {
    arquivo,
    tipo: "Meta Ads · Idade e gênero",
    referencia: corpo.map((l) => referenciaIso(col(l, "Início dos relatórios"))).find(Boolean) ?? null,
    resumo: `${idades.length} faixas etárias`,
    avisos: [],
    aplicar: (r) => ({ ...r, meta: { ...r.meta, ativo: true, idades } }),
  };
}

/* ── Entrada ────────────────────────────────────────────────────────── */

const LEITORES = [googleCampanhas, googleLeilao, metaPosicionamentos, metaIdades, metaCampanhas];

/** Reconhece o arquivo e devolve o que ele traz. Não reconheceu: `aplicar` é null. */
export async function lerPlanilha(arquivo: File): Promise<Leitura> {
  if (!/\.(csv|txt)$/i.test(arquivo.name)) {
    return { arquivo: arquivo.name, tipo: null, referencia: null, resumo: "", avisos: ["Envie o arquivo em CSV. Na plataforma, exporte o relatório como CSV."], aplicar: null };
  }
  const linhas = lerCsv(await arquivo.text());
  for (const ler of LEITORES) {
    const r = ler(linhas, arquivo.name);
    if (r) return r;
  }
  return {
    arquivo: arquivo.name,
    tipo: null,
    referencia: null,
    resumo: "",
    avisos: ["Não reconheci esta planilha. Use o Relatório de campanha do Google Ads ou a exportação de campanhas do Meta Ads."],
    aplicar: null,
  };
}
