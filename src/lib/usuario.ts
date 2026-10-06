import { useQuery } from "@tanstack/react-query";

import { getSupabaseBrowserClient } from "./supabase/client";

/** Tratamentos que não entram nas iniciais: "Dr. Delmo Sakabe" é DS, não DD. */
const TRATAMENTOS = /^(dr|dra|sr|sra|prof|profa)\.?$/i;

/**
 * Letras do avatar: as iniciais das duas primeiras palavras que contam.
 * Não contam os tratamentos nem as palavras de ligação, que em nome próprio
 * vêm em minúscula ("Biologia com Ká" é BK; "Sáli de Souza" é SS).
 */
export function iniciais(nome: string | null | undefined): string {
  const palavras = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  const contam = palavras.filter((p) => !TRATAMENTOS.test(p) && p[0] !== p[0]!.toLowerCase());
  // Nome todo em minúscula (um e-mail, um apelido): vale o que tiver.
  const base = contam.length ? contam : palavras;
  return (
    base
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Quem está logado. Uma queryKey só ("auth-user") para o topo, o perfil e a
 * saudação: o react-query devolve do cache, sem ida extra ao servidor.
 */
export function useUsuario() {
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient().auth.getUser();
      return data.user;
    },
  });

  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string };
  const email = user?.email ?? "";
  const nome = meta.full_name || meta.name || (email ? email.split("@")[0]! : "");

  return {
    id: user?.id,
    email,
    nome,
    primeiroNome: nome.trim().split(/\s+/)[0] ?? "",
    iniciais: iniciais(nome),
    avatarUrl: meta.avatar_url ?? null,
  };
}
