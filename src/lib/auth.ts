import { createServerFn } from "@tanstack/react-start";

import { getSupabaseServerClient } from "./supabase/server";

export type SessionUser = { id: string; email: string };

/**
 * Usa `getUser()` (não `getSession()`) porque só ele valida o token contra o
 * servidor do Supabase — o cookie de sessão sozinho é forjável.
 */
export const fetchCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;
    return { id: data.user.id, email: data.user.email };
  },
);
