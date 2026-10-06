import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Check, ChevronRight, Lock, Plus, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Card, EmptyState } from "@/components/ds/card";
import { SegmentedControl } from "@/components/ds/controles";
import { NovoCliente } from "@/components/novo-cliente";
import { usePainel } from "@/components/painel";
import { TopBar } from "@/components/shell/top-bar";
import { podeConectarQuery, projectsQuery, projetosGerenciaveisQuery, resumoDosClientesQuery } from "@/lib/queries";
import { CORES_CAMPANHA } from "@/lib/status";
import type { Modulo, ProjetoGerenciavel } from "@/lib/types";
import { MODULO_LABEL, modulosDe } from "@/lib/types";
import { iniciais } from "@/lib/usuario";

/**
 * Lista de clientes: só a equipe OVERSO (super-admin) entra. Cada card abre
 * a ficha do cliente, onde se ligam módulos, pega-se o script da landing
 * page e remove-se o cliente.
 */
export const Route = createFileRoute("/_authed/clientes")({ component: Clientes });

const MODULOS: Modulo[] = ["crm", "conteudo", "eventos"];

type Filtro = "todos" | Modulo;
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  ...MODULOS.map((m) => ({ id: m, rotulo: MODULO_LABEL[m] })),
];

/** "Desde jun/2026" */
function desde(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mes = d.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
  return `Desde ${mes}/${d.toLocaleDateString("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" })}`;
}

function Clientes() {
  const { data: podeConectar, isLoading: verificandoAcesso } = useQuery(podeConectarQuery());
  const { data: gerenciaveis = [], isLoading } = useQuery({ ...projetosGerenciaveisQuery(), enabled: podeConectar === true });
  // Os módulos vêm da MESMA consulta que o menu lateral usa (tabela direta).
  // A função projetos_gerenciaveis() não estava devolvendo usa_crm/
  // usa_conteudo, e sem eles tudo aparecia ligado. Daqui só vem a chave.
  const { data: projetos = [] } = useQuery(projectsQuery());
  const clientes: ProjetoGerenciavel[] = gerenciaveis.map((c) => {
    const p = projetos.find((x) => x.id === c.id);
    return {
      ...c,
      usa_crm: p?.usa_crm ?? c.usa_crm,
      usa_conteudo: p?.usa_conteudo ?? c.usa_conteudo,
      usa_eventos: p?.usa_eventos ?? c.usa_eventos,
    };
  });
  const { data: resumos = {} } = useQuery(resumoDosClientesQuery(clientes));
  const { projeto } = usePainel();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const router = useRouter();
  const abrirFicha = (id: string) => void router.navigate({ to: "/clientes/$clienteId", params: { clienteId: id } });

  // Portão que falha fechado: enquanto a resposta não chega (ou se a chamada
  // falhar) o valor é undefined, e a tela não abre. O item também some do menu.
  if (!podeConectar) {
    return (
      <div className="flex flex-col gap-5">
        <TopBar titulo="Clientes" />
        <Card>
          <EmptyState
            icone={<ShieldAlert size={20} strokeWidth={1.8} aria-hidden />}
            titulo={verificandoAcesso ? "Verificando seu acesso…" : "Área da equipe OVERSO"}
          >
            {verificandoAcesso ? undefined : "Fale com o responsável pelo portal para cadastrar ou alterar um cliente."}
          </EmptyState>
        </Card>
      </div>
    );
  }

  const termo = busca.trim().toLowerCase();
  const visiveis = clientes.filter(
    (c) => c.nome.toLowerCase().includes(termo) && (filtro === "todos" || modulosDe(c)[filtro]),
  );

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Clientes"
        selo={clientes.length}
        subtitulo="Cada cliente usa só os módulos que contratou. Abra um cliente para ligar módulos, pegar o script da landing page ou removê-lo."
        acoes={
          <button type="button" onClick={() => setNovoAberto(true)} className="btn btn-primario">
            <Plus size={16} strokeWidth={2.2} aria-hidden />
            Novo cliente
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="campo flex flex-[1_1_280px] items-center gap-2.5 text-texto-3">
          <Search size={18} strokeWidth={1.8} aria-hidden className="shrink-0" />
          <span className="sr-only">Buscar cliente</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-marinho"
          />
        </label>
        <SegmentedControl
          rotulo="Filtro por módulo"
          opcoes={FILTROS}
          valor={filtro}
          onChange={setFiltro}
          className="!bg-borda-campo [&>button]:px-3.5 [&>button]:text-marinho"
        />
      </div>

      {isLoading ? (
        <Card>
          <EmptyState titulo="Carregando os clientes…" />
        </Card>
      ) : clientes.length === 0 ? (
        <Card>
          <EmptyState
            titulo="Nenhum cliente ainda"
            acao={
              <button type="button" onClick={() => setNovoAberto(true)} className="btn btn-primario btn-40 mt-1">
                <Plus size={14} strokeWidth={2.2} aria-hidden />
                Cadastrar o primeiro
              </button>
            }
          >
            Cadastre o primeiro cliente para ligar os módulos e pegar o script da landing page.
          </EmptyState>
        </Card>
      ) : visiveis.length === 0 ? (
        <Card>
          <EmptyState titulo="Nenhum cliente com esse filtro">Mude a busca ou o módulo escolhido.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
          {visiveis.map((c) => {
            const mods = modulosDe(c);
            const resumo = resumos[c.id];
            const aberto = c.id === projeto?.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => abrirFicha(c.id)}
                className={`card-clicavel flex flex-col gap-4 rounded-[20px] p-5 text-left text-marinho ${aberto ? "!border-azul" : ""}`}
              >
                <div className="flex w-full items-center gap-3.5">
                  <span
                    className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] text-[16px] font-extrabold text-white"
                    style={{ background: CORES_CAMPANHA[clientes.indexOf(c) % CORES_CAMPANHA.length] }}
                  >
                    {iniciais(c.nome)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-bold [overflow-wrap:anywhere]">{c.nome}</span>
                      {aberto && (
                        <span className="rounded-full bg-azul-claro-2 px-2 py-0.5 text-[11px] font-bold text-[#1A57A6]">No painel agora</span>
                      )}
                    </span>
                    <span className="truncate text-[12px] font-normal text-texto-3">{c.slug}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={2} color="#55657A" aria-hidden className="flex-none" />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {MODULOS.map((m) => (
                    <span
                      key={m}
                      className={`flex items-center gap-[5px] rounded-lg border px-2.5 py-[5px] text-[12px] font-bold ${
                        mods[m] ? "border-sucesso-fundo bg-sucesso-fundo text-sucesso" : "border-dashed border-nevoa-2 bg-white text-texto-3"
                      }`}
                    >
                      {mods[m] ? <Check size={12} strokeWidth={3} aria-hidden /> : <Lock size={12} strokeWidth={2.4} aria-hidden />}
                      {MODULO_LABEL[m]}
                    </span>
                  ))}
                </div>

                <div className="flex w-full justify-between gap-2.5 border-t border-gelo pt-3 text-[12px] font-normal text-texto-3">
                  <span>
                    {!mods.crm
                      ? "Sem o módulo CRM"
                      : resumo
                        ? `${resumo.leads30Dias.toLocaleString("pt-BR")} ${resumo.leads30Dias === 1 ? "lead" : "leads"} em 30 dias`
                        : "Contando os leads…"}
                  </span>
                  <span>{desde(resumo?.criadoEm ?? null)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {novoAberto && <NovoCliente onFechar={() => setNovoAberto(false)} />}
    </div>
  );
}
