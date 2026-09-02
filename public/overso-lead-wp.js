/**
 * OVERSO Lead — versão WordPress / Elementor.
 *
 * Autocontido, sem imports e sem dependências: entra como <script> puro num
 * snippet do WPCode ou no Custom Code do Elementor Pro. Nenhum build.
 *
 * Detecta sozinho Elementor Pro, Contact Form 7, WPForms e <form> comum.
 */
(function () {
  "use strict";

  // ─── Configuração ────────────────────────────────────────────────
  var CFG = {
    url: "https://SEU-PROJETO.supabase.co",
    anonKey: "SUA_ANON_KEY",
    key: "INGEST_KEY_DESTE_SITE", // uma por site — ver README
  };

  if (CFG.key.indexOf("INGEST_KEY") === 0) {
    console.warn("[overso] ingest_key não configurada — captura desligada.");
    return;
  }

  var ENDPOINT = CFG.url.replace(/\/$/, "") + "/rest/v1/rpc/capture_lead";
  var SS_SESSAO = "overso:sid";
  var SS_UTMS = "overso:utms";

  // ─── Sessão ──────────────────────────────────────────────────────
  // O mesmo id da abertura até o envio: é o que faz o lead parcial VIRAR o
  // completo em vez de criar uma segunda linha.
  var sessao;
  try {
    sessao = sessionStorage.getItem(SS_SESSAO);
    if (!sessao) {
      sessao = "wp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem(SS_SESSAO, sessao);
    }
  } catch (e) {
    sessao = "wp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  }

  // ─── UTMs (primeiro toque) ───────────────────────────────────────
  var utms = {};
  try {
    var salvo = sessionStorage.getItem(SS_UTMS);
    if (salvo) {
      utms = JSON.parse(salvo);
    } else {
      var p = new URLSearchParams(location.search);
      var campos = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid"];
      for (var i = 0; i < campos.length; i++) {
        var v = p.get(campos[i]);
        if (v) utms[campos[i]] = v;
      }
      if (document.referrer && document.referrer.indexOf(location.hostname) === -1) {
        utms.referrer = document.referrer;
      }
      sessionStorage.setItem(SS_UTMS, JSON.stringify(utms));
    }
  } catch (e) {}

  // ─── Envio ───────────────────────────────────────────────────────
  function enviar(evento, dados, keepalive) {
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: {
          apikey: CFG.anonKey,
          Authorization: "Bearer " + CFG.anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_key: CFG.key,
          p_session: sessao,
          p_evento: evento,
          p_dados: dados || {},
          p_utms: utms,
          p_origem: location.href,
        }),
        // Deixa a requisição terminar mesmo se a aba fechar — é o que
        // permite registrar quem preencheu e desistiu.
        keepalive: !!keepalive,
      })["catch"](function () {
        // Nunca propaga: o formulário do cliente não pode quebrar porque o
        // CRM está fora do ar.
      });
    } catch (e) {}
  }

  // ─── Leitura dos campos ──────────────────────────────────────────
  /**
   * Elementor nomeia os inputs como `form_fields[nome]`; CF7 e WPForms usam
   * variações parecidas. Sem normalizar, o CRM gravaria a chave com colchetes
   * e o painel mostraria "form_fields[nome]" no lugar de "nome".
   */
  function normalizar(nome) {
    // O "[]" do checkbox sai primeiro: sem isso "form_fields[curso][]" não
    // casa o grupo final e o prefixo "form_fields" sobreviveria na chave.
    var limpo = nome.replace(/\[\]\s*$/, "");
    var m = limpo.match(/\[([^\]]+)\]\s*$/);
    return m ? m[1] : limpo;
  }

  var IGNORAR = /^(_wpnonce|_wp_http_referer|post_id|form_id|referer_title|queried_id|action|_wpcf7)/;

  function lerForm(form) {
    var dados = {};
    var campos = form.querySelectorAll("input[name], select[name], textarea[name]");

    for (var i = 0; i < campos.length; i++) {
      var c = campos[i];
      if (!c.name || IGNORAR.test(c.name)) continue;
      if (c.type === "hidden" || c.type === "submit" || c.type === "button") continue;

      var chave = normalizar(c.name);

      if (c.type === "checkbox") {
        if (c.checked) {
          if (!dados[chave]) dados[chave] = [];
          if (Object.prototype.toString.call(dados[chave]) === "[object Array]") {
            dados[chave].push(c.value);
          }
        }
      } else if (c.type === "radio") {
        if (c.checked) dados[chave] = c.value;
      } else if (c.value && String(c.value).trim()) {
        dados[chave] = String(c.value).trim();
      }
    }
    return dados;
  }

  function temConteudo(o) {
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) return true;
    return false;
  }

  // ─── Abertura do formulário ──────────────────────────────────────
  // Dispara quando o form fica VISÍVEL, não quando a página carrega: num
  // site WordPress o formulário costuma estar no rodapé ou dentro de popup,
  // e contar a página inteira inflaria o topo do funil.
  var abertos = [];
  var jaAbriu = false;

  function marcarAbertura(form) {
    if (abertos.indexOf(form) !== -1) return;
    abertos.push(form);
    if (jaAbriu) return;
    jaAbriu = true;
    enviar("form_open", {});
  }

  var observador = window.IntersectionObserver
    ? new IntersectionObserver(
        function (entradas) {
          for (var i = 0; i < entradas.length; i++) {
            if (entradas[i].isIntersecting) marcarAbertura(entradas[i].target);
          }
        },
        { threshold: 0.3 },
      )
    : null;

  function registrar(form) {
    if (form.__overso) return;
    form.__overso = true;
    if (observador) observador.observe(form);
    else marcarAbertura(form);
  }

  function varrer() {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) registrar(forms[i]);
  }

  // ─── Lead parcial ────────────────────────────────────────────────
  var pendente = null;
  var acumulado = {};
  var concluiu = false;

  function agendarParcial(form) {
    var dados = lerForm(form);
    for (var k in dados) if (Object.prototype.hasOwnProperty.call(dados, k)) acumulado[k] = dados[k];
    if (concluiu || !temConteudo(acumulado)) return;

    clearTimeout(pendente);
    // Espera a digitação parar: sem isso seria uma requisição por tecla.
    pendente = setTimeout(function () {
      enviar("partial", acumulado, true);
    }, 2500);
  }

  function aoDigitar(e) {
    var form = e.target && e.target.form;
    if (form) agendarParcial(form);
  }

  document.addEventListener("input", aoDigitar, true);
  document.addEventListener("change", aoDigitar, true);

  // ─── Envio concluído ─────────────────────────────────────────────
  function concluir(form) {
    if (concluiu) return;
    concluiu = true;
    clearTimeout(pendente);

    var dados = lerForm(form);
    for (var k in dados) if (Object.prototype.hasOwnProperty.call(dados, k)) acumulado[k] = dados[k];
    enviar("complete", acumulado, true);

    // Renova a sessão após o envio: o próximo preenchimento na mesma aba vira
    // um lead NOVO em vez de sobrescrever este. Sem isto, quem preenche pra si
    // e depois pra um amigo apagava o primeiro — e testar várias vezes seguidas
    // mostrava só um lead. A mescla parcial->completo continua valendo, porque
    // ela acontece dentro de um preenchimento, antes deste ponto.
    setTimeout(function () {
      sessao = "wp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
      try {
        sessionStorage.setItem(SS_SESSAO, sessao);
      } catch (e) {}
      acumulado = {};
      concluiu = false;
      jaAbriu = false;
      abertos = [];
      if (window.OversoLead) OversoLead.sessao = sessao;
    }, 1200);
  }

  // Elementor Pro e Contact Form 7 enviam por AJAX e só then avisam se deu
  // certo. Escutar esses eventos (em vez do submit nativo) evita registrar
  // lead que a validação do servidor recusou.
  // jQuery pode AINDA NÃO EXISTIR quando este script roda — depende de onde o
  // WordPress injeta cada coisa. Checar uma vez só era um bug: quando o
  // script chegava antes do jQuery, o handler nunca era ligado e o "complete"
  // nunca disparava (o parcial continuava funcionando, porque não usa jQuery).
  // Por isso insistimos por ~15s em vez de checar uma vez.
  var tentativas = 0;
  (function ligarJQuery() {
    if (window.jQuery) {
      window.jQuery(document).on("submit_success", function (e) {
        if (e && e.target) concluir(e.target);
      });
      return;
    }
    if (++tentativas < 60) setTimeout(ligarJQuery, 250);
  })();

  // Segunda camada: se o submit_success não vier (tema que troca o jQuery,
  // Elementor antigo, conflito de plugin), a mensagem de sucesso na tela é
  // prova de que o envio deu certo.
  function ehSucesso(no) {
    if (!no || no.nodeType !== 1) return false;
    if (no.classList && no.classList.contains("elementor-message-success")) return true;
    return !!(no.querySelector && no.querySelector(".elementor-message-success"));
  }

  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var novos = muts[i].addedNodes;
        for (var j = 0; j < novos.length; j++) {
          if (!ehSucesso(novos[j])) continue;
          var form = novos[j].closest ? novos[j].closest("form") : null;
          concluir(form || document.querySelector("form"));
          return;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener(
    "wpcf7mailsent",
    function (e) {
      if (e && e.target) concluir(e.target);
    },
    false,
  );

  // WPForms e formulários comuns: sem AJAX, o submit nativo é o sinal certo.
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      // Elementor/CF7 já são cobertos acima; aqui evitamos contar duas vezes.
      if (form.classList.contains("elementor-form") || form.classList.contains("wpcf7-form")) return;
      concluir(form);
    },
    true,
  );

  // Última chance de salvar quem preencheu e fechou a aba.
  window.addEventListener("pagehide", function () {
    if (concluiu || !temConteudo(acumulado)) return;
    clearTimeout(pendente);
    enviar("partial", acumulado, true);
  });

  // ─── Diagnóstico ─────────────────────────────────────────────────
  // Marcador global: abrir o console da página PUBLICADA e digitar
  // `OversoLead` responde na hora se o script chegou até ali. Sem isto, um
  // script que nunca carregou é indistinguível de um que carregou e falhou —
  // e essa dúvida custa muito tempo de investigação.
  window.OversoLead = {
    versao: "1.1",
    sessao: sessao,
    utms: utms,
    jquery: function () {
      return !!window.jQuery;
    },
    forms: function () {
      return document.querySelectorAll("form").length;
    },
    campos: function () {
      var f = document.querySelector("form");
      return f ? lerForm(f) : "nenhum formulário na página";
    },
    // Manda um lead de teste sem precisar preencher nada.
    testar: function () {
      enviar("partial", { teste_console: new Date().toISOString() }, false);
      return "enviado — confira em Leads no painel";
    },
  };

  // ─── Início ──────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", varrer);
  } else {
    varrer();
  }

  // Popups do Elementor e formulários carregados por AJAX aparecem depois.
  if (window.MutationObserver) {
    new MutationObserver(varrer).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
