/* ================================================================
   Painel flutuante — Gráfico de Séries Semanais (colunas)
   Corrigido: botão fechar funcionando e limpeza adequada
   ================================================================ */

/* CONFIG */
const FLOAT_PANEL_ID = "painel-flutuante-series-semanais";
const FLOAT_PANEL_Z = 9999;
const CHART_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";

/* ========= Carregar Chart.js somente se necessário ========= */
function ensureChartJsLoaded() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve(window.Chart);
    const s = document.createElement("script");
    s.src = CHART_CDN;
    s.onload = () => resolve(window.Chart);
    s.onerror = () => reject("Erro ao carregar Chart.js");
    document.head.appendChild(s);
  });
}

/* ========= Inserir botão no topo do painel lateral ========= */
function adicionarBotaoGraficoAoTopo() {
  try {
    const topo = document.querySelector("#painelContainer .painel-topo");
    if (!topo) return;
    if (document.getElementById("btnAbrirGraficoPainel")) return;

    const btn = document.createElement("button");
    btn.id = "btnAbrirGraficoPainel";
    btn.textContent = "Gráfico";
    btn.style.cssText = `
      margin-left:10px;
      padding:5px 10px;
      border-radius:8px;
      border:none;
      background:#cae4ff;
      cursor:pointer;
    `;
    btn.onclick = abrirPainelFlutuanteSeries;

    const titulo = topo.querySelector(".painel-titulo");
    if (titulo) titulo.insertAdjacentElement("afterend", btn);
    else topo.appendChild(btn);

  } catch (err) {
    console.error("Erro botão gráfico:", err);
  }
}

/* ========= Coletar dados do painel principal ========= */
function construirDadosSemanaPorGrupo() {
  const semanaMap = {};
  const detalhe = {};

  (TREINO_EXS || []).forEach(ex => {
    const base = BASE_EXERCICIOS.find(b => b.id === ex.exercicio_id);
    if (!base) return;

    const seriesEx = Number(ex.validas) || 0;
    if (!seriesEx) return;

    [
      { g: base.grupo1, p: base.validas1 },
      { g: base.grupo2, p: base.validas2 },
      { g: base.grupo3, p: base.validas3 },
    ].forEach(entry => {
      if (!entry.g || !entry.p) return;
      const grupo = entry.g.trim();
      const qtd = Math.round(seriesEx * Number(entry.p));

      semanaMap[grupo] = (semanaMap[grupo] || 0) + qtd;

      if (!detalhe[grupo]) detalhe[grupo] = {};
      const nome = base.exercicio || `#${base.id}`;
      detalhe[grupo][nome] = (detalhe[grupo][nome] || 0) + qtd;
    });
  });

  const lista = Object.keys(semanaMap).map(g => ({
    grupo: g,
    total: semanaMap[g]
  })).sort((a, b) => b.total - a.total);

  const labels = lista.map(i => i.grupo);
  const values = lista.map(i => i.total);

  const details = {};
  labels.forEach(g => {
    const exs = detalhe[g] || {};
    const itens = Object.keys(exs).map(k => ({
      exercicio: k,
      series: exs[k]
    })).sort((a, b) => b.series - a.series);
    details[g] = itens;
  });

  return { labels, values, details };
}

/* ========= Criar Painel Flutuante ========= */
let painelState = {
  chart: null,
  tooltip: null,
  root: null,
  boundWindowMove: null,
  boundWindowUp: null
};

async function abrirPainelFlutuanteSeries() {
  try {
    if (document.getElementById(FLOAT_PANEL_ID)) {
      const p = document.getElementById(FLOAT_PANEL_ID);
      p.style.display = "block";
      p.style.zIndex = FLOAT_PANEL_Z;
      return;
    }

    await ensureChartJsLoaded();

    const root = document.createElement("div");
    root.id = FLOAT_PANEL_ID;
    root.style.cssText = `
      position:fixed;
      left: calc(50% - 320px);
      top: calc(50% - 210px);
      width:640px;
      height:420px;
      background:#fff;
      box-shadow:0 8px 30px rgba(0,0,0,0.18);
      border-radius:12px;
      padding:10px;
      display:flex;
      flex-direction:column;
      gap:10px;
      z-index:${FLOAT_PANEL_Z};
    `;
    painelState.root = root;

    /* CABEÇALHO */
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex;
      justify-content:space-between;
      align-items:center;
      cursor:grab;
      padding:0 4px;
    `;

    const titulo = document.createElement("div");
    titulo.textContent = "Séries semanais";
    titulo.style.cssText = `font-size:15px; font-weight:700;`;

    const btnX = document.createElement("button");
    btnX.textContent = "✕";
    btnX.setAttribute("aria-label", "Fechar");
    btnX.style.cssText = `
      background:none; border:none; cursor:pointer;
      font-size:16px; padding:4px;
    `;
    // evita que o pointerdown do header capture o clique do botão
    btnX.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
    });
    // ação de fechar: destrói chart, tooltip e remove root
    btnX.addEventListener("click", () => {
      cleanupPainelFlutuante();
    });

    header.appendChild(titulo);
    header.appendChild(btnX);

    /* CANVAS */
    const wrap = document.createElement("div");
    wrap.style.cssText = "flex:1; display:flex;";
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);

    /* Tooltip custom */
    const tt = document.createElement("div");
    tt.style.cssText = `
      position:fixed;
      background:rgba(15, 15, 15, 0.92);
      color:#fff;
      padding:8px;
      border-radius:8px;
      font-size:12px;
      display:none;
      max-width:260px;
      pointer-events:none;
      z-index:${FLOAT_PANEL_Z + 1};
    `;
    document.body.appendChild(tt);
    painelState.tooltip = tt;

    /* Montar tudo */
    root.appendChild(header);
    root.appendChild(wrap);
    document.body.appendChild(root);

    /* Torna arrastável */
    makeElementDraggable(root, header);

    const dados = construirDadosSemanaPorGrupo();
    if (!dados.labels.length) {
      wrap.innerHTML = "<div style='margin:auto;color:#666'>Sem dados.</div>";
      return;
    }

    /* Gráfico */
    const ctx = canvas.getContext("2d");
    painelState.chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: dados.labels,
        datasets: [{
          label: "Séries",
          data: dados.values,
          backgroundColor: "rgba(54,162,235,0.9)",
          hoverBackgroundColor: "rgba(40,140,210,0.9)",
          borderRadius: 6
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        },
        plugins: {
          tooltip: { enabled: false }
        },
        onHover: (event, elements) => {
          const e = elements && elements[0];
          if (!e) {
            hideCustomTooltip();
            return;
          }

          const i = e.index;
          const label = dados.labels[i];
          const total = dados.values[i];
          const det = dados.details[label];

          // event.x/event.y são fornecidos pelo Chart.js v4
          showCustomTooltip(label, total, det, event.x, event.y);
        }
      }
    });

  } catch (err) {
    console.error(err);
  }
}

/* ========= Cleanup: destruir chart, tooltip, remover root ========= */
function cleanupPainelFlutuante() {
  try {
    if (painelState.chart) {
      try { painelState.chart.destroy(); } catch (_) {}
      painelState.chart = null;
    }
    if (painelState.tooltip) {
      try { painelState.tooltip.remove(); } catch (_) {}
      painelState.tooltip = null;
    }
    if (painelState.root) {
      try { painelState.root.remove(); } catch (_) {}
      painelState.root = null;
    }
  } catch (e) {
    console.error("Erro cleanup painel:", e);
  }
}

/* ========= Tooltip ========= */
function showCustomTooltip(g, total, lista, x, y) {
  const t = painelState.tooltip;
  if (!t) return;

  let html = `<b>${g}</b> — ${total} séries<br><br>`;
  lista.forEach(i => {
    html += `
      <div style="display:flex;justify-content:space-between;">
        <span>${i.exercicio}</span>
        <span style="opacity:0.7">${i.series}</span>
      </div>`;
  });

  t.innerHTML = html;
  t.style.display = "block";

  const w = t.offsetWidth || 200;
  const h = t.offsetHeight || 100;

  let left = x + 12;
  let top = y + 12;

  if (left + w > window.innerWidth) left = x - w - 12;
  if (top + h > window.innerHeight) top = y - h - 12;

  t.style.left = left + "px";
  t.style.top = top + "px";
}

function hideCustomTooltip() {
  if (painelState.tooltip) painelState.tooltip.style.display = "none";
}

/* ========= Draggable ========= */
function makeElementDraggable(box, handle) {
  let down = false, offX = 0, offY = 0;

  handle.addEventListener("pointerdown", (e) => {
    // ignore pointerdown coming from a button inside header
    if (e.target && (e.target.tagName === "BUTTON" || e.target.closest("button"))) return;
    down = true;
    offX = e.clientX - box.offsetLeft;
    offY = e.clientY - box.offsetTop;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
  });

  function onMove(e) {
    if (!down) return;
    box.style.left = (e.clientX - offX) + "px";
    box.style.top = (e.clientY - offY) + "px";
  }

  function onUp(e) {
    if (!down) return;
    down = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  // guardar referências caso precise remover listeners futuramente
  painelState.boundWindowMove = onMove;
  painelState.boundWindowUp = onUp;
}

/* ========= Inicialização ========= */
(function init() {
  adicionarBotaoGraficoAoTopo();
  const obs = document.querySelector("#painelContainer");
  if (!obs) return;
  const mo = new MutationObserver(() => adicionarBotaoGraficoAoTopo());
  mo.observe(obs, { childList: true, subtree: true });
})();
