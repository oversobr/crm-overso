/**
 * Lidas em função (não no topo do módulo) para o erro aparecer na hora do
 * uso, com nome da variável, em vez de quebrar o bundle inteiro no import.
 */
export function supabaseUrl() {
  const valor = import.meta.env.VITE_SUPABASE_URL;
  if (!valor) throw new Error("VITE_SUPABASE_URL não configurada (veja .env.example)");
  return valor;
}

export function supabaseAnonKey() {
  const valor = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!valor) throw new Error("VITE_SUPABASE_ANON_KEY não configurada (veja .env.example)");
  return valor;
}
