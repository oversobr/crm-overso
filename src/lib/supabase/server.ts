import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";

import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Cliente de servidor, ligado aos cookies da requisição atual. É por aqui que
 * a sessão é lida e gravada — o navegador nunca escreve o token sozinho.
 */
export function getSupabaseServerClient() {
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, options);
        }
      },
    },
  });
}
