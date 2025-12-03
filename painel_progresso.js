/* painel_progresso.js
   Painel flutuante — Séries por Grupo Muscular para uma data específica
   Cria função global abrirPainelProgresso(exercicioId, data)
   (data no formato 'YYYY-MM-DD' conforme usado pelo sistema)
*/

/* CONFIG */
const FLOAT_PANEL_PROG_ID = "painel-flutuante-progresso";
const FLOAT_PANEL_PROG_Z = 10000;
const CHART_CDN = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";

/* carregar Chart.js se necessário */
function ensureChartJsLoaded_Progresso() {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve(window.Chart);
    const s = document.createElement("script");
    s.src = CHART_CDN;
    s.onload = () => resolve(window.Chart);
    s.onerror = () => reject("Erro ao carregar Chart.js");
    document.head.appendChild(s);
  });
}

/* estado do painel */
const painelProgressoState = {
  root: null,
  chart: null,
  tooltip: null,
  boundWindowMove: null,
  boundWindowUp: null
};

/* util: tenta obter dados 'base' com proporções (validas1/2/3) do array GLOBAL BASE_EXERCICIOS
   Retorna objeto ou null */
function findBaseExercicioInGlobal(id) {
  try {
    if (!window.BASE_EXERCICIOS || !Array.isArray(window.BASE_EXERCICIOS)) return null;
    const b = window.BASE_EXERCICIOS.find(x => Number(x.id) === Number(id));
    return b || null;
  } catch (e) {
    return null;
  }
}

/* ========= Construir dados agregados para UMA data =========
   - exercicioId: id do exercício base (o que disparou o painel)
   - data: string 'YYYY-MM-DD'
   Retorna: { labels:[], values:[], details: { grupo: [{exercicio, series}] } }
*/
async function construirDadosPorData(exercicioId, data) {
  const semanaMap = {}; // grupo => total series
  const detalhe = {};   // grupo => { exercicioNome: qtd }

  // 1) obter exercício base (nome + grupos)
  let base = null;
  try {
    if (typeof buscarExercicioPorId === 'function') {
      base = await buscarExercicioPorId(exercicioId);
    }
  } catch (e) {
    base = null;
  }
  if (!base) {
    // fallback leve: tentar buscar em CACHE.baseExercicio
    try { base = (window.CACHE && window.CACHE.baseExercicio) || null; } catch(e){ base = null; }
  }
  if (!base) {
    console.warn("painel_progresso: exercício base não encontrado:", exercicioId);
    return { labels: [], values: [], details: {} };
  }

  // obter grupos de referência (normalizados)
  const gruposRef = [base.grupo1, base.grupo2, base.grupo3].filter(Boolean).map(g => String(g).trim());

  // 2) buscar exercícios relacionados que compartilham esses grupos
  let relacionados = [];
  try {
    if (typeof buscarExerciciosRelacionadosViaTreinoExs === 'function') {
      const norm = gruposRef.map(g => (typeof normalizarTexto === 'function' ? normalizarTexto(g) : g));
      relacionados = await buscarExerciciosRelacionadosViaTreinoExs(norm);
    }
  } catch (e) {
    relacionados = [];
  }

  // fallback: se não obteve relacionados, tentar usar CACHE.relacionados
  if (!relacionados || !relacionados.length) {
    try { relacionados = (window.CACHE && window.CACHE.relacionados) || []; } catch(e){ relacionados = []; }
  }

  // 3) para cada exercício relacionado, contar séries na data e distribuir por grupos
  for (const ex of (relacionados || [])) {
    const exId = ex.id || ex.exercicio_id || null;
    const nome = ex.exercicio || ex.nome || `#${exId}`;

    if (!exId) continue;

    // buscar registros (toda a história) e filtrar pela data específica
    let registros = [];
    try {
      if (typeof buscarRegistrosPeriodo === 'function') {
        registros = await buscarRegistrosPeriodo(exId, 'all');
      }
    } catch (e) {
      registros = [];
    }

    // fallback: se CACHE.registros possui
    if ((!registros || !registros.length) && window.CACHE && window.CACHE.registros && window.CACHE.registros[String(exId)]) {
      registros = window.CACHE.registros[String(exId)];
    }

    // filtrar somente registros com data exata
    const regsNaData = (registros || []).filter(r => r && (r.data === data));
    if (!regsNaData.length) continue;

    // total de séries (cada registro representa uma série)
    const totalSeries = regsNaData.length;

    // --- Determinar proporções por grupo para este exercício ---
    // 1) tentar encontrar definição detalhada em BASE_EXERCICIOS (validas1/2/3)
    let baseDetalhado = findBaseExercicioInGlobal(exId) || findBaseExercicioInGlobal(ex.exercicio_id);

    // 2) se baseDetalhado não existir, tentar usar propriedades no próprio 'ex'
    if (!baseDetalhado) {
      // alguns objetos podem ter validas1/2/3 diretamente
      if (ex.validas1 || ex.validas2 || ex.validas3) {
        baseDetalhado = ex;
      }
    }

    // 3) construir array de entradas de grupos para este exercício:
    const gruposDoEx = [
      { g: ex.grupo1 || null, p: baseDetalhado && baseDetalhado.validas1 ? Number(baseDetalhado.validas1) : null },
      { g: ex.grupo2 || null, p: baseDetalhado && baseDetalhado.validas2 ? Number(baseDetalhado.validas2) : null },
      { g: ex.grupo3 || null, p: baseDetalhado && baseDetalhado.validas3 ? Number(baseDetalhado.validas3) : null },
    ].filter(it => it.g && String(it.g).trim());

    // se não houver proporções (p == null), fazer distribuição igualitária entre grupos existentes
    let totalPDefined = 0;
    gruposDoEx.forEach(it => { if (it.p != null && !isNaN(it.p)) totalPDefined += Number(it.p); });

    if (gruposDoEx.length === 0) {
      // se o exercício não tem grupos (raro), contar tudo sob o nome do exercício mesmo
      const grupoFallback = nome;
      semanaMap[grupoFallback] = (semanaMap[grupoFallback] || 0) + totalSeries;
      detalhe[grupoFallback] = detalhe[grupoFallback] || {};
      detalhe[grupoFallback][nome] = (detalhe[grupoFallback][nome] || 0) + totalSeries;
      continue;
    }

    if (totalPDefined <= 0) {
      // distribuir igualmente
      const share = 1 / gruposDoEx.length;
      gruposDoEx.forEach(it => {
        const qtd = Math.round(totalSeries * share);
        const grupoNome = String(it.g).trim();
        semanaMap[grupoNome] = (semanaMap[grupoNome] || 0) + qtd;
        detalhe[grupoNome] = detalhe[grupoNome] || {};
        detalhe[grupoNome][nome] = (detalhe[grupoNome][nome] || 0) + qtd;
      });
    } else {
      // usar proporções definidas (normaliza caso soma != 1)
      gruposDoEx.forEach(it => {
        const prop = (it.p != null && !isNaN(it.p)) ? Number(it.p) : 0;
        const normalizedProp = prop / totalPDefined;
        const qtd = Math.round(totalSeries * normalizedProp);
        const grupoNome = String(it.g).trim();
        semanaMap[grupoNome] = (semanaMap[grupoNome] || 0) + qtd;
        detalhe[grupoNome] = detalhe[grupoNome] || {};
        detalhe[grupoNome][nome] = (detalhe[grupoNome][nome] || 0) + qtd;
      });
    }
  } // end for relacionado

  // montar listas ordenadas decrescente
  const lista = Object.keys(semanaMap).map(g => ({ grupo: g, total: semanaMap[g] }))
    .sort((a, b) => b.total - a.total);

  const labels = lista.map(i => i.grupo);
  const values = lista.map(i => i.total);

  const details = {};
  labels.forEach(g => {
    const exs = detalhe[g] || {};
    const itens = Object.keys(exs).map(k => ({ exercicio: k, series: exs[k] }))
      .sort((a, b) => b.series - a.series);
    details[g] = itens;
  });

  return { labels, values, details };
}

/* ========= Tooltip custom (reaproveita estilo do painel_grafico) ========= */
function showCustomTooltip_Progresso(ttEl, g, total, lista, x, y) {
  if (!ttEl) return;
  let html = `<b>${g}</b> — ${total} séries<br><br>`;
  lista.forEach(i => {
    html += `
      <div style="display:flex;justify-content:space-between;">
        <span>${i.exercicio}</span>
        <span style="opacity:0.7">${i.series}</span>
      </div>`;
  });
  ttEl.innerHTML = html;
  ttEl.style.display = "block";

  const w = ttEl.offsetWidth || 200;
  const h = ttEl.offsetHeight || 100;

  let left = x + 12;
  let top = y + 12;
  if (left + w > window.innerWidth) left = x - w - 12;
  if (top + h > window.innerHeight) top = y - h - 12;

  ttEl.style.left = left + "px";
  ttEl.style.top = top + "px";
}

/* hide tooltip */
function hideCustomTooltip_Progresso(ttEl) {
  if (ttEl) ttEl.style.display = "none";
}

/* draggable utility (mesma lógica do painel_grafico) */
function makeElementDraggable_Progresso(box, handle) {
  let down = false, offX = 0, offY = 0;

  handle.addEventListener("pointerdown", (e) => {
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

  painelProgressoState.boundWindowMove = onMove;
  painelProgressoState.boundWindowUp = onUp;
}

/* cleanup */
function cleanupPainelProgresso() {
  try {
    if (painelProgressoState.chart) { try { painelProgressoState.chart.destroy(); } catch(_){} painelProgressoState.chart = null; }
    if (painelProgressoState.tooltip) { try { painelProgressoState.tooltip.remove(); } catch(_){} painelProgressoState.tooltip = null; }
    if (painelProgressoState.root) { try { painelProgressoState.root.remove(); } catch(_){} painelProgressoState.root = null; }
  } catch (e) {
    console.error("Erro cleanup painel_progresso:", e);
  }
}

/* ========= Abrir painel principal =========
   Uso: abrirPainelProgresso(exercicioId, data)
*/
async function abrirPainelProgresso(exercicioId, data) {
  try {
    if (!exercicioId || !data) {
      console.warn("abrirPainelProgresso: faltam parametros (exercicioId, data).");
      return;
    }

    // se já existe apenas mostra
    if (document.getElementById(FLOAT_PANEL_PROG_ID)) {
      const el = document.getElementById(FLOAT_PANEL_PROG_ID);
      el.style.display = "block";
      el.style.zIndex = FLOAT_PANEL_PROG_Z;
      return;
    }

    await ensureChartJsLoaded_Progresso();

    // criar container
    const root = document.createElement("div");
    root.id = FLOAT_PANEL_PROG_ID;
    root.style.cssText = `
      position:fixed;
      left: calc(50% - 320px);
      top: calc(50% - 210px);
      width:500px;
      height:400px;
      background:#fff;
      box-shadow:0 8px 30px rgba(0,0,0,0.18);
      border-radius:12px;
      padding:10px;
      display:flex;
      flex-direction:column;
      gap:10px;
      z-index:${FLOAT_PANEL_PROG_Z};
    `;
    painelProgressoState.root = root;

    // header
    const header = document.createElement("div");
    header.style.cssText = `display:flex; justify-content:space-between; align-items:center; cursor:grab; padding:0 4px;`;

    const titulo = document.createElement("div");
    titulo.textContent = `Séries por grupo — ${data}`;
    titulo.style.cssText = `font-size:15px; font-weight:700;`;

    const btnX = document.createElement("button");
    btnX.textContent = "✕";
    btnX.setAttribute("aria-label", "Fechar");
    btnX.style.cssText = `background:none; border:none; cursor:pointer; font-size:16px; padding:4px;`;
    btnX.addEventListener("pointerdown", ev => ev.stopPropagation());
    btnX.addEventListener("click", () => cleanupPainelProgresso());

    header.appendChild(titulo);
    header.appendChild(btnX);

    // canvas wrapper
    const wrap = document.createElement("div");
    wrap.style.cssText = "flex:1; display:flex;";
    const canvas = document.createElement("canvas");
    canvas.id = "chartProgressoPorData";
    wrap.appendChild(canvas);

    // tooltip
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
      z-index:${FLOAT_PANEL_PROG_Z + 1};
    `;
    document.body.appendChild(tt);
    painelProgressoState.tooltip = tt;

    // montar
    root.appendChild(header);
    root.appendChild(wrap);
    document.body.appendChild(root);

    // tornar arrastável
    makeElementDraggable_Progresso(root, header);

    // construir dados
    const dados = await construirDadosPorData(exercicioId, data);
    if (!dados.labels || !dados.labels.length) {
      wrap.innerHTML = "<div style='margin:auto;color:#666'>Sem dados para esta data.</div>";
      return;
    }

    // criar gráfico
    const ctx = canvas.getContext("2d");
    if (painelProgressoState.chart) { try { painelProgressoState.chart.destroy(); } catch(_){} painelProgressoState.chart = null; }

    painelProgressoState.chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: dados.labels,
        datasets: [{
          label: "Séries",
          data: dados.values,
          backgroundColor: "rgba(75,192,192,0.9)",
          hoverBackgroundColor: "rgba(60,170,170,0.95)",
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { y: { beginAtZero: true } },
        plugins: { tooltip: { enabled: false } },
        onHover: (event, elements) => {
          const e = elements && elements[0];
          if (!e) { hideCustomTooltip_Progresso(tt); return; }
          const i = e.index;
          const label = dados.labels[i];
          const total = dados.values[i];
          const det = dados.details[label] || [];
          // Chart.js v4 fornece event.x/event.y na callback
          showCustomTooltip_Progresso(tt, label, total, det, event.x, event.y);
        }
      }
    });

  } catch (err) {
    console.error("abrirPainelProgresso erro:", err);
  }
}

/* Expõe função global e evento para integração com treino_progresso ou outros */
window.abrirPainelProgresso = abrirPainelProgresso;

window.addEventListener("abrirPainelProgresso", (ev) => {
  try {
    const detail = ev.detail || {};
    if (!detail.exercicioId || !detail.data) return;
    abrirPainelProgresso(detail.exercicioId, detail.data);
  } catch (e) { /* ignore */ }
});

/* FIM do arquivo painel_progresso.js */
