/* Jornal da Pada — a aplicação do site (privado). by Rapazis Di Zona, Lda.
 *
 * Os dados vêm cifrados (dados/*.bin). Entra-se de três formas:
 *  - utilizador + password da conta criada no Discord (/jornal);
 *  - senha da malta (visitante);
 *  - link pessoal que o bot dá no Discord (#entrar=<chave>.<perfil>).
 * Sem emojis unicode: ícones pixel da Pada (static/emojis) e ícones da interface estilo Dino Hub
 * (static/icons.svg). Todo o texto entra como texto; só o corpo dos artigos é HTML, já limpo no servidor.
 */
(() => {
  "use strict";

  const BASE = document.querySelector('meta[name="jdp-base"]').content;
  const VERSAO_INDICE = document.querySelector('meta[name="jdp-indice"]').content;
  const raiz = document.getElementById("app");
  const SESSAO = "jdp:sessao";
  const PREFS = "jdp:prefs";
  const AMBITO = "jdp:ambito";
  const PERIODO = "jdp:periodo";
  const LANDING_DIA = "jdp:landing_dia";

  const ABAS = [
    ["destaques", "bolt", "Destaques"],
    ["recentes", "clock", "Recentes"],
    ["para-ti", "star", "Para ti"],
    ["edicoes", "apps", "Edições"],
    ["curioso", "info", "Curioso Vlog"],
    ["stickers", "palette", "Stickers"],
  ];
  const PERIODOS = [["hoje", "Hoje"], ["7dias", "Últimos 7 dias"], ["mes", "Este mês"], ["ano", "Último ano"], ["tudo", "Tudo"]];
  const AMBITOS = [["todos", null, "Tudo"], ["nacional", "pada_pt", "Portugal"], ["mundo", "pada_globo", "Mundo"]];

  // ─────────────────────────── utilitários ───────────────────────────

  const guardado = {
    ler(k) {
      try { return JSON.parse(localStorage.getItem(k) || sessionStorage.getItem(k)); } catch (e) { return null; }
    },
    gravar(k, v, lembrar = true) {
      try { (lembrar ? localStorage : sessionStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ }
    },
    apagar(k) {
      try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* modo privado */ }
    },
  };

  function el(tag, props = {}, ...filhos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v; // só HTML já limpo no servidor
      else if (k === "texto") n.textContent = v;
      else if (k === "estilo") for (const [p, val] of Object.entries(v)) n.style.setProperty(p, val);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const f of filhos.flat(Infinity)) {
      if (f == null || f === false) continue;
      n.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return n;
  }

  /** Ícone pixel da Pada (colorido): secções, âmbitos, edições, reações. */
  const px = (nome, classe = "px") => nome
    ? el("img", { class: classe, src: `${BASE}/static/emojis/${nome}.svg`, alt: "", width: 20, height: 20, draggable: "false" })
    : null;

  /** Ícone da interface (uma cor, estilo Dino Hub). */
  function ico(nome, classe = "ico") {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("class", classe);
    s.setAttribute("viewBox", "0 0 16 16");
    s.setAttribute("width", "16");
    s.setAttribute("height", "16");
    s.setAttribute("aria-hidden", "true");
    const u = document.createElementNS(ns, "use");
    u.setAttribute("href", `${BASE}/static/icons.svg#i-${nome}`);
    s.append(u);
    return s;
  }

  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const deB64url = (s) => bytes(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const paraB64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const semAcentos = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const externo = (href, ...filhos) => el("a", { href, target: "_blank", rel: "noopener noreferrer nofollow" }, ...filhos);
  /** Ligação para fora que conta para as estatísticas (fonte, Discord). */
  const ligacao = (evento, n, href, ...filhos) => {
    const a = externo(href, ...filhos);
    a.addEventListener("click", () => registar(evento, { n }));
    return a;
  };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  async function sha256hex(texto) {
    const dados = typeof texto === "string" ? new TextEncoder().encode(texto) : texto;
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", dados));
    return [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  function haQuanto(iso) {
    const d = new Date(iso);
    const min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const dias = Math.round(h / 24);
    if (dias === 1) return "ontem";
    if (dias < 7) return `há ${dias} dias`;
    const outroAno = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: outroAno ? "numeric" : undefined });
  }
  const dataLonga = (iso) => {
    const d = new Date(iso);
    const outroAno = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: outroAno ? "numeric" : undefined });
  };
  const nomeMes = (id) => {
    const [a, m] = id.split("-").map(Number);
    const t = new Date(a, m - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  function imagem(src, classe) {
    const i = el("img", { class: classe, src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    i.addEventListener("error", () => (i.closest(".com-imagem") || i).remove());
    return i;
  }

  // ─────────────────────────── estado ───────────────────────────

  const E = {
    cofre: null,
    chave: null,
    perfil: null,
    indice: null,
    meses: new Map(),
    noticias: new Map(),
    ambito: guardado.ler(AMBITO) || "todos",
    periodo: null,
    rotaAnterior: "",
  };

  // ─────────────────────── estatísticas (só para o painel do dono; nunca públicas) ───────────────────────
  // Só quem já entrou envia: o endereço de envio vem dentro dos dados cifrados. Vai em lotes, de minuto a minuto.

  const A = { fila: [], url: null, sessao: Math.random().toString(36).slice(2, 10), leitura: null };

  function idDispositivo() {
    let d = guardado.ler("jdp:dispositivo");
    if (!d) {
      d = Math.random().toString(36).slice(2, 12);
      guardado.gravar("jdp:dispositivo", d);
    }
    return d;
  }

  function registar(t, dados = {}) {
    if (!A.url) return;
    A.fila.push({ t, ...dados, ts: Math.round(Date.now() / 1000) });
    if (A.fila.length >= 60) enviarEstatisticas();
  }

  function fimDeLeitura() {
    if (!A.leitura) return;
    const l = A.leitura;
    A.leitura = null;
    registar("fim", { n: l.n, p: Math.round(l.max * 100), seg: Math.round((Date.now() - l.inicio) / 1000) });
  }

  function enviarEstatisticas() {
    if (!A.url || !A.fila.length) return;
    const p = E.perfil || {};
    const lote = {
      v: 1, s: A.sessao, d: idDispositivo(), m: p.conta ? "conta" : p.discord ? "link" : "senha",
      u: p.visitante ? null : String(p.id || p.nome || ""), e: A.fila.splice(0),
    };
    const corpo = new FormData();
    corpo.append("payload_json", JSON.stringify({ content: "" }));
    corpo.append("files[0]", new Blob([JSON.stringify(lote)], { type: "application/json" }), "e.json");
    fetch(A.url, { method: "POST", body: corpo, mode: "no-cors", keepalive: true }).catch(() => {});
  }

  function ligarEstatisticas() {
    A.url = E.indice.analise || null;
    if (!A.url) return;
    registar("abrir", { w: window.innerWidth, mob: window.matchMedia("(max-width: 820px)").matches });
    setInterval(enviarEstatisticas, 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        fimDeLeitura();
        enviarEstatisticas();
      }
    });
    window.addEventListener("pagehide", () => {
      fimDeLeitura();
      enviarEstatisticas();
    });
    window.addEventListener("error", (ev) => registar("erro", { m: String(ev.message || "").slice(0, 200) }));
  }

  // ─────────────────────────── cofre ───────────────────────────

  async function abrirDados(nome, versao) {
    if (E.cofre.aberto) return (await fetch(`${BASE}/dados/${nome}.json?v=${versao}`)).json();
    const r = await fetch(`${BASE}/dados/${nome}.bin?v=${versao}`);
    if (!r.ok) throw new Error(`dados ${r.status}`);
    const b = new Uint8Array(await r.arrayBuffer());
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, E.chave, b.slice(12));
    const fluxo = new Blob([claro]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(fluxo).text());
  }

  async function abrirComPassword(senha, entrada) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
    const chaveSenha = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: bytes(entrada.sal), iterations: entrada.it || 250000 },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(entrada.iv) }, chaveSenha, bytes(entrada.ct)));
  }

  /** Entra com a conta (utilizador + password) ou, sem utilizador, com a senha da malta. */
  async function entrar(utilizador, senha, lembrar) {
    const c = E.cofre;
    const u = (utilizador || "").trim().replace(/^@/, "").toLowerCase();
    let perfil;
    let raw;
    if (u) {
      const conta = (c.contas || {})[(await sha256hex(`jornal-da-pada/conta/${u}`)).slice(0, 24)];
      if (!conta) throw new Error("conta");
      raw = await abrirComPassword(senha, conta);
      const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
      const p = bytes(conta.perfil);
      perfil = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: p.slice(0, 12) }, k, p.slice(12))));
      perfil = { ...perfil, conta: true };
      if (Array.isArray(perfil.escolhas) && perfil.escolhas.length && !guardado.ler(PREFS)) guardado.gravar(PREFS, perfil.escolhas);
    } else {
      if (!c.ct) throw new Error("senha");
      raw = await abrirComPassword(senha, c);
      perfil = { nome: "Visitante", visitante: true };
    }
    guardado.gravar(SESSAO, { k: paraB64url(raw), kid: c.kid, perfil }, lembrar);
  }

  async function linkDoDiscord() {
    const m = location.hash.match(/^#entrar=([\w-]+)\.([\w-]+)$/);
    if (!m) return null;
    history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    try {
      if (!E.cofre.aberto && (await sha256hex(deB64url(m[1]))).slice(0, 16) !== E.cofre.kid) return "antigo";
      const perfil = JSON.parse(new TextDecoder().decode(deB64url(m[2])));
      guardado.gravar(SESSAO, { k: m[1], kid: E.cofre.kid, perfil: { ...perfil, discord: true } });
      if (Array.isArray(perfil.escolhas) && perfil.escolhas.length) guardado.gravar(PREFS, perfil.escolhas);
      return "ok";
    } catch (e) {
      return "antigo";
    }
  }

  async function arrancar() {
    let emPaginaAlheia = false;  // nunca dentro de páginas de outros sites (clickjacking)
    try {
      emPaginaAlheia = window.top !== window.self && window.top.location.origin !== location.origin;
    } catch (e) {
      emPaginaAlheia = true;
    }
    if (emPaginaAlheia) return;
    // Um link pessoal aberto com o site já aberto só muda o "#": recarrega para entrar com ele.
    window.addEventListener("hashchange", () => {
      if (location.hash.startsWith("#entrar=")) location.reload();
      else if (E.indice) desenhar();
    });
    try {
      E.cofre = await (await fetch(`${BASE}/dados/cofre.json`, { cache: "no-cache" })).json();
    } catch (e) {
      return raiz.replaceChildren(el("p", { class: "arranque", texto: "Não consegui abrir o jornal. Tenta daqui a pouco." }));
    }
    const doLink = await linkDoDiscord();
    let sessao = guardado.ler(SESSAO);
    if (sessao && !E.cofre.aberto && sessao.kid !== E.cofre.kid) {
      guardado.apagar(SESSAO);
      sessao = null;
    }
    if (!sessao && !E.cofre.aberto) {
      return cadeado(doLink === "antigo" ? "Esse link já não é válido. Pede um novo ao bot (/jornal no Discord)." : "");
    }
    E.perfil = sessao ? sessao.perfil : { nome: "Visitante", visitante: true };
    try {
      if (sessao) E.chave = await crypto.subtle.importKey("raw", deB64url(sessao.k), "AES-GCM", false, ["decrypt"]);
      E.indice = await abrirDados("indice", VERSAO_INDICE);
    } catch (e) {
      guardado.apagar(SESSAO);
      return cadeado("A chave do jornal mudou. Entra outra vez.");
    }
    E.arquivos = new Set(E.indice.edicoes.filter((e) => e.arquivo).map((e) => e.id));
    E.periodo = sessionStorage.getItem(PERIODO) || (temHoje() ? "hoje" : "7dias");
    ligarEstatisticas();

    // Primeira vez do dia: se entra na raiz (#/ ou sem hash), mostra o ecrã de entrada mesmo com sessão iniciada
    const hoje = (new Date()).toLocaleDateString("en-CA");
    const jaViuHoje = guardado.ler(LANDING_DIA) === hoje;
    const r = rota();
    const eInicio = !location.hash || location.hash === "#" || location.hash === "#/" || r.nome === "destaques";
    if (!jaViuHoje && eInicio) {
      guardado.gravar(LANDING_DIA, hoje);
      return cadeado();
    }

    desenhar();
  }

  // ─────────────────────────── capas a flutuar (entrada e herói) ───────────────────────────

  const QUIETO = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Imagens a subir devagar em 4 profundidades (as de trás pequenas e desfocadas, as da frente maiores e nítidas). */
  function capasFlutuantes(capas, quantas, comPixel = false) {
    const fontes = capas.length ? capas : [];
    const pecas = [];
    const largurasBase = [
      [105, 120, 135, 150],  // prof 1 (pequenas, atrás)
      [165, 185, 205, 225],  // prof 2 (médias-pequenas)
      [250, 275, 295, 320],  // prof 3 (médias-grandes)
      [340, 375, 405, 435],  // prof 4 (grandes, primeiro plano)
    ];
    const duracoesBase = [110, 85, 66, 50];
    const ratios = ["4 / 5", "16 / 10", "1 / 1", "3 / 2", "4 / 3", "3 / 4"];
    const rotacoes = [-6, 3, -3, 5, -5, 2, -4, 4];

    for (let i = 0; i < quantas; i++) {
      const prof = (i % 4) + 1;
      const largura = largurasBase[prof - 1][i % 4];
      const dur = duracoesBase[prof - 1] + (i % 6) * 3;
      // Distribuição uniforme do atraso: cobre 100% da altura do ecrã logo no arranque
      const fase = (i / quantas) + (((i * 7) % 13) - 6) / (quantas * 13);
      const atraso = (dur * ((fase + 1) % 1)).toFixed(2);
      // Distribuição por colunas espalhadas por toda a largura (-2% a 94%)
      const x = (((i * 27.7 + prof * 13.3) % 96) - 2).toFixed(1);
      const aspect = ratios[(i * 3 + prof) % ratios.length];
      const rot = rotacoes[i % rotacoes.length];

      const peca = el("div", {
        class: `capa-flutua prof-${prof}`,
        estilo: {
          "--x": `${x}%`,
          "--w": `${largura}px`,
          "--dur": `${dur}s`,
          "--atraso": `${atraso}s`,
          "--prof": String(prof),
          "--aspect": aspect,
          "--rot": `${rot}deg`,
        },
      });
      const dentro = el("div", { class: "capa-dentro" });
      if (fontes.length) {
        dentro.append(imagem(fontes[i % fontes.length], "capa-img"));
      } else if (comPixel) {
        const nomes = (E.indice && E.indice.emojis || []).map((e) => e.nome);
        dentro.append(px(nomes.length ? nomes[i % nomes.length] : "pada_jornal", "px capa-px"));
        dentro.classList.add("so-pixel");
      }
      peca.append(dentro);
      pecas.push(peca);
    }
    return pecas;
  }

  /** As capas movem-se ao contrário do rato com efeito de profundidade 3D suave. */
  let paralaxeLigada = false;
  function paralaxe() {
    if (QUIETO || paralaxeLigada) return;
    paralaxeLigada = true;
    const raizCss = document.documentElement.style;
    let alvoX = 0, alvoY = 0, x = 0, y = 0, pedido = 0;
    const passo = () => {
      x += (alvoX - x) * 0.08;
      y += (alvoY - y) * 0.08;
      raizCss.setProperty("--mx", x.toFixed(4));
      raizCss.setProperty("--my", y.toFixed(4));
      pedido = Math.abs(alvoX - x) + Math.abs(alvoY - y) > 0.0005 ? requestAnimationFrame(passo) : 0;
    };
    window.addEventListener("pointermove", (ev) => {
      alvoX = ev.clientX / window.innerWidth - 0.5;
      alvoY = ev.clientY / window.innerHeight - 0.5;
      if (!pedido) pedido = requestAnimationFrame(passo);
    }, { passive: true });
  }

  /** Ecrã de entrada (landing): capas a flutuar, nome do jornal e o botão Entrar. */
  async function cadeado(aviso) {
    let capas = [];
    try {
      capas = ((await (await fetch(`${BASE}/dados/capas.json`, { cache: "no-cache" })).json()).capas || []);
    } catch (e) { /* sem capas: fica só o nome */ }

    const temSessao = Boolean(guardado.ler(SESSAO) || (E.chave && E.indice));

    const entrarNoJornal = () => {
      ecra.classList.add("a-sair");
      setTimeout(() => {
        if (!location.hash || location.hash === "#" || location.hash.startsWith("#entrar=")) {
          location.hash = "#/";
        }
        desenhar();
      }, QUIETO ? 0 : 350);
    };

    const erro = el("p", { class: "cofre-erro", role: "alert", texto: aviso || "" });
    const utilizador = el("input", { type: "text", name: "username", autocomplete: "username", placeholder: "Utilizador (vazio = senha da malta)" });
    const senha = el("input", { type: "password", name: "password", autocomplete: "current-password", placeholder: "Password", required: true });
    const lembrar = el("input", { type: "checkbox", checked: true });
    const botao = el("button", { class: "botao", type: "submit" }, ico("key"), "Entrar");
    const formulario = el("form", {
      class: "cofre-form",
      onsubmit: async (ev) => {
        ev.preventDefault();
        botao.disabled = true;
        erro.textContent = "";
        try {
          await entrar(utilizador.value, senha.value, lembrar.checked);
          ecra.classList.add("a-sair");
          setTimeout(() => { location.hash = "#/"; location.reload(); }, QUIETO ? 0 : 450);
        } catch (e) {
          erro.textContent = e.message === "conta"
            ? "Não conheço esse utilizador. Confirma o nome (ou cria a conta com /jornal no Discord)."
            : "Password errada. Tenta outra vez.";
          botao.disabled = false;
          caixa.classList.remove("abanar");
          void caixa.offsetWidth;
          caixa.classList.add("abanar");
        }
      },
    }, utilizador, senha, el("label", { class: "lembrar" }, lembrar, " Lembrar neste dispositivo"), botao);

    const abrir = () => {
      ecra.classList.add("a-entrar");
      setTimeout(() => utilizador.focus(), QUIETO ? 0 : 350);
    };
    const fechar = () => ecra.classList.remove("a-entrar");

    const cta = el("button", {
      class: "cta",
      type: "button",
      onclick: temSessao ? entrarNoJornal : abrir
    }, "Entrar");
    cta.addEventListener("pointerenter", () => ecra.classList.add("inundar"));
    cta.addEventListener("pointerleave", () => ecra.classList.remove("inundar"));
    cta.addEventListener("focus", () => ecra.classList.add("inundar"));
    cta.addEventListener("blur", () => ecra.classList.remove("inundar"));

    const caixa = el("div", { class: "entrada-caixa", role: "dialog", "aria-label": "Entrar no Jornal da Pada" },
      el("button", { class: "fechar", type: "button", "aria-label": "Voltar", onclick: fechar }, ico("close")),
      el("h2", { texto: "Entrar" }),
      formulario,
      erro,
      el("p", { class: "entrada-dica" }, ico("users"), " Sem conta? No Discord escreve ", el("code", { texto: "/jornal" }),
        ": escolhes o utilizador e a password, e recebes um link que entra logo."));

    const palco = el("div", { class: "palco", "aria-hidden": "true" }, capasFlutuantes(capas, 42));

    const infoSessao = temSessao
      ? el("p", { class: "entrada-sessao-info" },
          "Sessão iniciada como ", el("b", { texto: (E.perfil && E.perfil.nome) || "Membro" }),
          " · ",
          el("button", { class: "link-trocar", type: "button", onclick: abrir }, "Trocar de conta"))
      : null;

    const ecra = el("main", { class: "entrada" },
      palco,
      el("div", { class: "entrada-topo" },
        el("img", {
          class: "marca-tag",
          src: `${BASE}/static/marca/tag-linha.svg`,
          alt: "Jornal da Pada",
          style: temSessao ? "cursor: pointer" : "",
          title: temSessao ? "Entrar no jornal" : "",
          onclick: temSessao ? entrarNoJornal : null
        })),
      el("section", { class: "entrada-heroi" },
        el("h1", { class: "palavra-marca" }, el("img", { src: `${BASE}/static/marca/tag-empilhado.svg`, alt: "Jornal da Pada" })),
        el("p", { class: "palavra-editora", texto: "by Rapazis Di Zona, Lda." }),
        el("p", { class: "frase-mista" },
          el("b", { texto: "As notícias " }), "da zona ", el("b", { texto: "e do mundo, " }), "sem ", el("b", { texto: "palha." })),
        cta,
        infoSessao),
      caixa);

    ecra.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") fechar();
      else if (ev.key === "Enter" && !ecra.classList.contains("a-entrar") && temSessao) {
        entrarNoJornal();
      }
    });

    raiz.replaceChildren(ecra);
    paralaxe();
    requestAnimationFrame(() => ecra.classList.add("pronto"));
    if (aviso) abrir();
  }

  // ─────────────────────────── dados ───────────────────────────

  async function carregarMes(id) {
    if (!E.meses.has(id)) {
      const m = E.indice.meses.find((x) => x.id === id);
      if (!m) return [];
      const dados = await abrirDados(id, m.v);
      dados.noticias.forEach((n) => E.noticias.set(n.id, n));
      E.meses.set(id, dados.noticias);
    }
    return E.meses.get(id);
  }

  const mesDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  function inicioDoPeriodo(p) {
    const agora = new Date();
    if (p === "hoje") return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    if (p === "7dias") return new Date(agora - 7 * 864e5);
    if (p === "mes") return new Date(agora.getFullYear(), agora.getMonth(), 1);
    if (p === "ano") return new Date(agora - 365 * 864e5);
    return new Date(0);
  }

  function temHoje() {
    const hoje = inicioDoPeriodo("hoje");
    return E.indice.edicoes.some((e) => new Date(e.data) >= hoje);
  }

  /** Notícias do período escolhido (carrega só os meses que fazem falta, em paralelo). */
  async function noticiasDoPeriodo(p = E.periodo) {
    const inicio = inicioDoPeriodo(p);
    const primeiroMes = mesDe(inicio);
    await Promise.all(E.indice.meses.filter((m) => p === "tudo" || m.id >= primeiroMes).map((m) => carregarMes(m.id)));
    return [...E.noticias.values()].filter((n) => new Date(n.data) >= inicio);
  }

  async function todas() {
    await Promise.all(E.indice.meses.map((m) => carregarMes(m.id)));
    return [...E.noticias.values()];
  }

  async function procurarNoticia(id) {
    if (E.noticias.has(id)) return E.noticias.get(id);
    await todas();
    return E.noticias.get(id) || null;
  }

  const eVisitante = () => !!(E.perfil && E.perfil.visitante);
  const abasVisiveis = () => ABAS.filter(([id]) => id !== "para-ti" || !eVisitante());

  /** Títulos compridos levam letra mais pequena e menos grossa, para os parágrafos não ficarem esmagados. */
  const tamanhoTitulo = (t) => {
    const n = (t || "").length;
    return n > 115 ? " t-muito-longo" : n > 80 ? " t-longo" : n > 55 ? " t-medio" : "";
  };
  const eNova = (n) => Date.now() - new Date(n.data) < 6 * 36e5;

  const porAmbito = (lista) => (E.ambito === "todos" ? lista : lista.filter((n) => n.ambito === E.ambito));
  const recentesPrimeiro = (a, b) => new Date(b.data) - new Date(a.data) || (a.ordem || 0) - (b.ordem || 0);

  function votos(n) {
    const v = E.indice.votos[n.id];
    return { s: v ? v[0] : 0, c: v ? v[1] : 0, r: v ? v[2] : {} };
  }

  function quente(n) {
    const v = votos(n);
    const horas = Math.max(0, (Date.now() - new Date(n.data)) / 36e5);
    return (v.s + 2 * v.c + 1 + (n.urgente ? 3 : 0) + (n.manchete ? 2 : 0)) / Math.pow(horas + 2, 1.3);
  }

  function preferencias() {
    const p = guardado.ler(PREFS);
    return Array.isArray(p) ? p : [];
  }

  const querNoticia = (prefs, n) => prefs.includes("tudo") || prefs.includes(n.seccao)
    || (n.urgente && (prefs.includes("urgente") || prefs.includes("urgentes")));

  // ─────────────────────────── esqueleto da página ───────────────────────────

  function rota() {
    const partes = location.hash.replace(/^#\/?/, "").split("/");
    return { nome: partes[0] || "destaques", arg: decodeURIComponent(partes.slice(1).join("/")) };
  }

  const esqueleto = () => el("div", { class: "esqueleto", "aria-label": "A carregar…" },
    [0, 1, 2].map(() => el("div", { class: "esqueleto-cartao" }, el("i"), el("i"), el("i"))));

  /** Faz aparecer suavemente o que entra no ecrã (cartões, caixas), um a seguir ao outro. */
  let observador = null;
  function revelar(dentro) {
    const alvos = dentro.querySelectorAll(".revelar:not(.visivel)");
    if (QUIETO || !("IntersectionObserver" in window)) {
      alvos.forEach((a) => a.classList.add("visivel"));
      return;
    }
    observador = observador || new IntersectionObserver((entradas) => {
      entradas.filter((e) => e.isIntersecting).forEach((e, i) => {
        e.target.style.setProperty("--ordem", String(i));
        e.target.classList.add("visivel");
        observador.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -6% 0px" });
    alvos.forEach((a) => observador.observe(a));
  }

  async function desenhar() {
    const r = rota();
    if (r.nome === "landing" || r.nome === "inicio") {
      return cadeado();
    }
    const chave = `${r.nome}/${r.arg}`;
    const principal = el("main", { class: "principal", id: "conteudo" }, esqueleto());
    const direita = el("aside", { class: "barra direita" });
    raiz.replaceChildren(el("div", { class: "progresso", "aria-hidden": "true" }), topo(r), abas(r),
      el("div", { class: "layout" }, barraEsquerda(r), principal, direita), tabbar(r));
    if (chave !== E.rotaAnterior) {
      window.scrollTo(0, 0);
      fimDeLeitura();
      registar("rota", { r: r.nome, a: r.nome === "pesquisa" ? undefined : r.arg || undefined });
    }
    E.rotaAnterior = chave;
    try {
      principal.replaceChildren(...[].concat(await vista(r)).filter(Boolean));
    } catch (e) {
      console.error(e);
      principal.replaceChildren(vazio("Ups, não consegui abrir isto."));
    }
    principal.classList.add("entra");
    revelar(principal);
    preencherDireita(direita).then(() => revelar(direita)).catch(console.error);
  }

  /** Barra de progresso da leitura (só nos artigos). */
  window.addEventListener("scroll", () => {
    const barra = document.querySelector(".progresso");
    const artigo = document.querySelector(".artigo");
    if (!barra) return;
    if (!artigo) {
      barra.style.transform = "scaleX(0)";
      return;
    }
    const r = artigo.getBoundingClientRect();
    const feito = Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / Math.max(1, r.height - window.innerHeight * 0.4)));
    barra.style.transform = `scaleX(${feito})`;
    if (A.leitura) A.leitura.max = Math.max(A.leitura.max, feito);
  }, { passive: true });

  /** «/» vai para a pesquisa (como no Reddit e no GitHub). */
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "/" || /input|textarea|select/i.test(document.activeElement.tagName)) return;
    const campo = document.querySelector(".pesquisa input");
    if (campo) {
      ev.preventDefault();
      campo.focus();
    }
  });

  function avatar(p, classe = "avatar") {
    return p.avatar
      ? el("img", { class: classe, src: p.avatar, alt: "", referrerpolicy: "no-referrer" })
      : el("span", { class: `${classe} avatar-letra`, texto: (p.nome || "?").slice(0, 1).toUpperCase() });
  }

  function topo(r) {
    const p = E.perfil;
    const aoClicarLogo = (ev) => {
      const atual = rota();
      if (atual.nome === "destaques") {
        ev.preventDefault();
        cadeado();
      }
    };
    return el("header", { class: "topo" },
      el("a", { class: "marca", href: "#/", title: "Destaques", onclick: aoClicarLogo },
        el("img", { class: "marca-tag", src: `${BASE}/static/marca/tag-linha.svg`, alt: E.indice.jornal.nome })),
      el("form", {
        class: "pesquisa",
        role: "search",
        onsubmit: (ev) => {
          ev.preventDefault();
          const q = ev.target.elements.q.value.trim();
          if (q) {
            registar("pesquisa", { q: q.slice(0, 60) });
            location.hash = `#/pesquisa/${encodeURIComponent(q)}`;
          }
        },
      }, ico("search"),
        el("input", { name: "q", type: "search", placeholder: "Pesquisar no jornal…", "aria-label": "Pesquisar", value: r.nome === "pesquisa" ? r.arg : "" }),
        el("kbd", { class: "atalho", title: "Atalho: /", texto: "/" })),
      eVisitante()
        ? el("a", { class: "utilizador visitante", href: "#/conta", title: "Estás como visitante: entra com a tua conta" }, el("span", { class: "avatar avatar-visitante" }, ico("user")), el("span", { class: "utilizador-nome", texto: "Visitante" }))
        : el("a", { class: "utilizador", href: "#/conta", title: "A tua conta" }, avatar(p), el("span", { class: "utilizador-nome", texto: p.nome })));
  }

  function abas(r) {
    return el("nav", { class: "abas", "aria-label": "Separadores" },
      el("div", { class: "abas-dentro" }, abasVisiveis().map(([id, icone, nome]) =>
        el("a", { class: `aba${r.nome === id ? " ativa" : ""}`, href: `#/${id}` }, ico(icone), nome))));
  }

  function tabbar(r) {
    return el("nav", { class: "tabbar", "aria-label": "Separadores" }, abasVisiveis().slice(0, 5).map(([id, icone, nome]) =>
      el("a", { class: r.nome === id ? "ativa" : "", href: `#/${id}` }, ico(icone, "ico ico-tab"), el("small", { texto: nome }))));
  }

  function barraEsquerda(r) {
    const i = E.indice;
    const escolherAmbito = (valor) => () => {
      E.ambito = valor;
      guardado.gravar(AMBITO, valor);
      registar("ambito", { v: valor });
      desenhar();
    };
    return el("aside", { class: "barra esquerda" },
      el("section", { class: "caixa" },
        el("h3", { texto: "Mostrar" }),
        el("div", { class: "filtro-ambito" }, AMBITOS.map(([v, pixel, nome]) =>
          el("button", { class: `pilula${E.ambito === v ? " ativa" : ""}`, type: "button", "aria-pressed": String(E.ambito === v), onclick: escolherAmbito(v) },
            pixel ? px(pixel, "px px-16") : ico("apps"), nome)))),
      el("section", { class: "caixa" },
        el("h3", { texto: "Secções" }),
        el("ul", { class: "lista-seccoes" }, Object.entries(i.seccoes).map(([k, s]) =>
          el("li", {}, el("a", { href: `#/s/${k}`, class: r.nome === "s" && r.arg === k ? "ativa" : "", estilo: { "--cor": s.cor } },
            px(s.pixel), el("span", { texto: s.nome }), el("small", { texto: (i.contagem || {})[k] || 0 })))))),
      ligacoesDiscord());
  }

  function ligacoesDiscord() {
    const d = E.indice.discord || {};
    if (!d.forum && !d.capa) return null;
    return el("section", { class: "caixa" },
      el("h3", { texto: "No Discord" }),
      el("ul", { class: "lista-simples" },
        d.capa && el("li", {}, externo(d.capa, px("pada_pin", "px px-16"), " Capa (entrar e alertas)")),
        d.forum && el("li", {}, externo(d.forum, px("pada_jornal", "px px-16"), " Fórum #jornal-da-pada")),
        d.cuvlog && el("li", {}, externo(d.cuvlog, px("pada_cerebro", "px px-16"), " #cu-vlog"))));
  }

  const iconeSeccao = (n) => (E.indice.seccoes[n.seccao] || {}).pixel;
  const iconeEdicao = (e) => (e.arquivo ? "pada_livro" : ((E.indice.tipos[e.tipo] || {}).pixel));

  async function preencherDireita(aside) {
    const i = E.indice;
    const caixas = [];
    const ultima = i.edicoes.find((e) => !e.arquivo) || i.edicoes[0];
    if (ultima) {
      await carregarMes(ultima.mes);
      caixas.push(el("section", { class: "caixa revelar" },
        el("h3", {}, px(iconeEdicao(ultima), "px px-16"), ` Última edição`),
        el("p", { class: "suave pequeno", texto: `${ultima.nome} · ${dataLonga(ultima.data)}` }),
        el("ol", { class: "lista-manchetes" }, ultima.noticias.slice(0, 6).map((id) => E.noticias.get(id)).filter(Boolean)
          .map((n) => el("li", {}, el("a", { href: `#/n/${n.id}` }, px(iconeSeccao(n), "px px-16"), el("span", { texto: n.curto || n.titulo }))))),
        el("a", { class: "ver-mais", href: `#/edicao/${ultima.id}` }, "Edição completa", ico("chevron-right"))));
    }
    const semana = porAmbito(await noticiasDoPeriodo("7dias")).filter((n) => votos(n).s + votos(n).c > 0)
      .sort((a, b) => (votos(b).s + 2 * votos(b).c) - (votos(a).s + 2 * votos(a).c)).slice(0, 5);
    if (semana.length) {
      caixas.push(el("section", { class: "caixa revelar" },
        el("h3", {}, px("pada_fogo", "px px-16"), " Mais votadas da semana"),
        el("ol", { class: "lista-manchetes" }, semana.map((n) =>
          el("li", {}, el("a", { href: `#/n/${n.id}` }, px(iconeSeccao(n), "px px-16"), el("span", { texto: n.curto || n.titulo })),
            el("small", { class: "suave contagem" }, px("pada_fogo", "px px-12"), ` ${votos(n).s}  `, ico("terminal", "ico ico-12"), ` ${votos(n).c}`))))));
    }
    const semanalRecente = (i.resumos || []).find((x) => x.tipo === "semanal");
    if (semanalRecente) {
      await Promise.all(semanalRecente.meses.map(carregarMes));
      caixas.push(el("section", { class: "caixa revelar" },
        el("h3", {}, px("pada_livro", "px px-16"), " Semanal"),
        el("p", { class: "suave pequeno", texto: semanalRecente.titulo.replace(/^Semanal da Pada · /, "") }),
        el("ol", { class: "lista-manchetes" }, noticiasDoResumo(semanalRecente).slice(0, 5).map((n) =>
          el("li", {}, el("a", { href: `#/n/${n.id}` }, px(iconeSeccao(n), "px px-16"), el("span", { texto: n.curto || n.titulo }))))),
        el("a", { class: "ver-mais", href: `#/resumo/${semanalRecente.id}` }, "Ver a Semanal", ico("chevron-right"))));
    }
    if (i.curiosidades.length) {
      caixas.push(el("section", { class: "caixa revelar" },
        el("h3", {}, px("pada_cerebro", "px px-16"), " Curioso Vlog"),
        i.curiosidades.slice(0, 2).map((c) => el("a", { class: "mini-curiosidade", href: "#/curioso" },
          el("small", { class: "suave" }, px(c.pixel, "px px-12"), ` #${c.numero} · ${c.tema_nome || ""}`), el("strong", { texto: c.titulo })))));
    }
    caixas.push(el("p", { class: "rodape-lateral", texto: `${i.jornal.nome} · by ${i.jornal.editora}` }));
    aside.replaceChildren(...caixas);
  }

  // ─────────────────────────── peças ───────────────────────────

  const vazio = (texto, ...extra) => el("div", { class: "vazio" }, px("pada_lag", "px vazio-px"), el("p", { texto }), ...extra);

  function cabecalho(titulo, subtitulo, cor, pixel) {
    return el("header", { class: "cabecalho", estilo: cor ? { "--cor": cor } : undefined },
      el("h1", { class: "grafiti" }, pixel ? px(pixel, "px px-titulo") : null, titulo),
      subtitulo && el("p", { class: "suave", texto: subtitulo }));
  }

  function chipSeccao(n) {
    const s = E.indice.seccoes[n.seccao] || {};
    return el("a", { class: "chip", href: `#/s/${n.seccao}`, estilo: { "--cor": s.cor || "#ccc" } }, px(s.pixel, "px px-14"), el("span", { class: "chip-txt", texto: s.nome || n.seccao }));
  }

  function metaNoticia(n) {
    const a = E.indice.ambitos[n.ambito] || { nome: "" };
    return el("div", { class: "post-meta" },
      !(n.urgente && n.seccao === "urgente") && chipSeccao(n),  // a etiqueta «Urgente» já diz tudo
      eNova(n) && el("span", { class: "chip chip-novo" }, el("i", { class: "ponto" }), el("span", { class: "chip-txt", texto: "Novo" })),
      n.urgente && el("span", { class: "chip chip-urgente" }, px("pada_raio", "px px-14"), el("span", { class: "chip-txt", texto: "Urgente" })),
      n.polemica && el("span", { class: "chip chip-polemica" }, px("pada_fogo", "px px-14"), el("span", { class: "chip-txt", texto: "Polémica" })),
      el("span", { class: "suave meta-texto" }, px(a.pixel, "px px-14"), ` ${a.nome} · ${haQuanto(n.data)} · ${n.fonte}`));
  }

  function botaoPartilhar(n, classe = "acao") {
    const rotulo = el("span", { texto: "Partilhar" });
    return el("button", {
      type: "button",
      class: classe,
      onclick: async () => {
        const url = `${location.origin}${BASE}/#/n/${n.id}`;
        registar("partilhar", { n: n.id });
        try {
          await navigator.clipboard.writeText(url);
          rotulo.textContent = "Link copiado";
        } catch (e) {
          rotulo.textContent = "Não consegui copiar";
        }
      },
    }, ico("link"), rotulo);
  }

  function cartao(n) {
    const v = votos(n);
    const s = E.indice.seccoes[n.seccao] || {};
    const discord = n.discord;
    const arquivo = E.arquivos.has(n.edicao);  // notícias de antes do jornal: não há post no Discord, logo não há votos
    return el("article", { class: "post revelar", estilo: { "--cor": s.cor || "#4dff3a" } },
      el(discord ? "a" : "div", { class: "votos", href: discord, target: discord ? "_blank" : null, rel: discord ? "noopener" : null,
        title: discord ? "Vota no Discord (reage ao post)" : (arquivo ? "Arquivo: notícia de antes do jornal" : null) },
        px(arquivo ? "pada_livro" : "pada_fogo", "px px-24"), !arquivo && el("b", { texto: v.s })),
      el("div", { class: "post-corpo" },
        metaNoticia(n),
        el("h2", { class: `post-titulo${tamanhoTitulo(n.titulo)}` }, el("a", { href: `#/n/${n.id}`, texto: n.titulo })),
        el("p", { class: "post-lead", texto: n.lead }),
        n.imagem && el("a", { class: "post-imagem com-imagem", href: `#/n/${n.id}`, tabindex: "-1", "aria-hidden": "true" }, imagem(n.imagem)),
        el("div", { class: "post-acoes" },
          discord ? ligacao("discord", n.id, discord, el("span", { class: "acao" }, ico("terminal"), plural(v.c, "comentário", "comentários")))
            : el("span", { class: "acao suave", title: "Esta notícia é do arquivo: não está no fórum" }, ico("terminal"), "Só no site"),
          el("a", { class: "acao", href: `#/n/${n.id}` }, ico("eye"), "Ler"),
          ligacao("fonte", n.id, n.fonte_url, el("span", { class: "acao" }, ico("external"), "Fonte")),
          botaoPartilhar(n))));
  }

  const POR_PAGINA = 25;

  function feed(lista, vazioTexto) {
    const filtradas = porAmbito(lista);
    if (!filtradas.length) return vazioPeriodo(vazioTexto);
    const caixa = el("div", { class: "feed" });
    let mostradas = 0;
    const mais = el("button", { class: "botao secundario ver-mais-botao", type: "button" }, ico("arrow-down"), "Mostrar mais");
    const continuar = () => {
      caixa.append(...filtradas.slice(mostradas, mostradas + POR_PAGINA).map(cartao));
      mostradas += POR_PAGINA;
      mais.hidden = mostradas >= filtradas.length;
    };
    mais.addEventListener("click", continuar);
    continuar();
    return el("div", {}, caixa, mais);
  }

  function vazioPeriodo(texto) {
    const outro = E.periodo === "hoje" ? "7dias" : E.periodo !== "tudo" ? "tudo" : null;
    const nomes = Object.fromEntries(PERIODOS);
    return vazio(texto || `Nada por aqui (${nomes[E.periodo].toLowerCase()}).`,
      outro && el("button", { class: "botao secundario", type: "button", onclick: () => mudarPeriodo(outro) }, `Ver ${nomes[outro].toLowerCase()}`));
  }

  function mudarPeriodo(p) {
    E.periodo = p;
    registar("periodo", { v: p });
    try { sessionStorage.setItem(PERIODO, p); } catch (e) { /* modo privado */ }
    desenhar();
  }

  /** Filtro de período (lista suspensa): mostra sempre o que estás a ver. */
  function seletorPeriodo() {
    const id = "periodo";
    return el("label", { class: "periodo", for: id }, ico("filter"),
      el("span", { class: "periodo-rotulo", texto: "Período" }),
      el("select", { id, "aria-label": "Período", onchange: (ev) => mudarPeriodo(ev.target.value) },
        PERIODOS.map(([v, nome]) => el("option", { value: v, selected: E.periodo === v }, nome))),
      ico("chevron-down", "ico periodo-seta"));
  }

  function cabecalhoFeed(titulo, sub, comPeriodo = true, nivel = "h1") {
    return el("div", { class: "cabecalho-feed" },
      el("div", {}, el(nivel, { class: "grafiti", texto: titulo }), sub && el("p", { class: "suave", texto: sub })),
      comPeriodo && seletorPeriodo());
  }

  /** Herói dos Destaques: a manchete da última edição, com as capas das edições recentes a flutuar. */
  async function heroi() {
    const i = E.indice;
    const recentes = i.edicoes.filter((e) => !e.arquivo).slice(0, 8);
    const base = recentes.length ? recentes : i.edicoes.slice(0, 8);
    await Promise.all([...new Set(base.map((e) => e.mes))].map(carregarMes));
    const ed = base[0];
    if (!ed) return null;
    const manchete = E.noticias.get(ed.noticias[0]);
    const capas = [];
    const juntar = (n) => { if (n && n.imagem && !capas.includes(n.imagem)) capas.push(n.imagem); };
    base.forEach((e) => juntar(e.noticias.map((id) => E.noticias.get(id)).find((n) => n && n.imagem)));
    ed.noticias.forEach((id) => capas.length < 8 && juntar(E.noticias.get(id)));
    const total = i.edicoes.reduce((s, e) => s + e.noticias.length, 0);
    paralaxe();
    return el("section", { class: "heroi", "data-manchete": manchete ? manchete.id : null },
      el("div", { class: "palco palco-heroi", "aria-hidden": "true" }, capasFlutuantes(capas, 10, true)),
      el("div", { class: "heroi-texto" },
        el("p", { class: "heroi-edicao" }, px(iconeEdicao(ed), "px px-16"), ` ${ed.arquivo ? "Arquivo" : ed.nome} · ${dataLonga(ed.data)}`),
        manchete && el("h1", { class: `heroi-titulo${tamanhoTitulo(manchete.titulo)}` }, el("a", { href: `#/n/${manchete.id}`, texto: manchete.titulo })),
        manchete && el("p", { class: "heroi-lead", texto: manchete.lead }),
        el("div", { class: "heroi-botoes" },
          manchete && el("a", { class: "botao", href: `#/n/${manchete.id}` }, ico("eye"), "Ler a manchete"),
          el("a", { class: "botao secundario", href: `#/edicao/${ed.id}` }, ico("apps"), `Edição completa · ${ed.noticias.length}`)),
        el("p", { class: "heroi-contas" },
          el("span", {}, px("pada_jornal", "px px-14"), plural(i.edicoes.length, "edição", "edições")),
          el("span", {}, px("pada_livro", "px px-14"), plural(total, "notícia", "notícias")),
          el("span", {}, px("pada_cerebro", "px px-14"), plural(i.curiosidades.length, "curiosidade", "curiosidades")))));
  }

  // ─────────────────────────── vistas ───────────────────────────

  async function vista(r) {
    switch (r.nome) {
      case "landing":
      case "inicio": return [];
      case "destaques": return vistaDestaques();
      case "recentes": return vistaRecentes();
      case "para-ti": return vistaParaTi();
      case "edicoes": return vistaEdicoes();
      case "edicao": return vistaEdicao(r.arg);
      case "resumo": return vistaResumo(r.arg);
      case "s": return vistaSeccao(r.arg);
      case "n": return vistaNoticia(r.arg);
      case "curioso": return vistaCurioso();
      case "stickers":
      case "emojis": return vistaStickers();
      case "pesquisa": return vistaPesquisa(r.arg);
      case "conta": return vistaConta();
      default:
        location.hash = "#/";
        return [];
    }
  }

  /** Faixa «Última hora»: notícias urgentes das últimas 24 horas (só aparece se houver). */
  async function ultimaHora() {
    const urgentes = (await noticiasDoPeriodo("7dias")).filter((n) => n.urgente && Date.now() - new Date(n.data) < 864e5)
      .sort(recentesPrimeiro).slice(0, 4);
    if (!urgentes.length) return null;
    return el("section", { class: "ultima-hora", "aria-label": "Última hora" },
      el("span", { class: "ultima-hora-rotulo" }, px("pada_raio", "px px-16"), "Última hora"),
      el("div", { class: "ultima-hora-lista" }, urgentes.map((n) => el("a", { href: `#/n/${n.id}`, texto: n.curto || n.titulo }))));
  }

  async function vistaDestaques() {
    const topo = await heroi();
    const manchete = topo && topo.dataset.manchete;  // já está no herói: não se repete logo a seguir
    const lista = (await noticiasDoPeriodo()).filter((n) => n.id !== manchete).sort((a, b) => quente(b) - quente(a));
    return [await ultimaHora(), topo, cabecalhoFeed("Destaques", "O que está a dar na Pada", true, "h2"), feed(lista)];
  }

  async function vistaRecentes() {
    const lista = (await noticiasDoPeriodo()).sort(recentesPrimeiro);
    return [cabecalhoFeed("Recentes", "Do mais novo para o mais antigo"), feed(lista)];
  }

  function seletorPreferencias(depois) {
    const atuais = new Set(preferencias());
    const opcoes = [["tudo", "pada_jornal", "Tudo"], ...Object.entries(E.indice.seccoes).map(([k, s]) => [k, s.pixel, s.nome])];
    const caixas = opcoes.map(([valor, pixel, nome]) => el("label", { class: "opcao" },
      el("input", { type: "checkbox", value: valor, checked: atuais.has(valor) }), px(pixel), el("span", { texto: nome })));
    return el("form", {
      class: "seletor caixa",
      onsubmit: (ev) => {
        ev.preventDefault();
        const escolhas = [...ev.target.querySelectorAll("input:checked")].map((i) => i.value);
        guardado.gravar(PREFS, escolhas);
        registar("prefs", { v: escolhas });
        depois();
      },
    }, el("div", { class: "opcoes" }, caixas), el("button", { class: "botao", type: "submit" }, ico("save"), "Guardar"));
  }

  const dicaAlertas = () => el("p", { class: "dica" }, ico("bell"), " Queres estas notícias por mensagem privada? No Discord carrega em ",
    el("b", { texto: "Alertas" }), " na Capa ou escreve ", el("code", { texto: "/alertas" }), ".");

  function soComConta(o_que) {
    return [cabecalho("Só com conta", `${o_que} é para quem entra com a sua conta.`, "#4dff3a", "pada_chave"),
      el("div", { class: "caixa conta-convite" },
        el("p", {}, "Estás a ler como ", el("b", { texto: "visitante" }), " (com a senha da malta). Com conta tens perfil, o separador ",
          el("b", { texto: "Para ti" }), " com as tuas secções e alertas por mensagem privada."),
        el("ol", {},
          el("li", {}, "No Discord escreve ", el("code", { texto: "/jornal" }), " e escolhe o teu utilizador e a tua password."),
          el("li", {}, "Volta aqui, carrega em ", el("b", { texto: "Entrar com a minha conta" }), " e entra com eles.")),
        el("button", { class: "botao", type: "button", onclick: sair }, ico("key"), "Entrar com a minha conta"))];
  }

  function sair() {
    registar("sair");
    enviarEstatisticas();
    guardado.apagar(SESSAO);
    location.hash = "#/";
    location.reload();
  }

  async function vistaParaTi() {
    if (eVisitante()) return soComConta("O «Para ti»");
    const prefs = preferencias();
    if (!prefs.length) {
      return [cabecalhoFeed("Para ti", "Escolhe o que te interessa e o jornal fica à tua medida", false), seletorPreferencias(desenhar), dicaAlertas()];
    }
    const lista = (await noticiasDoPeriodo()).filter((n) => querNoticia(prefs, n)).sort(recentesPrimeiro);
    const editar = el("details", { class: "editar-prefs" }, el("summary", {}, ico("edit"), " Mudar o que vejo aqui"), seletorPreferencias(desenhar));
    return [cabecalhoFeed("Para ti", `As tuas secções, ${E.perfil.nome}`), editar, feed(lista), dicaAlertas()];
  }

  // ── Edições: Mês › Semana › Dia (Mensal e Semanal em destaque; no dia, Manhã → Tarde → Noite) ──

  const ORDEM_TIPO = { manha: 0, tarde: 1, noite: 2 };
  const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function segundaDe(data) {
    const d = new Date(data);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  const curtaData = (d) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  const diaSemana = (d) => d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });

  function noticiasDoResumo(r) {
    return r.noticias.map((id) => E.noticias.get(id)).filter(Boolean);
  }

  function cartaoResumo(r, grande) {
    const tipo = (E.indice.tipos_resumo || {})[r.tipo] || {};
    const nots = noticiasDoResumo(r);
    const imagens = nots.filter((n) => n.imagem).slice(0, grande ? 4 : 0);
    return el("a", { class: `resumo-cartao ${r.tipo} revelar`, href: `#/resumo/${r.id}` },
      imagens.length ? el("div", { class: "resumo-mosaico" }, imagens.map((n) => el("div", { class: "com-imagem" }, imagem(n.imagem)))) : null,
      el("div", { class: "resumo-texto" },
        el("span", { class: "resumo-tipo" }, px(tipo.pixel, "px px-16"), tipo.nome || r.nome),
        el("strong", { texto: r.titulo.replace(/^(Semanal|Mensal) da Pada · /, "") }),
        el("small", { class: "suave", texto: `${plural(r.noticias.length, "notícia", "notícias")} · as mais quentes` }),
        el("ol", {}, nots.slice(0, 3).map((n) => el("li", {}, px(iconeSeccao(n), "px px-14"), el("span", { texto: n.curto || n.titulo }))))));
  }

  function cartaoEdicao(e) {
    const nots = e.noticias.map((id) => E.noticias.get(id)).filter(Boolean);
    return el("a", { class: `edicao-cartao${e.arquivo ? " arquivo" : ""} revelar`, href: `#/edicao/${e.id}` },
      el("div", { class: "edicao-topo" }, px(iconeEdicao(e), "px px-24"),
        el("strong", { texto: e.arquivo ? "Arquivo" : ((E.indice.tipos[e.tipo] || {}).nome || e.nome) }),
        el("small", { class: "suave", texto: plural(e.noticias.length, "notícia", "notícias") })),
      el("ul", {}, nots.slice(0, 2).map((n) => el("li", {}, px(iconeSeccao(n), "px px-14"), el("span", { texto: n.curto || n.titulo })))));
  }

  async function vistaEdicoes() {
    const i = E.indice;
    const resumos = i.resumos || [];
    const mensal = new Map(resumos.filter((r) => r.tipo === "mensal").map((r) => [r.id.slice(-7), r]));
    const semanal = new Map(resumos.filter((r) => r.tipo === "semanal").map((r) => [chaveDia(new Date(r.inicio)), r]));
    const meses = new Map();
    for (const e of i.edicoes) {
      const d = new Date(e.data);
      const semanas = meses.get(e.mes) || meses.set(e.mes, new Map()).get(e.mes);
      const kSem = chaveDia(segundaDe(d));
      const dias = semanas.get(kSem) || semanas.set(kSem, new Map()).get(kSem);
      const kDia = chaveDia(d);
      (dias.get(kDia) || dias.set(kDia, []).get(kDia)).push(e);
    }
    const listaMeses = [...meses.keys()].sort().reverse();
    const caixa = el("div", { class: "arvore-edicoes" });
    const mais = el("button", { class: "botao secundario ver-mais-botao", type: "button" }, ico("arrow-down"), "Meses anteriores");
    let mostrados = 0;
    const continuar = async () => {
      const lote = listaMeses.slice(mostrados, mostrados + 2);
      const precisos = new Set(lote);
      lote.forEach((m) => [...resumos].filter((r) => r.meses.some((x) => x === m)).forEach((r) => r.meses.forEach((x) => precisos.add(x))));
      await Promise.all([...precisos].map(carregarMes));
      for (const mes of lote) {
        const bloco = el("section", { class: "mes-bloco" }, el("h2", { class: "mes-titulo grafiti", texto: nomeMes(mes) }));
        if (mensal.has(mes)) bloco.append(cartaoResumo(mensal.get(mes), true));
        const semanas = meses.get(mes);
        for (const kSem of [...semanas.keys()].sort().reverse()) {
          const inicio = new Date(`${kSem}T00:00:00`);
          const fimSemana = new Date(inicio.getTime() + 6 * 864e5);
          const sem = el("div", { class: "semana-bloco" },
            el("h3", { class: "semana-titulo", texto: `Semana de ${curtaData(inicio)} a ${curtaData(fimSemana)}` }));
          if (semanal.has(kSem)) sem.append(cartaoResumo(semanal.get(kSem), false));
          const dias = semanas.get(kSem);
          for (const kDia of [...dias.keys()].sort().reverse()) {
            const eds = dias.get(kDia).sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 3) - (ORDEM_TIPO[b.tipo] ?? 3) || (a.arquivo - b.arquivo));
            sem.append(el("div", { class: "dia-linha" },
              el("span", { class: "dia-data", texto: diaSemana(new Date(`${kDia}T12:00:00`)) }),
              el("div", { class: "dia-edicoes" }, eds.map(cartaoEdicao))));
          }
          bloco.append(sem);
        }
        caixa.append(bloco);
      }
      mostrados += lote.length;
      mais.hidden = mostrados >= listaMeses.length;
      revelar(caixa);
    };
    mais.addEventListener("click", continuar);
    await continuar();
    return [cabecalhoFeed("Edições", "Mensal › Semanal › as edições de cada dia. As de arquivo são notícias reais de antes do jornal.", false),
      listaMeses.length ? caixa : vazio("Ainda não saiu nenhuma edição."), mais];
  }

  async function vistaResumo(id) {
    const r = (E.indice.resumos || []).find((x) => x.id === id);
    if (!r) return vazio("Este resumo já não está no site.");
    await Promise.all(r.meses.map(carregarMes));
    const tipo = (E.indice.tipos_resumo || {})[r.tipo] || {};
    const nots = noticiasDoResumo(r);
    return [cabecalho(tipo.nome || r.nome, `${r.titulo.replace(/^(Semanal|Mensal) da Pada · /, "")} · as mais quentes, pelos votos, comentários e leituras da malta`, "#4dff3a", tipo.pixel),
      el("div", { class: "feed ranking" }, nots.map((n, k) => {
        const c = cartao(n);
        c.prepend(el("span", { class: "lugar", texto: k + 1 }));
        return c;
      }))];
  }

  async function vistaEdicao(id) {
    const e = E.indice.edicoes.find((x) => x.id === id);
    if (!e) return vazio("Esta edição já não está no site.");
    await carregarMes(e.mes);
    const lista = e.noticias.map((nid) => E.noticias.get(nid)).filter(Boolean);
    return [cabecalho(e.arquivo ? "Arquivo" : e.nome, dataLonga(e.data), null, iconeEdicao(e)), el("div", { class: "feed" }, lista.map(cartao))];
  }

  async function vistaSeccao(chave) {
    const s = E.indice.seccoes[chave];
    if (!s) return vazio("Esta secção não existe.");
    const lista = (await noticiasDoPeriodo()).filter((n) => n.seccao === chave).sort(recentesPrimeiro);
    return [cabecalho(s.nome, s.linha, s.cor, s.pixel), el("div", { class: "barra-periodo" }, seletorPeriodo()), feed(lista)];
  }

  function reacoes(v) {
    const conhecidos = new Set((E.indice.emojis || []).map((e) => e.nome));
    const pares = Object.entries(v.r || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!pares.length) return null;
    return el("div", { class: "reacoes" }, pares.map(([nome, n]) =>
      el("span", { class: "reacao", title: nome }, conhecidos.has(nome) ? px(nome) : el("span", { class: "suave", texto: `:${nome}:` }), el("b", { texto: n }))));
  }

  function minutosLeitura(n) {
    const texto = `${n.lead} ${(n.pontos || []).join(" ")} ${(n.html || "").replace(/<[^>]+>/g, " ")}`;
    return Math.max(1, Math.round(texto.split(/\s+/).filter(Boolean).length / 220));
  }

  async function vistaNoticia(id) {
    const n = await procurarNoticia(id);
    if (!n) return vazio("Esta notícia já não está no site.");
    registar("ler", { n: n.id, sec: n.seccao });
    A.leitura = { n: n.id, inicio: Date.now(), max: 0 };
    const v = votos(n);
    const s = E.indice.seccoes[n.seccao] || {};
    const ed = E.indice.edicoes.find((e) => e.id === n.edicao);
    const relacionadas = [...E.noticias.values()].filter((m) => m.seccao === n.seccao && m.id !== n.id).sort(recentesPrimeiro).slice(0, 4);
    return [
      el("article", { class: "artigo", estilo: { "--cor": s.cor || "#4dff3a" } },
        el("button", { class: "voltar", type: "button", onclick: () => (history.length > 1 ? history.back() : (location.hash = "#/")) }, ico("chevron-left"), "Voltar"),
        metaNoticia(n),
        el("h1", { class: `artigo-titulo${tamanhoTitulo(n.titulo)}`, texto: n.titulo }),
        el("p", { class: "suave artigo-info" },
          ed ? el("a", { href: `#/edicao/${ed.id}` }, px(iconeEdicao(ed), "px px-16"), ` ${ed.arquivo ? "Arquivo" : ed.nome}`) : null,
          ` · ${dataLonga(n.data)} · ${minutosLeitura(n)} min de leitura · Fonte: `, ligacao("fonte", n.id, n.fonte_url, n.fonte)),
        n.imagem && el("figure", { class: "artigo-imagem com-imagem" }, imagem(n.imagem)),
        el("div", { class: "lead-caixa" }, el("strong", { texto: "Em poucas palavras: " }), n.lead),
        n.pontos && n.pontos.length ? el("ul", { class: "pontos" }, n.pontos.map((p) => el("li", { texto: p }))) : null,
        el("div", { class: "artigo-corpo", html: n.html }),
        reacoes(v),
        el("div", { class: "artigo-acoes" },
          n.discord && ligacao("discord", n.id, n.discord, el("span", { class: "botao" }, ico("terminal"), `Comentar no Discord (${v.c})`)),
          ligacao("fonte", n.id, n.fonte_url, el("span", { class: "botao secundario" }, ico("external"), "Fonte original")),
          botaoPartilhar(n, "botao secundario"))),
      relacionadas.length ? el("section", { class: "relacionadas" }, el("h2", { class: "grafiti" }, px(s.pixel, "px px-titulo"), `Mais ${s.nome || ""}`), el("div", { class: "feed" }, relacionadas.map(cartao))) : null,
    ];
  }

  function vistaCurioso() {
    const lista = E.indice.curiosidades;
    if (!lista.length) return vazio("Ainda não há curiosidades.");
    return [cabecalho("Curioso Vlog", "Não é bem notícia — é aquela coisa que vais contar à malta logo à noite.", "#ff8ad8", "pada_cerebro"),
      el("div", { class: "feed" }, lista.map((c) => el("article", { class: "post curiosidade", estilo: { "--cor": c.cor || "#ff8ad8" } },
        el("div", { class: "votos" }, px("pada_cerebro", "px px-24"), el("b", { texto: `#${c.numero}` })),
        el("div", { class: "post-corpo" },
          el("div", { class: "post-meta" }, el("span", { class: "chip", estilo: { "--cor": c.cor || "#ff8ad8" } }, px(c.pixel, "px px-14"), el("span", { class: "chip-txt", texto: c.tema_nome || "" })),
            el("span", { class: "suave", texto: haQuanto(c.data) })),
          el("h2", { class: `post-titulo${tamanhoTitulo(c.titulo)}`, texto: c.titulo }),
          el("div", { class: "curiosidade-corpo" },
            c.imagem && el("div", { class: "com-imagem" }, imagem(c.imagem, "curiosidade-imagem")),
            el("div", { class: "artigo-corpo", html: c.html })),
          el("div", { class: "post-acoes" }, externo(c.fonte_url, el("span", { class: "acao" }, ico("external"), `Saber mais: ${c.artigo || "fonte"}`)))))))];
  }

  async function partilharSticker(nome, rotulo) {
    const url = `${BASE}/static/stickers/${nome}.webp`;
    registar("sticker", { v: nome, a: "partilhar" });
    try {
      const blob = await (await fetch(url)).blob();
      const ficheiro = new File([blob], `${nome}.webp`, { type: "image/webp" });
      if (navigator.canShare && navigator.canShare({ files: [ficheiro] })) {
        await navigator.share({ files: [ficheiro], title: nome });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    rotulo.textContent = "Usa o botão WebP";
  }

  function vistaStickers() {
    const lista = E.indice.emojis || [];
    return [cabecalho("Stickers da Pada", "Os ícones pixel do jornal. No Discord já estão no servidor: escreve :pada_ para os usar.", "#4dff3a", "pada_xd"),
      el("div", { class: "caixa stickers-topo" },
        el("p", {}, el("b", { texto: "Para o WhatsApp: " }),
          "no telemóvel, carrega em Partilhar num sticker e escolhe o WhatsApp. Para o pacote todo, descarrega o ZIP e abre-o numa app de stickers (ex.: Sticker Maker)."),
        el("a", { class: "botao", href: `${BASE}/dados/stickers-pada.zip`, download: "stickers-jornal-da-pada.zip", onclick: () => registar("sticker", { a: "zip" }) }, ico("download"), "Descarregar todos (ZIP)")),
      el("div", { class: "grelha-emojis" }, lista.map((e) => {
        const rotulo = el("span", { texto: "Partilhar" });
        return el("figure", { class: "emoji-cartao revelar" },
          px(e.nome, "px emoji-grande"),
          el("figcaption", {}, el("code", { texto: `:${e.nome}:` }), el("small", { class: "suave", texto: e.descricao })),
          el("div", { class: "emoji-acoes" },
            el("button", { class: "botao-mini", type: "button", onclick: () => partilharSticker(e.nome, rotulo) }, ico("upload"), rotulo),
            el("a", { class: "botao-mini", href: `${BASE}/static/stickers/${e.nome}.webp`, download: `${e.nome}.webp`, onclick: () => registar("sticker", { v: e.nome, a: "webp" }) }, ico("download"), "WebP")));
      }))];
  }

  async function vistaPesquisa(q) {
    const termos = semAcentos(q).split(/\s+/).filter(Boolean);
    const lista = (await todas()).filter((n) => {
      const texto = semAcentos([n.titulo, n.lead, n.fonte, (n.palavras || []).join(" "), (n.pontos || []).join(" ")].join(" "));
      return termos.every((t) => texto.includes(t));
    }).sort(recentesPrimeiro);
    return [cabecalhoFeed(`«${q}»`, plural(lista.length, "resultado", "resultados"), false), feed(lista, "Nada encontrado. Tenta outras palavras.")];
  }

  function vistaConta() {
    if (eVisitante()) return soComConta("O perfil");
    const p = E.perfil;
    return [
      el("section", { class: "conta caixa" },
        avatar(p, "avatar avatar-grande"),
        el("div", {},
          el("h1", { class: "grafiti", texto: p.nome }),
          el("p", { class: "suave", texto: p.conta ? "Entraste com a tua conta" : "Entraste com o teu link do Discord" }),
          el("p", { class: "dica" }, ico("key"), p.conta ? " Para mudar a password: " : " Queres entrar também com utilizador e password? ",
            el("code", { texto: p.conta ? "/jornal-pw" : "/jornal" }), " no Discord."))),
      el("h2", { class: "titulo-seccao grafiti" }, "O teu Para ti"),
      seletorPreferencias(() => (location.hash = "#/para-ti")),
      dicaAlertas(),
      el("button", { class: "botao perigo", type: "button", onclick: sair }, ico("logout"), "Sair deste dispositivo"),
    ];
  }

  arrancar();
})();
