/**
 * OVERSO Lead — captura de leads para o CRM OVERSO.
 * Sem dependências. Funciona por <script> ou por import.
 *
 * Substitui o envio via Apps Script. As duas diferenças que importam:
 *
 * 1. CORS de verdade. O Supabase responde com Access-Control-Allow-Origin,
 *    então não precisamos mais de `mode: "no-cors"` — e por isso voltamos a
 *    LER a resposta: dá pra saber se o lead entrou e com qual id.
 *
 * 2. session_id. O mesmo id acompanha a pessoa da abertura do formulário até
 *    o envio, então o lead parcial ATUALIZA a linha dele em vez de criar uma
 *    nova. É o que faz "lead parcial" e "lead completo" serem a mesma pessoa.
 */

const SS_SESSAO = "overso:sid";
const SS_UTMS = "overso:utms";
const CHAVES_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function armazem() {
  // Navegação anônima e cookies bloqueados fazem sessionStorage lançar em vez
  // de só falhar. Um fallback em memória mantém a captura viva na aba atual.
  try {
    sessionStorage.getItem("overso:probe");
    return sessionStorage;
  } catch {
    const mapa = new Map();
    return {
      getItem: (k) => mapa.get(k) ?? null,
      setItem: (k, v) => mapa.set(k, v),
    };
  }
}

function novaSessao() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** UTMs são de primeiro toque: gravadas na chegada e nunca sobrescritas depois. */
function capturarUtms(store) {
  const salvo = store.getItem(SS_UTMS);
  if (salvo) return JSON.parse(salvo);

  const params = new URLSearchParams(location.search);
  const utms = {};
  for (const chave of CHAVES_UTM) {
    const valor = params.get(chave);
    if (valor) utms[chave] = valor;
  }
  // Guardados junto porque são o que permite mandar a conversão de volta
  // pro Meta/Google depois (CAPI) e fechar o ciclo da campanha.
  for (const chave of ["fbclid", "gclid", "ttclid"]) {
    const valor = params.get(chave);
    if (valor) utms[chave] = valor;
  }
  if (document.referrer && !document.referrer.includes(location.hostname)) {
    utms.referrer = document.referrer;
  }

  store.setItem(SS_UTMS, JSON.stringify(utms));
  return utms;
}

export function init({ url, anonKey, key, debug = false }) {
  if (!url || !anonKey || !key) {
    throw new Error("OversoLead.init: url, anonKey e key são obrigatórios");
  }

  const store = armazem();
  let sessao = store.getItem(SS_SESSAO);
  if (!sessao) {
    sessao = novaSessao();
    store.setItem(SS_SESSAO, sessao);
  }

  const utms = capturarUtms(store);
  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/capture_lead`;

  let acumulado = {}; // tudo que a pessoa já digitou nesta sessão
  let abriu = false;
  let concluiu = false;
  let pendente = null;

  async function enviar(evento, dados, { keepalive = false } = {}) {
    const corpo = {
      p_key: key,
      p_session: sessao,
      p_evento: evento,
      p_dados: dados ?? {},
      p_utms: utms,
      p_origem: location.href,
    };

    try {
      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
        // keepalive deixa a requisição terminar mesmo se a aba fechar —
        // é o que permite registrar quem abandonou o formulário.
        keepalive,
      });

      if (!resposta.ok) {
        if (debug) console.warn("[overso]", evento, resposta.status, await resposta.text());
        return null;
      }
      const json = await resposta.json();
      if (debug) console.info("[overso]", evento, json);
      return json?.lead_id ?? null;
    } catch (erro) {
      // Nunca propaga: o redirect pro WhatsApp não pode depender do CRM
      // estar no ar. Lead perdido é melhor que fluxo quebrado.
      if (debug) console.warn("[overso] falhou", evento, erro);
      return null;
    }
  }

  const api = {
    sessao,
    utms,

    /** Topo do funil. Idempotente — o banco ignora a segunda abertura. */
    open() {
      if (abriu) return;
      abriu = true;
      void enviar("form_open", {});
    },

    /** Lead parcial. Some quando o `complete` chega com o mesmo session_id. */
    partial(dados) {
      Object.assign(acumulado, dados ?? {});
      if (concluiu) return;
      clearTimeout(pendente);
      // Espera a digitação parar: sem isso seria uma requisição por tecla.
      pendente = setTimeout(() => void enviar("partial", acumulado), 2500);
    },

    /** Envio final. Retorna o lead_id (ou null se o CRM não respondeu). */
    async complete(dados) {
      concluiu = true;
      clearTimeout(pendente);
      Object.assign(acumulado, dados ?? {});
      return enviar("complete", acumulado, { keepalive: true });
    },

    /**
     * Liga um <form> ao CRM sem precisar mapear campo por campo: lê todo
     * input com `name`. É isto que faz uma LP nova entrar no CRM sem
     * ninguém tocar no banco nem neste arquivo.
     */
    watch(form, { ignorar = [] } = {}) {
      if (!form) return api;
      api.open();

      const ler = () => {
        const dados = {};
        for (const campo of form.querySelectorAll("[name]")) {
          const nome = campo.name;
          if (!nome || ignorar.includes(nome)) continue;
          if (campo.type === "checkbox") {
            if (campo.checked) (dados[nome] ??= []).push(campo.value);
          } else if (campo.type === "radio") {
            if (campo.checked) dados[nome] = campo.value;
          } else if (campo.value?.trim()) {
            dados[nome] = campo.value.trim();
          }
        }
        return dados;
      };

      form.addEventListener("input", () => api.partial(ler()));
      form.addEventListener("change", () => api.partial(ler()));
      form.addEventListener("submit", () => void api.complete(ler()));

      // Última chance de salvar quem preencheu e fechou a aba.
      addEventListener("pagehide", () => {
        if (concluiu) return;
        const dados = ler();
        if (Object.keys(dados).length) {
          clearTimeout(pendente);
          void enviar("partial", { ...acumulado, ...dados }, { keepalive: true });
        }
      });

      return api;
    },
  };

  return api;
}

export const OversoLead = { init };
if (typeof window !== "undefined") window.OversoLead = OversoLead;
