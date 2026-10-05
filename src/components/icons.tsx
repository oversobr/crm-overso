import type { IconWeight } from "@phosphor-icons/react";
import {
  Buildings,
  CalendarDots,
  Funnel,
  Gear,
  Megaphone,
  SignOut,
  SquaresFour,
  Ticket,
  User,
  UserCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";

/**
 * Ícones da navegação.
 *
 * Tudo vem do Phosphor: uma biblioteca só, 1512 ícones, SEM EXCEÇÃO — nem
 * para logo de marca, que é justamente o que inviabilizou as alternativas.
 * Antes eram dez SVGs desenhados à mão, com onze viewBoxes diferentes,
 * convivendo com um segundo conjunto de biblioteca; e mais três marcas
 * (WhatsApp, TikTok, Pinterest) que nenhuma das duas cobria.
 *
 * Os nomes de exportação e a interface `{ className }` seguem os mesmos,
 * então nenhuma chamada precisou mudar.
 */

type Props = { className?: string };

/* Um tamanho e um peso para todos. No Phosphor a espessura vem de `weight`
   e não de strokeWidth, porque as formas são preenchidas em vez de traçadas
   — é essa diferença que faz o desenho fechar, sem ponta solta no ar. */
const LADO = 18;
const PESO: IconWeight = "regular";
const base = "shrink-0";

export function IconeDashboard({ className = "" }: Props) {
  return <SquaresFour size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

/** Silhueta fechada: cabeça e corpo são formas, não arcos com ponta solta. */
export function IconeLeads({ className = "" }: Props) {
  return <User size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

export function IconeFunil({ className = "" }: Props) {
  return <Funnel size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

export function IconeConfiguracao({ className = "" }: Props) {
  return <Gear size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

/** Menu "Clientes" — prédio lê como empresa melhor que um grupo de pessoas. */
export function IconeConectar({ className = "" }: Props) {
  return <Buildings size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

export function IconeSair({ className = "" }: Props) {
  return <SignOut size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

export function IconeCalendario({ className = "" }: Props) {
  return <CalendarDots size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

/** Ingresso, e não outro calendário: Calendário já é o vizinho na lista. */
export function IconeEventos({ className = "" }: Props) {
  return <Ticket size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

export function IconePostagem({ className = "" }: Props) {
  return <Megaphone size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

/** Pessoa dentro de um círculo — separa de Leads, que é a silhueta solta. */
export function IconePerfil({ className = "" }: Props) {
  return <UserCircle size={LADO} weight={PESO} className={`${base} ${className}`} />;
}

/** Agora da própria biblioteca: era o último SVG de marca desenhado à mão. */
export function IconeWhatsApp({ className = "" }: Props) {
  return <WhatsappLogo size={LADO} weight={PESO} className={`${base} ${className}`} />;
}
