import type { ReactNode } from "react";

/**
 * Ícones do menu lateral. São os traços do design (estilo Lucide, 1.8, cantos
 * redondos) e moram aqui, e não no pacote lucide-react, por um motivo: o item
 * ATIVO fica com o ícone preenchido, e o Lucide só tem a versão de contorno.
 * Cada ícone desenha as duas.
 *
 * A cor vem de `currentColor`: o CSS do `.item-menu` pinta de azul no hover
 * e no ativo.
 */
export type IconeMenu = (p: { ativo?: boolean | undefined; tamanho?: number | undefined }) => ReactNode;

function Base({
  ativo,
  tamanho = 18,
  children,
}: {
  ativo?: boolean | undefined;
  tamanho?: number | undefined;
  children: ReactNode;
}) {
  return (
    <svg
      className="item-menu-icone shrink-0"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ativo ? 1.9 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconeDashboard: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <g fill={ativo ? "currentColor" : "none"}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </g>
  </Base>
);

export const IconeCalendario: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    {ativo ? (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" fill="currentColor" />
        <path d="M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" stroke="#FFFFFF" strokeWidth="2" />
        <path d="M8 3v4M16 3v4" />
      </>
    ) : (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    )}
  </Base>
);

export const IconeLeads: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <circle cx="9" cy="8" r="4" fill={ativo ? "currentColor" : "none"} />
    <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" fill={ativo ? "currentColor" : "none"} />
    <path d="M16 4.5a4 4 0 0 1 0 7M22 21c0-3-1.8-5.6-4.5-6.6" />
  </Base>
);

export const IconeConteudo: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <rect x="3" y="3" width="18" height="18" rx="2" fill={ativo ? "currentColor" : "none"} />
    <circle cx="9" cy="9" r="2" stroke={ativo ? "#FFFFFF" : "currentColor"} />
    <path d="M21 15l-5-5L5 21" stroke={ativo ? "#FFFFFF" : "currentColor"} />
  </Base>
);

export const IconeEventos: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <path d="M4 21V4h12l-2 4 2 4H4" fill={ativo ? "currentColor" : "none"} />
  </Base>
);

export const IconeClientes: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <g fill={ativo ? "currentColor" : "none"}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </g>
    <path d="M17.5 14v7M14 17.5h7" />
  </Base>
);

export const IconePerfil: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <g fill={ativo ? "currentColor" : "none"}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </g>
  </Base>
);

export const IconeConfiguracoes: IconeMenu = ({ ativo, tamanho }) => (
  <Base ativo={ativo} tamanho={tamanho}>
    <path
      fill={ativo ? "currentColor" : "none"}
      d="M12 2.5l1.6 2.2 2.7-.4.9 2.6 2.5 1.1-.4 2.7L21.5 12l-2.2 1.6.4 2.7-2.5 1.1-.9 2.6-2.7-.4L12 21.5l-1.6-2.2-2.7.4-.9-2.6-2.5-1.1.4-2.7L2.5 12l2.2-1.6-.4-2.7 2.5-1.1.9-2.6 2.7.4z"
    />
    <circle cx="12" cy="12" r="3" fill={ativo ? "#FFFFFF" : "none"} stroke={ativo ? "#FFFFFF" : "currentColor"} />
  </Base>
);

/** Símbolo da OVERSO (as duas faixas), sem o lettering. */
export function MarcaOverso({
  largura = 28,
  altura = 25,
  className,
}: {
  largura?: number;
  altura?: number;
  className?: string;
}) {
  return (
    // O símbolo oficial da OVERSO: as mesmas duas formas do wordmark (logo.tsx).
    <svg width={largura} height={altura} viewBox="0 0 26.57 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M0.313014 13.6544L25.8794 23.9636C26.2083 24.0959 26.5677 23.854 26.5677 23.4995V18.4669C26.5677 18.2625 26.4433 18.0788 26.2547 18.0028L0.688236 7.69269C0.359423 7.56038 0 7.80229 0 8.15675V13.1894C0 13.3938 0.124416 13.5774 0.313014 13.6534V13.6544Z" />
      <path d="M26.5677 0H20.8989V8.13988L0.710947 0C0.318939 0 0 0.31892 0 0.710906V0.794833C0 1.08512 0.175762 1.34578 0.445329 1.4544L24.5652 11.18C25.523 11.5661 26.5677 10.8611 26.5677 9.82828V0Z" />
    </svg>
  );
}
