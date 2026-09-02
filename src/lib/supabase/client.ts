import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Cliente do navegador. Criado sob demanda (e uma vez só) porque este módulo
 * também é carregado no SSR, onde `document` não existe.
 */
export function getSupabaseBrowserClient() {
  browserClient ??= createBrowserClient(supabaseUrl(), supabaseAnonKey());
  return browserClient;
}
