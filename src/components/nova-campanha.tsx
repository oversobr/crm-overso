import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Info, Megaphone } from "lucide-react";
import { useState } from "react";

import { periodoDaCampanha, prazoDaCampanha } from "@/components/ds/campaign-selector";
import { ModalDegrade } from "@/components/ds/modal";
import { CampanhaBadge } from "@/components/ds/status-badge";
import { deYmd, somarDias, ymd } from "@/lib/datas";
import { paginaDoLead } from "@/lib/leads";
import { criarCampanha, paginasDoClienteQuery } from "@/lib/queries";
import { statusDaCampanha } from "@/lib/status";
import { toast } from "@/lib/toast";
import type { Campaign, Project, RegraCampanha } from "@/lib/types";

/** As seis cores do design, na ordem em que aparecem. */
const CORES: { hex: string; nome: string }[] = [
  { hex: "#1A66C2", nome: "Azul" },
  { hex: "#1C2E45", nome: "Marinho" },
  { hex: "#2A8C9C", nome: "Verde-azulado" },
  { hex: "#D98A1C", nome: "Laranja" },
  { hex: "#8A4FC0", nome: "Roxo" },
  { hex: "#6B7682", nome: "Cinza" },
];

const ATALHOS = [
  { id: "7", rotulo: "7 dias" },
  { id: "15", rotulo: "15 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "mes", rotulo: "Mês inteiro" },
] as const;
type Atalho = (typeof ATALHOS)[number]["id"];

const REGRAS: { id: RegraCampanha; titulo: string; texto: string }[] = [
  { id: "data", titulo: "Pela data e landing page", texto: "Todo lead que chegar nas páginas escolhidas dentro do período." },
  {
    id: "utm",
    titulo: "Pelo UTM da campanha",
    texto: "Só leads cuja URL tenha o utm_campaign definido. Bom para separar anúncios.",
  },
];

const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const ultimoDiaDoMes = (dia: string) => ymd(new Date(deYmd(dia).getFullYear(), deYmd(dia).getMonth() + 1, 0));
const diasEntre = (a: string, b: string) => Math.round((deYmd(b).getTime() - deYmd(a).getTime()) / 864e5);

/** "1.500,00" ou "R$ 1500" viram 1500; vazio ou lixo viram null. */
function reaisParaNumero(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Popup "Nova campanha": um período de captação que separa os leads, com
 * as landing pages, a regra (pela data ou pelo UTM), meta, investimento e cor.
 * À direita, como ela vai aparecer no seletor de campanha.
 */
export function NovaCampanha({
  projeto,
  campanhas,
  onFechar,
  onCriada,
}: {
  projeto: Project;
  /** As que o cliente já tem: a primeira cor ainda livre vem escolhida. */
  campanhas: Campaign[];
  onFechar: () => void;
  onCriada?: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const hoje = ymd(new Date());
  const { data: paginas = [] } = useQuery(paginasDoClienteQuery(projeto.id));

  const [nome, setNome] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(somarDias(hoje, 29));
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [regra, setRegra] = useState<RegraCampanha>("data");
  const [utm, setUtm] = useState("");
  const [meta, setMeta] = useState("");
  const [investimento, setInvestimento] = useState("");
  const [cor, setCor] = useState(() => {
    const usadas = new Set(campanhas.map((c) => c.cor?.toUpperCase()));
    return (CORES.find((c) => !usadas.has(c.hex)) ?? CORES[0]!).hex;
  });

  // O atalho aceso é o que bate com as datas, e não um estado à parte:
  // mexer na data à mão apaga o atalho sozinho.
  const atalhoAtivo: Atalho | null =
    !inicio || !fim
      ? null
      : inicio === `${inicio.slice(0, 7)}-01` && fim === ultimoDiaDoMes(inicio)
        ? "mes"
        : ((["7", "15", "30"] as const).find((n) => fim === somarDias(inicio, Number(n) - 1)) ?? null);

  function aplicarAtalho(a: Atalho) {
    const base = inicio || hoje;
    if (a === "mes") {
      setInicio(`${base.slice(0, 7)}-01`);
      setFim(ultimoDiaDoMes(base));
    } else {
      setInicio(base);
      setFim(somarDias(base, Number(a) - 1));
    }
  }

  const datasValidas = Boolean(inicio && fim && fim >= inicio);
  const utmLimpo = utm.trim();
  const valido = Boolean(nome.trim()) && datasValidas && (regra === "data" || Boolean(utmLimpo));
  const metaNumero = Number.parseInt(meta, 10);
  const metaValida = Number.isFinite(metaNumero) && metaNumero > 0 ? metaNumero : null;

  const criar = useMutation({
    mutationFn: () =>
      criarCampanha(
        projeto.id,
        { nome: nome.trim(), inicio, fim, meta_leads: metaValida },
        {
          cor,
          investimento: reaisParaNumero(investimento),
          regra,
          utm_campaign: regra === "utm" ? utmLimpo : null,
          landing_pages: escolhidas.length ? escolhidas : null,
        },
      ),
    onSuccess: async ({ id, extrasGravados }) => {
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      // A campanha mexe em quais leads são de quem: os números mudam.
      for (const chave of ["leads", "leads-por-status", "resumo-periodo", "serie", "funil", "fonte"]) {
        void qc.invalidateQueries({ queryKey: [chave] });
      }
      if (extrasGravados) {
        toast("Campanha criada.");
      } else {
        // O banco ainda não guarda os campos novos: diz isso em vez de fingir.
        toast(
          "Campanha criada com nome, período e meta. Cor, landing pages, regra por UTM e investimento ainda não são gravados neste banco.",
          "info",
          9000,
        );
      }
      onCriada?.(id);
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  /* ── Prévia ── */
  const rascunho = { inicio: inicio || null, fim: datasValidas ? fim : null };
  const nomesDasPaginas = escolhidas.map((p) => paginaDoLead(`https://${p}`) ?? p);
  const ondeChegam = nomesDasPaginas.length ? nomesDasPaginas.join(", ") : "todas as landing pages";
  const intervalo = datasValidas ? `entre ${ddmm(inicio)} e ${ddmm(fim)}` : "no período escolhido";
  const textoDaRegra =
    regra === "data"
      ? `Entram os leads de ${ondeChegam} que chegarem ${intervalo}.`
      : `Entram os leads de ${ondeChegam} com utm_campaign igual a ${utmLimpo || "(defina o valor)"}, ${intervalo}.`;
  const duracao = datasValidas ? diasEntre(inicio, fim) + 1 : null;

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      livre
      largura={1040}
      icone={<Megaphone size={26} strokeWidth={1.8} aria-hidden />}
      titulo="Nova campanha"
      selo={projeto.nome}
      contexto="Um período de captação para separar os leads"
      rodape={
        <>
          <button type="button" onClick={onFechar} className="btn btn-secundario min-h-[46px] font-bold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => criar.mutate()}
            disabled={!valido || criar.isPending}
            className="btn btn-primario min-h-[46px] px-[22px]"
          >
            {criar.isPending ? "Criando…" : "Criar campanha"}
            <ArrowRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </>
      }
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5 px-5 py-[22px] sm:px-7">
          <label className="flex flex-col gap-2 text-[13px] font-bold">
            <span>
              Nome da campanha <span className="text-erro-texto">*</span>
            </span>
            <input
              type="text"
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Harmonização Outubro"
              className="campo min-h-12 text-[15px] font-semibold"
            />
          </label>

          <section className="flex flex-col gap-2.5">
            <span className="text-[13px] font-bold">
              Período de captação <span className="text-erro-texto">*</span>
            </span>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
                Começa em
                <input
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="campo min-h-[46px] px-3 font-semibold"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
                Termina em
                <input
                  type="date"
                  value={fim}
                  min={inicio || undefined}
                  onChange={(e) => setFim(e.target.value)}
                  aria-invalid={Boolean(inicio && fim && fim < inicio)}
                  className="campo min-h-[46px] px-3 font-semibold"
                />
              </label>
            </div>
            {inicio && fim && fim < inicio && (
              <span className="text-[11px] font-semibold text-erro-texto">A campanha não pode terminar antes de começar.</span>
            )}
            <div className="flex flex-wrap gap-2">
              {ATALHOS.map((a) => {
                const aceso = atalhoAtivo === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => aplicarAtalho(a.id)}
                    aria-pressed={aceso}
                    className={`min-h-9 rounded-full border-[1.5px] px-3 text-[12px] font-bold transition-colors ${
                      aceso
                        ? "border-azul bg-azul-claro-2 text-[#1A57A6]"
                        : "border-borda-campo bg-white text-texto-2 hover:border-borda-campo-hover"
                    }`}
                  >
                    {a.rotulo}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-bold">Landing pages da campanha</span>
              <span className="text-[11px] text-texto-3">{paginas.length ? "Escolha uma ou mais" : ""}</span>
            </div>
            {paginas.length === 0 ? (
              <p className="m-0 rounded-[12px] bg-superficie-2 px-3.5 py-3 text-[12px] leading-normal text-texto-3">
                Ainda não chegou lead de nenhuma landing page deste cliente. A campanha vai valer para todas as páginas dele.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {paginas.slice(0, 12).map((p) => {
                  const marcada = escolhidas.includes(p.endereco);
                  return (
                    <button
                      key={p.endereco}
                      type="button"
                      aria-pressed={marcada}
                      title={p.endereco}
                      onClick={() =>
                        setEscolhidas((l) => (marcada ? l.filter((x) => x !== p.endereco) : [...l, p.endereco]))
                      }
                      className={`flex min-h-11 items-center gap-2 rounded-[12px] border-[1.5px] px-3.5 text-[13px] font-semibold text-marinho transition-colors ${
                        marcada ? "border-azul bg-azul-claro" : "border-borda-campo bg-white hover:border-borda-campo-hover"
                      }`}
                    >
                      <span
                        className={`box-border flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border-[1.5px] text-white ${
                          marcada ? "border-azul bg-azul" : "border-nevoa bg-white"
                        }`}
                      >
                        {marcada && <Check size={12} strokeWidth={3.5} aria-hidden />}
                      </span>
                      {paginaDoLead(`https://${p.endereco}`) ?? p.endereco}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <span className="text-[13px] font-bold">Quais leads entram</span>
            <div role="radiogroup" aria-label="Regra da campanha" className="grid gap-2.5 sm:grid-cols-2">
              {REGRAS.map((r) => {
                const marcada = regra === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={marcada}
                    onClick={() => setRegra(r.id)}
                    className={`flex items-start gap-3 rounded-[14px] border-2 p-3.5 text-left text-marinho transition-colors ${
                      marcada ? "border-azul bg-azul-claro" : "border-borda bg-white hover:border-borda-campo-hover"
                    }`}
                  >
                    <span
                      className={`mt-px box-border flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                        marcada ? "border-azul" : "border-nevoa"
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${marcada ? "bg-azul" : "bg-transparent"}`} />
                    </span>
                    <span className="flex flex-col gap-1">
                      <strong className="text-[13px]">{r.titulo}</strong>
                      <span className="text-[12px] font-normal leading-[1.45] text-texto-3">{r.texto}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {regra === "utm" && (
              <label className="campo flex min-h-[46px] items-center gap-2.5 text-[12px] font-bold text-texto-3">
                utm_campaign =
                <input
                  type="text"
                  value={utm}
                  onChange={(e) => setUtm(e.target.value)}
                  placeholder="black-november"
                  spellCheck={false}
                  className="min-w-0 flex-1 border-0 bg-transparent font-mono text-[13px] font-semibold text-[#1A57A6]"
                />
              </label>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Meta de leads
              <span className="text-[11px] font-medium text-texto-3">Opcional</span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                placeholder="Ex.: 400"
                className="campo min-h-[46px] px-3 font-semibold"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">
              Investimento previsto
              <span className="text-[11px] font-medium text-texto-3">Opcional, para calcular o custo por lead</span>
              <input
                type="text"
                inputMode="decimal"
                value={investimento}
                onChange={(e) => setInvestimento(e.target.value)}
                placeholder="R$ 0,00"
                className="campo min-h-[46px] px-3 font-semibold"
              />
            </label>
          </div>

          <section className="flex flex-col gap-2.5">
            <span className="text-[13px] font-bold">Cor da campanha</span>
            <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2.5">
              {CORES.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={cor === c.hex}
                  aria-label={c.nome}
                  title={c.nome}
                  onClick={() => setCor(c.hex)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] bg-white p-0 transition-colors"
                  style={{ borderColor: cor === c.hex ? c.hex : "#FFFFFF" }}
                >
                  <span className="h-[30px] w-[30px] rounded-full" style={{ background: c.hex }} />
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside
          aria-label="Resumo da campanha"
          className="flex min-w-0 flex-col gap-3.5 border-t border-borda bg-superficie-2 px-5 py-[22px] sm:px-6 lg:border-l lg:border-t-0"
        >
          <span className="text-[11px] font-bold tracking-[0.1em] text-texto-3">COMO VAI APARECER</span>
          <div className="flex flex-col gap-3.5 rounded-[18px] border border-borda bg-white p-[18px]">
            <span className="flex items-center gap-3">
              <span
                className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[12px] text-white transition-colors"
                style={{ background: cor }}
              >
                <Megaphone size={20} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <strong className={`text-[15px] [overflow-wrap:anywhere] ${nome.trim() ? "" : "text-texto-3"}`}>
                  {nome.trim() || "Nome da campanha"}
                </strong>
                <span className="self-start">
                  <CampanhaBadge status={statusDaCampanha(rascunho, hoje)} />
                </span>
              </span>
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <span className="flex flex-col gap-[3px]">
                <span className="text-[10px] font-bold tracking-[0.08em] text-texto-3">PERÍODO</span>
                <strong className="text-[13px]">{datasValidas ? periodoDaCampanha(rascunho) : "A definir"}</strong>
              </span>
              <span className="flex flex-col gap-[3px]">
                <span className="text-[10px] font-bold tracking-[0.08em] text-texto-3">DURAÇÃO</span>
                <strong className="text-[13px]">{duracao ? `${duracao} ${duracao === 1 ? "dia" : "dias"}` : "A definir"}</strong>
              </span>
            </div>
            <span className="flex flex-col gap-1.5">
              <span className="flex justify-between gap-3 text-[12px]">
                <strong>{metaValida ? `0 de ${metaValida.toLocaleString("pt-BR")} leads` : "Sem meta definida"}</strong>
                <span className="text-texto-3">{datasValidas ? prazoDaCampanha(rascunho, hoje) : ""}</span>
              </span>
              <span className="h-2.5 rounded-full bg-gelo" />
            </span>
          </div>
          <p className="m-0 rounded-[14px] bg-white p-3.5 text-[12px] leading-[1.55] text-texto-2">{textoDaRegra}</p>
          <span className="flex gap-2.5 text-[12px] leading-normal text-texto-2">
            <Info size={16} strokeWidth={2} color="#1A66C2" aria-hidden className="mt-0.5 flex-none" />A campanha aparece no
            seletor de campanha das telas de Leads e Dashboard.
          </span>
        </aside>
      </div>
    </ModalDegrade>
  );
}
