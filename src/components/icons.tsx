import {
  Building2,
  CalendarDays,
  CircleUser,
  Filter,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  Ticket,
  UserRound,
} from "lucide-react";

/**
 * Ícones da navegação.
 *
 * Eram dez SVGs desenhados à mão, com onze viewBoxes diferentes e
 * espessuras de traço que não combinavam entre si nem com o resto do
 * portal — que sempre usou lucide. Hoje são todos lucide: uma biblioteca
 * só, grade de 24px, mesmo traço, 1556 ícones (logos de marca inclusive,
 * que é o que faltava para padronizar sem precisar de um segundo conjunto).
 *
 * Os nomes de exportação e a interface `{ className }` continuam os
 * mesmos, então nenhuma chamada precisou mudar — a troca é só visual.
 */

type Props = { className?: string };

/* Um tamanho e um traço para todos. 1.75 é o que já predominava nas
   chamadas de lucide espalhadas pelo portal; alinhar nele é o que faz o
   menu parecer do mesmo conjunto que o resto da tela. */
const LADO = 18;
const TRACO = 1.75;
const base = "shrink-0";

export function IconeDashboard({ className = "" }: Props) {
  return <LayoutDashboard size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

/**
 * Uma silhueta só. Duas figuras — em qualquer variante — viram borrão em
 * 18px: são duas cabeças, dois ombros e o recorte entre elas no espaço de
 * um ícone. O que distingue este do de Meu perfil é o círculo: lá a pessoa
 * fica dentro de um, aqui não.
 */
export function IconeLeads({ className = "" }: Props) {
  return <UserRound size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

export function IconeFunil({ className = "" }: Props) {
  return <Filter size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

export function IconeConfiguracao({ className = "" }: Props) {
  return <Settings size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

/** Menu "Clientes" — prédio lê como empresa melhor que um grupo de pessoas. */
export function IconeConectar({ className = "" }: Props) {
  return <Building2 size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

export function IconeSair({ className = "" }: Props) {
  return <LogOut size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

export function IconeCalendario({ className = "" }: Props) {
  return <CalendarDays size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

/** Ingresso, e não outro calendário: Calendário já é o vizinho na lista. */
export function IconeEventos({ className = "" }: Props) {
  return <Ticket size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

export function IconePostagem({ className = "" }: Props) {
  return <Megaphone size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

export function IconePerfil({ className = "" }: Props) {
  return <CircleUser size={LADO} strokeWidth={TRACO} className={`${base} ${className}`} />;
}

/**
 * WhatsApp é o único que continua desenhado aqui, e por um motivo que não
 * é teimosia: lucide não carrega a marca do WhatsApp. Trocar por um balão
 * genérico tiraria o reconhecimento imediato do botão na lista de leads —
 * é o mesmo caso do wordmark da OVERSO, que também é SVG próprio.
 */
export function IconeWhatsApp({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className || "h-4 w-4"} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
