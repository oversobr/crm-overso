import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * Só em desenvolvimento. Em produção quem faz isso é o Apache (deploy/.htaccess)
 * e o deploy, que grava o config.js: a página do relatório é estática.
 */
function relatorioNoDev(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: "relatorio-no-dev",
    apply: "serve",
    configResolved(c) {
      env = loadEnv(c.mode, process.cwd(), "VITE_");
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const caminho = (req.url ?? "").split("?")[0] ?? "";
        if (caminho === "/relatorio/config.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(`window.RELATORIO_CFG=${JSON.stringify({ url: env.VITE_SUPABASE_URL, chave: env.VITE_SUPABASE_ANON_KEY })};`);
          return;
        }
        if (/^\/relatorio\/[a-z0-9-]+\/?$/.test(caminho)) req.url = "/relatorio/index.html";
        next();
      });
    },
  };
}

export default defineConfig({
  // 3000 é a Site URL padrão do Supabase: porta fixa faz os links de
  // confirmação de email caírem no app em vez de numa porta morta.
  server: { port: 3000 },
  plugins: [
    relatorioNoDev(),
    tsConfigPaths(),
    tailwindcss(),
    // SPA: o build sai como arquivos estáticos (dist/client), sem servidor
    // Node — é o que a hospedagem serve na raiz do portal.overso.co.
    // outputPath /index faz o shell sair como index.html — o arquivo que o
    // Apache serve por padrão na raiz do domínio (o default seria _shell.html).
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index" } } }),
    viteReact(),
  ],
});
