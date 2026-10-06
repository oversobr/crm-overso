import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronsLeft, Lock, X } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Flutuante, useDesktop } from "@/components/ds/flutuante";
import { LogoOverso } from "@/components/logo";
import { usePainel } from "@/components/painel";
import { useAcesso } from "@/lib/acesso";
import { leadsNovosQuery } from "@/lib/queries";
import type { Modulo, Project } from "@/lib/types";
import { MODULO_LABEL, modulosDe } from "@/lib/types";
import { iniciais } from "@/lib/usuario";

import { CONTATO_OVERSO } from "./contexto";
import type { IconeMenu } from "./icones-menu";
import {
  IconeCalendario,
  IconeClientes,
  IconeConfiguracoes,
  IconeConteudo,
  IconeDashboard,
  IconeEventos,
  IconeFunil,
  IconeLeads,
  IconePerfil,
  MarcaOverso,
} from "./icones-menu";

type Item = {
  to: string;
  rotulo: string;
  Icone: IconeMenu;
  /** Módulo de que o item depende: sem ele, fica no menu com cadeado. */
  modulo?: Modulo;
};

const MENU: Item[] = [
  { to: "/", rotulo: "Dashboard", Icone: IconeDashboard },
  { to: "/calendario", rotulo: "Calendário", Icone: IconeCalendario },
];

const MODULOS: Item[] = [
  { to: "/leads", rotulo: "Leads", Icone: IconeLeads, modulo: "crm" },
  { to: "/funil", rotulo: "Funil", Icone: IconeFunil, modulo: "crm" },
  { to: "/postagens", rotulo: "Programação de post", Icone: IconeConteudo, modulo: "conteudo" },
  { to: "/eventos", rotulo: "Eventos", Icone: IconeEventos, modulo: "eventos" },
];

/** Só a equipe OVERSO (super-admin) vê este grupo. */
const ADMIN: Item[] = [{ to: "/clientes", rotulo: "Clientes", Icone: IconeClientes }];

const CONTA: Item[] = [
  { to: "/perfil", rotulo: "Perfil", Icone: IconePerfil },
  { to: "/configuracoes", rotulo: "Configurações", Icone: IconeConfiguracoes },
];

/** O que o cliente ganha com cada módulo: texto do aviso no pé do menu. */
const O_QUE_FAZ: Record<Modulo, string> = {
  crm: "Leads das landing pages, funil do formulário e a origem de cada contato num lugar só.",
  conteudo: "Calendário de posts com status, artes e aprovação do cliente num lugar só.",
  eventos: "Demandas, materiais e posts de divulgação de cada evento num quadro só.",
};

type Dica = { rotulo: string; extra?: string | undefined; top: number; left: number };

export function Sidebar({
  aberto,
  onFechar,
  recolhido,
  onAlternarRecolhido,
}: {
  /** Gaveta do celular. No desktop o menu é coluna fixa e isto não vale. */
  aberto: boolean;
  onFechar: () => void;
  recolhido: boolean;
  onAlternarRecolhido: () => void;
}) {
  const desktop = useDesktop();
  // Recolher é coisa de desktop: no celular o menu é gaveta, sempre larga.
  const compacto = recolhido && desktop;

  const { projeto } = usePainel();
  const mods = modulosDe(projeto);
  const { superAdmin } = useAcesso(projeto?.id);
  const { data: novos = 0 } = useQuery({ ...leadsNovosQuery(projeto?.id), enabled: Boolean(projeto?.id) && mods.crm });

  // Dica do menu recolhido. Vai para o <body> porque o menu rola e a cortaria.
  const [dica, setDica] = useState<Dica | null>(null);

  const bloqueado = (["crm", "conteudo", "eventos"] as Modulo[]).find((m) => !mods[m]);

  function item(i: Item) {
    const trancado = i.modulo ? !mods[i.modulo] : false;
    const selo = i.to === "/leads" && !trancado && novos > 0 ? String(novos) : undefined;
    return (
      <ItemMenu
        key={i.to}
        item={i}
        compacto={compacto}
        trancado={trancado}
        selo={selo}
        onNavegar={onFechar}
        onDica={setDica}
      />
    );
  }

  return (
    <>
      {/* Véu do celular: escurece o conteúdo e fecha a gaveta ao tocar fora. */}
      {aberto && <div onClick={onFechar} aria-hidden className="modal-backdrop fixed inset-0 z-40 bg-[rgba(28,46,69,0.55)] lg:hidden" />}

      {/* 296px e não os 260 do `flex-basis` do design: lá o cabeçalho (marca,
          OVERSO, PORTAL, botão) não quebra linha e empurra o menu até essa
          largura. É a medida que aparece nos prints de referência. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-borda-campo bg-gelo text-marinho transition-[width,transform] duration-[240ms] ease-[var(--ease-gaveta)] motion-reduce:transition-none lg:static lg:z-auto lg:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        } ${compacto ? "w-[84px] items-center gap-[18px] px-4 py-6" : "w-[296px] max-w-[88vw] gap-[22px] px-[18px] py-[26px]"}`}
      >
        {compacto ? (
          <>
            <div className="flex min-h-10 items-center justify-center px-1">
              <MarcaOverso />
            </div>
            <button
              type="button"
              onClick={onAlternarRecolhido}
              aria-label="Expandir menu"
              aria-expanded={false}
              title="Expandir menu"
              className="btn btn-secundario min-h-12 w-full shrink-0 p-0"
            >
              <ChevronsLeft size={18} strokeWidth={1.9} className="rotate-180" aria-hidden />
            </button>
          </>
        ) : (
          <div className="flex shrink-0 items-center gap-3 px-1.5">
            <LogoOverso className="h-5 w-auto shrink-0" />
            <span className="rounded-md bg-borda-campo px-[7px] py-[3px] text-[10px] font-bold tracking-[0.1em] text-texto-2">
              PORTAL
            </span>
            {/* No celular este canto é o botão de fechar a gaveta. */}
            <button
              type="button"
              onClick={desktop ? onAlternarRecolhido : onFechar}
              aria-label={desktop ? "Recolher menu" : "Fechar menu"}
              aria-expanded={desktop ? true : undefined}
              title={desktop ? "Recolher menu" : "Fechar menu"}
              className="btn btn-secundario ml-auto h-9 min-h-0 w-9 flex-none rounded-[10px] p-0 text-texto-2"
            >
              {desktop ? <ChevronsLeft size={16} strokeWidth={2} aria-hidden /> : <X size={16} strokeWidth={2} aria-hidden />}
            </button>
          </div>
        )}

        <ClientSwitcher compacto={compacto} onTrocar={onFechar} />

        <nav aria-label="Principal" className={`flex w-full flex-col ${compacto ? "gap-1.5" : "gap-1"}`}>
          <Rotulo compacto={compacto} primeiro>
            MENU
          </Rotulo>
          {MENU.map(item)}
          <Rotulo compacto={compacto}>MÓDULOS</Rotulo>
          {MODULOS.map(item)}
          {superAdmin && (
            <>
              <Rotulo compacto={compacto}>ADMIN OVERSO</Rotulo>
              {ADMIN.map(item)}
            </>
          )}
          <Rotulo compacto={compacto}>CONTA</Rotulo>
          {CONTA.map(item)}
        </nav>

        {/* Aviso do módulo não contratado: lembra que ele existe. */}
        {!compacto && bloqueado && (
          <div className="mt-auto flex shrink-0 flex-col items-center gap-2.5 rounded-[18px] bg-marinho px-[18px] py-[22px] text-center text-gelo">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-marinho-hover">
              <Lock size={18} strokeWidth={1.8} color="#FFFFFF" aria-hidden />
            </span>
            <span className="text-[15px] font-bold">Módulo {MODULO_LABEL[bloqueado]}</span>
            <span className="text-[12px] leading-normal text-[#C9D6E6]">{O_QUE_FAZ[bloqueado]}</span>
            {superAdmin ? (
              // A equipe OVERSO liga o módulo na ficha do cliente.
              <Link to="/clientes" onClick={onFechar} className="btn btn-claro mt-1 w-full">
                Ativar para este cliente
              </Link>
            ) : (
              <a href={CONTATO_OVERSO} target="_blank" rel="noreferrer" className="btn btn-claro mt-1 w-full">
                Falar com a OVERSO
              </a>
            )}
          </div>
        )}
      </aside>

      {dica &&
        compacto &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[80] flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-[10px] bg-marinho px-3 py-2 text-[12px] font-bold text-white shadow-[0_8px_20px_rgba(14,24,38,0.2)]"
            style={{ top: dica.top, left: dica.left }}
          >
            {dica.rotulo}
            {dica.extra && <span className="rounded-full bg-azul px-1.5 py-px text-[10px] font-bold">{dica.extra}</span>}
          </span>,
          document.body,
        )}
    </>
  );
}

/** Título de grupo. No menu recolhido não cabe: vira um traço entre os grupos. */
function Rotulo({ children, compacto, primeiro = false }: { children: string; compacto: boolean; primeiro?: boolean }) {
  if (compacto) return <span aria-hidden className="mx-2.5 my-2 block h-px bg-borda-campo" />;
  return (
    <span className={`px-3 pb-1.5 text-[11px] font-bold tracking-[0.12em] text-texto-3 ${primeiro ? "" : "pt-4"}`}>
      {children}
    </span>
  );
}

function ItemMenu({
  item,
  compacto,
  trancado,
  selo,
  onNavegar,
  onDica,
}: {
  item: Item;
  compacto: boolean;
  trancado: boolean;
  /** Número ao lado do rótulo (leads novos). */
  selo?: string | undefined;
  onNavegar: () => void;
  onDica: (d: Dica | null) => void;
}) {
  const { to, rotulo, Icone } = item;

  function mostrarDica(e: { currentTarget: HTMLElement }) {
    if (!compacto) return;
    const r = e.currentTarget.getBoundingClientRect();
    onDica({
      rotulo: trancado ? `${rotulo}: módulo não contratado` : rotulo,
      extra: selo ? `${selo} ${selo === "1" ? "novo" : "novos"}` : undefined,
      top: r.top + r.height / 2,
      left: r.right + 10,
    });
  }

  return (
    <Link
      to={to}
      onClick={() => {
        onDica(null);
        onNavegar();
      }}
      activeOptions={{ exact: to === "/" }}
      aria-label={compacto ? rotulo : undefined}
      // O módulo trancado continua clicável: a tela dele explica o que falta
      // (e quem é da OVERSO liga dali mesmo). Por isso data-*, não aria-disabled.
      data-bloqueado={trancado || undefined}
      title={compacto ? undefined : trancado ? "Módulo não contratado" : undefined}
      onMouseEnter={mostrarDica}
      onMouseLeave={() => onDica(null)}
      onFocus={mostrarDica}
      onBlur={() => onDica(null)}
      className={`item-menu ${compacto ? "min-h-12 justify-center px-0" : ""}`}
    >
      {({ isActive }) => (
        <>
          <Icone ativo={isActive} tamanho={compacto ? 20 : 18} />
          {!compacto && <span className="min-w-0 flex-1 truncate">{rotulo}</span>}

          {selo &&
            (compacto ? (
              <span className="absolute right-1.5 top-1 box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-gelo bg-azul px-1 text-[9px] font-bold text-white">
                {selo}
              </span>
            ) : (
              <span className="rounded-full bg-azul px-2 py-0.5 text-[11px] font-bold text-white">{selo}</span>
            ))}

          {trancado &&
            (compacto ? (
              <span className="absolute bottom-1.5 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-borda-campo text-texto-3">
                <Lock size={10} strokeWidth={2.6} aria-hidden />
              </span>
            ) : (
              <Lock size={16} strokeWidth={1.8} aria-label="Bloqueado" className="shrink-0" />
            ))}
        </>
      )}
    </Link>
  );
}

/* ── Seletor de cliente ─────────────────────────────────────────────── */

const modulosDoCliente = (p: Project) => {
  const m = modulosDe(p);
  return (["crm", "conteudo", "eventos"] as Modulo[]).filter((k) => m[k]).map((k) => MODULO_LABEL[k]).join(" · ");
};

/**
 * Card do cliente no topo do menu. Quem tem acesso a mais de um cliente
 * (a equipe OVERSO, ou alguém em duas contas) troca por aqui; trocar
 * recarrega a tela inteira e volta para o Dashboard.
 */
function ClientSwitcher({ compacto, onTrocar }: { compacto: boolean; onTrocar: () => void }) {
  const router = useRouter();
  const { projeto, projetos, trocarCliente } = usePainel();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);

  const nome = projeto?.nome ?? "Nenhum cliente";
  const sigla = projeto ? iniciais(projeto.nome) : "?";
  const varios = projetos.length > 1;

  const quadrado = (
    <span
      className={`flex flex-none items-center justify-center rounded-[10px] bg-azul font-bold text-white ${
        compacto ? "h-12 w-12 text-[14px]" : "h-[38px] w-[38px] text-[13px]"
      }`}
    >
      {sigla}
    </span>
  );

  const miolo = compacto ? (
    quadrado
  ) : (
    <>
      {quadrado}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-bold">{nome}</span>
        <span className="text-[11px] font-medium text-texto-3">{varios ? "Trocar de cliente" : "Sua conta"}</span>
      </span>
      {varios && <ChevronDown size={16} strokeWidth={2} aria-hidden className="shrink-0" />}
    </>
  );

  const classe = compacto
    ? "flex min-h-12 w-full shrink-0 items-center justify-center rounded-[12px] bg-azul"
    : "flex min-h-[60px] w-full shrink-0 items-center gap-3 rounded-[14px] border border-borda-campo bg-white px-3 py-2.5 text-left text-marinho";

  // Uma conta só: não há o que trocar, então não é botão.
  if (!varios) {
    return (
      <div className={classe} title={compacto ? nome : undefined}>
        {miolo}
      </div>
    );
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`Cliente: ${nome}. Trocar de cliente`}
        title={compacto ? nome : undefined}
        className={`${classe} transition-[border-color,box-shadow] hover:border-borda-campo-hover ${
          aberto && !compacto ? "!border-azul" : ""
        }`}
      >
        {miolo}
      </button>

      <Flutuante
        ancora={botao}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        lado={compacto ? "direita" : "abaixo"}
        role="listbox"
        aria-label="Clientes"
        className="flex w-[320px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[18px] border border-borda bg-white text-marinho shadow-[var(--sombra-popup)]"
      >
        <span className="px-4 pb-2 pt-3.5 text-[11px] font-bold tracking-[0.1em] text-texto-3">ESCOLHA O CLIENTE</span>
        <div className="rolagem-fina flex max-h-[min(360px,60vh)] flex-col gap-1 overflow-y-auto px-2 pb-2">
          {projetos.map((p) => {
            const sel = p.id === projeto?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  setAberto(false);
                  // Cliente novo sempre abre no Dashboard: cair no meio de
                  // outra tela (um lead aberto do cliente anterior) confunde.
                  if (!sel) void router.navigate({ to: "/" });
                  trocarCliente(p.id);
                  onTrocar();
                }}
                className="opcao flex min-h-14 items-center gap-3 rounded-[12px] px-2.5 py-2 text-left"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-azul text-[11px] font-bold text-white">
                  {iniciais(p.nome)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-bold">{p.nome}</span>
                  <span className="truncate text-[11px] text-texto-3">{modulosDoCliente(p) || "Sem módulos ligados"}</span>
                </span>
                {sel && <Check size={16} strokeWidth={3} color="#1A66C2" aria-hidden className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </Flutuante>
    </>
  );
}
