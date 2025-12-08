/* ================================================================
   Painel flutuante — Gráfico de Séries Semanais (colunas)
   Versão estendida: modo “Agregado” + modo “Por Treino”
   ================================================================ */

/* CONFIG */
const FLOAT_PANEL_ID = "painel-flutuante-series-semanais";
const FLOAT_PANEL_Z = 9999;
const CHART_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";

let FUSOES = null;

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

/* ========= Coletar dados para modo AGREGADO ========= */
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

 /* ==== FUSÃO DE GRUPOS ==== */
const fusoes = FUSOES = {
  "Peito": ["Peito Superior", "Peito Inferior"],
  "Costas": ["Costas Superior", "Costas Latíssimo"]
};

for (const novoNome in fusoes) {
  const originais = fusoes[novoNome];

  let somaTotal = 0;
  let somaDetalhe = {};

  // 1. somar totais
  originais.forEach(grp => {
    if (semanaMap[grp]) {
      somaTotal += semanaMap[grp];
      delete semanaMap[grp];
    }
  });

  // 2. somar detalhes
  originais.forEach(grp => {
    if (detalhe[grp]) {
      Object.entries(detalhe[grp]).forEach(([exercicio, series]) => {
        somaDetalhe[exercicio] = (somaDetalhe[exercicio] || 0) + series;
      });
      delete detalhe[grp];
    }
  });

  // 3. salvar nova fusão
  if (somaTotal > 0) {
    semanaMap[novoNome] = somaTotal;
    detalhe[novoNome] = somaDetalhe;
  }
}


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

/* ========= NOVO: Coletar dados PARA CADA TREINO SEPARADO ========= */
function construirDadosSemanaPorTreino() {
  const resultados = [];

  const treinosOrdenados = (TREINOS || []).slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  treinosOrdenados.forEach(t => {
    const semanaMap = {};
    const detalhe = {};

    const exsDoTreino = (TREINO_EXS || [])
      .filter(ex => Number(ex.treino_id) === Number(t.id));

    exsDoTreino.forEach(ex => {
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

     /* ==== FUSÃO DE GRUPOS POR TREINO ==== */
      const fusoes = FUSOES;

      for (const novoNome in fusoes) {
        const originais = fusoes[novoNome];

        let somaTotal = 0;
        let somaDetalhe = {};

        // totais
        originais.forEach(grp => {
          if (semanaMap[grp]) {
            somaTotal += semanaMap[grp];
            delete semanaMap[grp];
          }
        });

        // detalhes
        originais.forEach(grp => {
          if (detalhe[grp]) {
            Object.entries(detalhe[grp]).forEach(([exercicio, series]) => {
              somaDetalhe[exercicio] = (somaDetalhe[exercicio] || 0) + series;
            });
            delete detalhe[grp];
          }
        });

        // grava grupo fundido
        if (somaTotal > 0) {
          semanaMap[novoNome] = somaTotal;
          detalhe[novoNome] = somaDetalhe;
        }
      }
     
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

    resultados.push({
      treinoId: t.id,
      nomeTreino: t.nome_treino || `Treino ${t.id}`,
      labels,
      values,
      details
    });
  });

  return resultados;
}

/* ========= STATE ========= */
let painelState = {
  charts: [],
  tooltip: null,
  root: null
};

function destruirChartsAtuais() {
  painelState.charts.forEach(c => {
    try { c.destroy(); } catch (_) {}
  });
  painelState.charts = [];
}

/* ========= RENDER: AGREGADO ========= */
function renderGraficoAgregado(wrap) {
  wrap.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:100%; height:100%;";
  wrap.appendChild(canvas);

  const dados = construirDadosSemanaPorGrupo();
  if (!dados.labels.length) {
    wrap.innerHTML = "<div style='margin:auto;color:#666'>Sem dados.</div>";
    return;
  }

  const ctx = canvas.getContext("2d");
  const chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dados.labels,
      datasets: [{
        label: "Séries",
        data: dados.values,
         
        backgroundColor: function(ctx) {
        const v = ctx.raw;  // valor da barra

        if (v < 6)   return "#91a4f8ff";  
        if (v < 10)  return "#5f78e6ff";  
        return "#3145fdff";               
      },

        hoverBackgroundColor: function(ctx) {
        const v = ctx.raw;

        if (v < 6)   return ("#738bf5ff");
        if (v < 10)  return ("#2e4fe4ff");
        return ("#152cfdff");
      },
         
        borderRadius: 6
      }]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins:{
          legend: { display:false },   // REMOVE A LEGENDA
          tooltip:{ enabled:false }
        },
      onHover: (event, elements) => {
        const e = elements && elements[0];
        if (!e) return hideCustomTooltip();

        const i = e.index;
        const label = dados.labels[i];
        showCustomTooltip(label, dados.values[i], dados.details[label], event.x, event.y);
      }
    }
  });

  painelState.charts.push(chart);
}

/* ========= RENDER: POR TREINO ========= */
function renderGraficoPorTreino(wrap) {
  const dados = construirDadosSemanaPorTreino();
  wrap.innerHTML = "";

  if (!dados.length) {
    wrap.innerHTML = "<div style='margin:auto;color:#666'>Sem dados.</div>";
    return;
  }

  const n = dados.length;

  // sempre 2 colunas — igual ao layout dos exercícios
  const cols = 2;
  const rows = Math.ceil(n / cols);

  const grid = document.createElement("div");
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    grid-template-rows: repeat(${rows}, 1fr);
    gap: 10px;
    width: 100%;
    height: 100%;        /* ESSENCIAL: dentro do painel */
    overflow: hidden;    /* impede extravasar */
  `;
  wrap.appendChild(grid);

  dados.forEach(item => {
    const bloco = document.createElement("div");
    bloco.style.cssText = `
      display: flex;
      flex-direction: column;
      padding: 6px;
      background: transparent;
      border-radius: 8px;
      overflow: hidden;   /* segura o canvas dentro */
      min-height: 0;      /* ESSENCIAL para flexbox + charts */
    `;

    const title = document.createElement("div");
    title.textContent = item.nomeTreino;
    title.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
      flex: 0 0 auto;
    `;

    const canvasWrap = document.createElement("div");
    canvasWrap.style.cssText = `
      flex: 1 1 auto;
      min-height: 0;      /* impede estouro */
      display: flex;
    `;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = `
      width: 100%;
      height: 100%;
    `;
    canvasWrap.appendChild(canvas);

    bloco.appendChild(title);
    bloco.appendChild(canvasWrap);
    grid.appendChild(bloco);

    const ctx = canvas.getContext("2d");
    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: item.labels,
        datasets: [{
          label: "Séries",
          data: item.values,
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
          y: { beginAtZero: true } ,
          x: { ticks: {
            font: { size: 9 }}
          }
        },
        plugins:{
          legend: { display:false },   // REMOVE A LEGENDA
          tooltip:{ enabled:false }
        },
        onHover: (event, elements) => {
          const e = elements && elements[0];
          if (!e) return hideCustomTooltip();
          const idx = e.index;
          const label = item.labels[idx];
          showCustomTooltip(label, item.values[idx], item.details[label], event.x, event.y);
        }
      }
    });

    painelState.charts.push(chart);
  });
}


/* ========= Painel principal ========= */
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
      left:calc(50% - 320px);
      top:calc(50% - 280px);
      width:640px;
      height:550px;
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

    /* HEADER */
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

    /* BOTÃO TOGGLE */
    let modo = "agregado";

    const btnToggle = document.createElement("button");
    btnToggle.textContent = "Por treino";
    btnToggle.style.cssText = `
      padding:4px 8px;
      border-radius:8px;
      border:1px solid #ddd;
      background:#f5f7fb;
      cursor:pointer;
      font-size:12px;
      margin-right:10px;
    `;

    btnToggle.onclick = () => {
      destruirChartsAtuais();
      if (modo === "agregado") {
        modo = "porTreino";
        btnToggle.textContent = "Agregado";
        renderGraficoPorTreino(wrap);
      } else {
        modo = "agregado";
        btnToggle.textContent = "Por treino";
        renderGraficoAgregado(wrap);
      }
    };

    /* BOTÃO FECHAR */
    const btnX = document.createElement("button");
    btnX.textContent = "✕";
    btnX.style.cssText = `
      background:none;border:none;
      font-size:16px;cursor:pointer;
    `;
    btnX.onclick = cleanupPainelFlutuante;

    const headerRight = document.createElement("div");
    headerRight.style.cssText = "display:flex;gap:8px;";
    headerRight.appendChild(btnToggle);
    headerRight.appendChild(btnX);

    header.appendChild(titulo);
    header.appendChild(headerRight);

    /* WRAP */
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      flex: 0 0 auto;    /* deixa de esticar automaticamente */
      display: flex;
      width: 100%;
      height: 90%;     /* <<< DEFINA A ALTURA AQUI */
    `;

    /* Tooltip */
    const tt = document.createElement("div");
    tt.style.cssText = `
      position:fixed;
      background:rgba(15,15,15,0.92);
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

    /* Montagem */
    root.appendChild(header);
    root.appendChild(wrap);
    document.body.appendChild(root);

    makeElementDraggable(root, header);

    /* Render inicial (AGREGADO) */
    renderGraficoAgregado(wrap);

  } catch (err) {
    console.error(err);
  }
}

/* ========= Cleanup ========= */
function cleanupPainelFlutuante() {
  destruirChartsAtuais();

  if (painelState.tooltip) {
    try { painelState.tooltip.remove(); } catch (_) {}
    painelState.tooltip = null;
  }
  if (painelState.root) {
    try { painelState.root.remove(); } catch (_) {}
    painelState.root = null;
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
    if (e.target.tagName === "BUTTON" || e.target.closest("button")) return;
    down = true;
    offX = e.clientX - box.offsetLeft;
    offY = e.clientY - box.offsetTop;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
  });

  window.addEventListener("pointermove", e => {
    if (!down) return;
    box.style.left = (e.clientX - offX) + "px";
    box.style.top = (e.clientY - offY) + "px";
  });

  window.addEventListener("pointerup", e => {
    if (!down) return;
    down = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  });
}

/* ========= Inicialização ========= */
(function init() {
  adicionarBotaoGraficoAoTopo();
  const obs = document.querySelector("#painelContainer");
  if (!obs) return;
  const mo = new MutationObserver(() => adicionarBotaoGraficoAoTopo());
  mo.observe(obs, { childList: true, subtree: true });
})();









