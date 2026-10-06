import { createContext, useContext } from "react";

/**
 * O que o topo de cada tela precisa do shell. Hoje é só abrir a gaveta do
 * menu no celular. Fica fora de arquivo de rota pelo mesmo motivo do
 * `painel.tsx`: rota é dividida em chunks, e contexto duplicado não se acha.
 */
export const ShellCtx = createContext<{ abrirMenu: () => void }>({ abrirMenu: () => {} });

export const useShell = () => useContext(ShellCtx);

/**
 * Contato comercial: para onde vai "Falar com a OVERSO" quando o cliente
 * abre um módulo que não contratou.
 */
export const CONTATO_OVERSO = "https://overso.co";
