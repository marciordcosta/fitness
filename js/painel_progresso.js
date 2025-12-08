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

/* util: tenta obter dados 'base' com proporções (validas1/2/3) do array GLOBAL BASE_EXERCICIOS */
function findBaseExercicioInGlobal(id) {
  try {
    if (!window.BASE_EXERCICIOS || !Array.isArray(window.BASE_EXERCICIOS)) return null;
    return window.BASE_EXERCICIOS.find(x => Number(x.id) === Number(id)) || null;
  } catch {
    return null;
  }
}

/* ========= Construir dados agregados para UMA data ========= */
async function construirDadosPorData(exercicioId, data) {
  const semanaMap = {};
  const detalhe = {};

  // 1) obter exercício base
  let base = null;
  try {
    if (typeof buscarExercicioPorId === 'function') {
      base = await buscarExercicioPorId(exercicioId);
    }
  } catch {}
  if (!base) {
    try { base = window.CACHE?.baseExercicio || null; } catch {}
  }
  if (!base) return { labels: [], values: [], details: {} };

  const gruposRef = [base.grupo1, base.grupo2, base.grupo3].filter(Boolean).map(g => String(g).trim());

  // 2) buscar TODOS os exercícios que tiveram registros neste dia
  let relacionados = [];

  try {
    const { data: registrosDoDia } = await sb
      .from("treino_registros")
      .select("exercicio_id")
      .eq("data", data)
      .eq("user_id", currentUserId);

    const idsUnicos = [...new Set((registrosDoDia || []).map(r => r.exercicio_id))];

    if (idsUnicos.length) {
      const { data: exerciciosDoDia } = await sb
        .from("exercicios")
        .select("id, exercicio, grupo1, grupo2, grupo3")
        .in("id", idsUnicos)
        .eq("user_id", currentUserId);

      relacionados = exerciciosDoDia || [];
    }

  } catch (err) {
    console.error("Erro buscando exercícios do dia:", err);
    relacionados = [];
  }

  // 3) processar
  for (const ex of relacionados || []) {
    const exId = ex.id || ex.exercicio_id;
    if (!exId) continue;
    const nome = ex.exercicio || ex.nome || `#${exId}`;

    // registros
    let registros = [];
    try {
      if (typeof buscarRegistrosPeriodo === "function") {
        registros = await buscarRegistrosPeriodo(exId, "all");
      }
    } catch {}
    if (!registros?.length) {
      try { registros = window.CACHE?.registros?.[String(exId)] || []; } catch {}
    }

    // registros da data
    const regsNaData = registros.filter(r => r && r.data === data);
    if (!regsNaData.length) continue;

    // === CÁLCULO CORRETO DAS SÉRIES ===
    // Se houver r.serie, usamos o MAIOR valor (1…N).
    // Caso contrário, usamos regsNaData.length.
    let totalSeries = 0;

    const seriesNums = regsNaData
      .map(r => r?.serie != null ? Number(r.serie) : null)
      .filter(v => v !== null && !isNaN(v));

    totalSeries = seriesNums.length ? Math.max(...seriesNums) : regsNaData.length;

    // === 1-para-1: cada série conta integralmente para cada grupo do exercício ===

    // descobrir grupos
    const gruposDoEx = [
      ex.grupo1 ? String(ex.grupo1).trim() : null,
      ex.grupo2 ? String(ex.grupo2).trim() : null,
      ex.grupo3 ? String(ex.grupo3).trim() : null,
    ].filter(Boolean);

    // fallback se não houver grupo cadastrado
    if (!gruposDoEx.length) {
      const g = nome;
      semanaMap[g] = (semanaMap[g] || 0) + totalSeries;
      detalhe[g] = detalhe[g] || {};
      detalhe[g][nome] = (detalhe[g][nome] || 0) + totalSeries;
      continue;
    }

    // aplicar 1-para-1 (cada grupo recebe totalSeries INTEIRO)
    for (const g of gruposDoEx) {
      semanaMap[g] = (semanaMap[g] || 0) + totalSeries;
      detalhe[g] = detalhe[g] || {};
      detalhe[g][nome] = (detalhe[g][nome] || 0) + totalSeries;
    }
  }

  /* ==== FUSÃO ROBUSTA ==== */
for (const novoNome in fusoes) {
  const originais = fusoes[novoNome];

  let somaTotal = 0;
  let somaDetalhe = {};

  originais.forEach(grp => {
    somaTotal += semanaMap[grp] || 0;

    if (detalhe[grp]) {
      Object.entries(detalhe[grp]).forEach(([exercicio, series]) => {
        somaDetalhe[exercicio] =
          (somaDetalhe[exercicio] || 0) + series;
      });
    }

    delete semanaMap[grp];
    delete detalhe[grp];
  });

  if (somaTotal > 0) {
    semanaMap[novoNome] = somaTotal;
    detalhe[novoNome] = somaDetalhe;
  }
}

  const lista = Object.keys(semanaMap)
    .map(g => ({ grupo: g, total: semanaMap[g] }))
    .sort((a,b)=>b.total - a.total);

  const labels = lista.map(x=>x.grupo);
  const values = lista.map(x=>x.total);

  const details = {};
  for (const g of labels) {
    const exs = detalhe[g] || {};
    details[g] = Object.keys(exs)
      .map(k => ({ exercicio:k, series:exs[k] }))
      .sort((a,b)=>b.series - a.series);
  }

  return { labels, values, details };
}

/* ========= Tooltip ========= */
function showCustomTooltip_Progresso(ttEl, g, total, lista, x, y) {
  if (!ttEl) return;
  let html = `<b>${g}</b> — ${total} séries<br><br>`;
  for (const i of lista) {
    html += `<div style="display:flex;justify-content:space-between;">
      <span>${i.exercicio}</span>
      <span style="opacity:0.7">${i.series}</span>
    </div>`;
  }
  ttEl.innerHTML = html;
  ttEl.style.display = "block";

  const w = ttEl.offsetWidth, h = ttEl.offsetHeight;
  let left = x + 12;
  let top = y + 12;

  if (left + w > innerWidth) left = x - w - 12;
  if (top + h > innerHeight) top = y - h - 12;

  ttEl.style.left = left+"px";
  ttEl.style.top = top+"px";
}

function hideCustomTooltip_Progresso(ttEl) {
  if (ttEl) ttEl.style.display = "none";
}

/* draggable */
function makeElementDraggable_Progresso(box, handle) {
  let down=false, offX=0, offY=0;

  handle.addEventListener("pointerdown",(e)=>{
    if (e.target.closest("button")) return;
    down = true;
    offX = e.clientX - box.offsetLeft;
    offY = e.clientY - box.offsetTop;
  });

  window.addEventListener("pointermove",(e)=>{
    if (!down) return;
    box.style.left = (e.clientX - offX)+"px";
    box.style.top  = (e.clientY - offY)+"px";
  });
  window.addEventListener("pointerup",()=> down=false);
}

/* cleanup */
function cleanupPainelProgresso() {
  try { painelProgressoState.chart?.destroy(); } catch {}
  painelProgressoState.chart = null;

  painelProgressoState.tooltip?.remove();
  painelProgressoState.tooltip = null;

  painelProgressoState.root?.remove();
  painelProgressoState.root = null;
}

/* abrir painel */
async function abrirPainelProgresso(exercicioId, data) {
  try {
    if (!exercicioId || !data) return;

    if (document.getElementById(FLOAT_PANEL_PROG_ID)) {
      const el = document.getElementById(FLOAT_PANEL_PROG_ID);
      el.style.display = "block";
      el.style.zIndex = FLOAT_PANEL_PROG_Z;
      return;
    }

    await ensureChartJsLoaded_Progresso();

    const root = document.createElement("div");
    root.id = FLOAT_PANEL_PROG_ID;
    root.style.cssText = `
      position:fixed;
      left: calc(50% - 250px);
      top: calc(50% - 200px);
      width:500px;
      height:400px;
      background:#fff;
      box-shadow:0 8px 30px rgba(0,0,0,.18);
      border-radius:12px;
      padding:10px;
      display:flex;
      flex-direction:column;
      gap:10px;
      z-index:${FLOAT_PANEL_PROG_Z};
    `;
    painelProgressoState.root = root;

    const header = document.createElement("div");
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;cursor:grab;padding:0 4px;`;

    const titulo = document.createElement("div");
    titulo.textContent = `Séries por grupo — ${data}`;
    titulo.style.cssText = `font-size:15px;font-weight:700;`;

    /* === ÍCONE ABRIR ORDEM DO TREINO (criado antes de usar) === */
    const btnOrdem = document.createElement("div");
    btnOrdem.innerHTML = "≡";
    btnOrdem.style.cssText = `
      cursor:pointer;
      font-size:17px;
      padding:4px 6px;
      opacity:0.75;
      margin-right:6px;
      user-select:none;
    `;
    btnOrdem.onmouseenter = () => btnOrdem.style.opacity = "1";
    btnOrdem.onmouseleave = () => btnOrdem.style.opacity = "0.7";
    btnOrdem.onclick = async () => {
      await abrirMiniPainelOrdemTreino(data);
    };

    const btnX = document.createElement("button");
    btnX.textContent = "✕";
    btnX.style.cssText = `background:none;border:none;cursor:pointer;font-size:16px;padding:4px;`;
    btnX.addEventListener("pointerdown", ev => ev.stopPropagation());
    btnX.onclick = () => cleanupPainelProgresso();

    // grupo correto (ícone antes do X)
    const rightBox = document.createElement("div");
    rightBox.style.cssText = `display:flex;align-items:center;gap:4px;`;
    rightBox.appendChild(btnOrdem);
    rightBox.appendChild(btnX);

    header.appendChild(titulo);
    header.appendChild(rightBox);

    const wrap = document.createElement("div");
    wrap.style.cssText = `
      flex: 1;
      display: flex;
      height: 370px;        /* DEFINA A ALTURA AQUI */
      width: 100%;          /* opcional */
    `;

    const canvas = document.createElement("canvas");
    canvas.id = "chartProgressoPorData";
    canvas.style.cssText = `
      width: 100%;
      height: 100%;         /* CANVAS SEMPRE PREENCHENDO O WRAP */
      display: block;
    `;

    wrap.appendChild(canvas);

    const tt = document.createElement("div");
    tt.style.cssText = `
      position:fixed;
      background:rgba(15,15,15,.92);
      color:#fff;
      padding:8px;
      border-radius:8px;
      font-size:12px;
      display:none;
      max-width:260px;
      pointer-events:none;
      z-index:${FLOAT_PANEL_PROG_Z+1};
    `;
    document.body.appendChild(tt);
    painelProgressoState.tooltip = tt;

    root.appendChild(header);
    root.appendChild(wrap);
    document.body.appendChild(root);

    makeElementDraggable_Progresso(root, header);

    const dados = await construirDadosPorData(exercicioId, data);
    if (!dados.labels.length) {
      wrap.innerHTML = "<div style='margin:auto;color:#666'>Sem dados para esta data.</div>";
      return;
    }

    const ctx = canvas.getContext("2d");

    painelProgressoState.chart = new Chart(ctx, {
      type:"bar",
      data:{
        labels:dados.labels,
        datasets:[{
          label:"Séries",
          data:dados.values,
          backgroundColor:"rgba(75,192,192,.9)",
          hoverBackgroundColor:"rgba(60,170,170,.95)",
          borderRadius:6
        }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:false,
        scales:{ y:{ beginAtZero:true }},
        plugins:{
          legend: { display:false },   // REMOVE A LEGENDA
          tooltip:{ enabled:false }
        },
        onHover:(event, elements)=>{
          const e = elements?.[0];
          if (!e) return hideCustomTooltip_Progresso(tt);
          const i = e.index;
          showCustomTooltip_Progresso(tt,
            dados.labels[i],
            dados.values[i],
            dados.details[dados.labels[i]],
            event.x,
            event.y
          );
        }
      }
    });

  } catch(err) {
    console.error("abrirPainelProgresso erro:", err);
  }
}

window.abrirPainelProgresso = abrirPainelProgresso;

window.addEventListener("abrirPainelProgresso", ev => {
  const d = ev.detail || {};
  if (d.exercicioId && d.data) abrirPainelProgresso(d.exercicioId, d.data);
});


//Mini painel//
async function abrirMiniPainelOrdemTreino(dataSelecionada) {

  // remover se já existir
  const old = document.getElementById("painel-ordem-treino");
  if (old) old.remove();

  // GARANTIR user
  const uid = (typeof currentUserId !== 'undefined') ? currentUserId : (window.currentUserId || null);

  // 1) tentar obter treino_id a partir de registros do dia (filtrando por usuário)
  let treinoId = null;
  let registrosDoDia = [];
  try {
    const q = sb.from("treino_registros").select("treino_id, exercicio_id").eq("data", dataSelecionada);
    if (uid) q.eq("user_id", uid);
    const resp = await q.limit(1);
    treinoId = resp?.data?.[0]?.treino_id || null;
  } catch (_) { treinoId = null; }

  // 1b) também carregar todos os registros do dia (usaremos no fallback)
  try {
    const q2 = sb.from("treino_registros").select("treino_id, exercicio_id").eq("data", dataSelecionada);
    if (uid) q2.eq("user_id", uid);
    const resp2 = await q2;
    registrosDoDia = resp2?.data || [];
  } catch (_) { registrosDoDia = []; }

  // 2) se tiver treinoId, tentar buscar ordem cadastrada no treino_exercicios
  let lista = [];
  if (treinoId) {
    try {
      const { data } = await sb
        .from("treino_exercicios")
        .select("ordem, validas, exercicios(id, exercicio)")
        .eq("treino_id", treinoId)
        .order("ordem", { ascending: true });


      lista = (data || []).map(r => ({
        ordem: r.ordem,
        nome: r.exercicios?.exercicio || "Exercício",
        series: r.validas 
      }));
      
    } catch (err) {
      console.error("Erro ao buscar treino_exercicios:", err);
      lista = [];
    }
  }

  // 3) Fallback: se não encontrou ordem cadastrada, montar lista a partir dos registros do dia
  if (!lista.length && registrosDoDia.length) {
    try {
      const ids = [...new Set(registrosDoDia.map(r => r.exercicio_id).filter(Boolean))];
      if (ids.length) {
        const { data: exercs } = await sb
          .from("exercicios")
          .select("id, exercicio")
          .in("id", ids)
          .eq("user_id", uid);

        // mapear na ordem em que aparecem os ids nos registros (mantém sentido do dia)
        const idPos = ids;
        lista = idPos.map((id, idx) => {
          const e = (exercs || []).find(x => Number(x.id) === Number(id));
          return {
            ordem: idx, // 0-based; ajustaremos ao exibir
            series: null,
            nome: e?.exercicio || `#${id}`
          };
        });
      }
    } catch (err) {
      console.error("Fallback montar lista por registros:", err);
      lista = [];
    }
  }

  // 4) Se ainda não encontrou nada, avisar (não quebrar)
  if (!lista.length) {
    alert("Não foi possível identificar ordem do treino para esta data.");
    return;
  }

  // criar painel flutuante
  const mini = document.createElement("div");
  mini.id = "painel-ordem-treino";
  mini.style.cssText = `
    position:fixed;
    right:30px;
    top:30px;
    width:260px;
    background:white;
    border-radius:10px;
    box-shadow:0 5px 25px rgba(0,0,0,0.25);
    padding:12px;
    z-index: ${FLOAT_PANEL_PROG_Z + 5};
    display:flex;
    flex-direction:column;
    gap:8px;
  `;

  // header
  const h = document.createElement("div");
  h.style.cssText = `display:flex;justify-content:space-between;align-items:center;font-weight:700;`;

  const tt = document.createElement("div");
  tt.textContent = "Ordem do treino";

  const fechar = document.createElement("div");
  fechar.textContent = "✕";
  fechar.style.cssText = "cursor:pointer;font-size:15px;";
  fechar.addEventListener("pointerdown", e => e.stopPropagation());
  fechar.addEventListener("click", e => {
    e.stopPropagation();
    mini.remove();
  });

  h.appendChild(tt);
  h.appendChild(fechar);
  mini.appendChild(h);

  // corpo
  lista.forEach(item => {
    const l = document.createElement("div");
    l.style.cssText = `
      font-size:14px;
      display:flex;
      align-items:center;
      gap:6px;
    `;

    const ordemLabel = document.createElement("div");
    ordemLabel.style.cssText = `
      width:28px;
      text-align:right;
      opacity:0.85;
    `;
    ordemLabel.textContent = `${(Number(item.ordem) || 0) + 1}º`;

    const nomeLabel = document.createElement("div");
    nomeLabel.style.cssText = `
      flex:1;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    `;
    nomeLabel.textContent = item.nome;

    const seriesLabel = document.createElement("div");
    seriesLabel.style.cssText = `
      opacity:0.7;
      white-space:nowrap;
    `;
    seriesLabel.textContent =
      item.series != null ? `${item.series} séries` : "";

    l.appendChild(ordemLabel);
    l.appendChild(nomeLabel);
    l.appendChild(seriesLabel);

    mini.appendChild(l);
});

  document.body.appendChild(mini);

  // tornar arrastável (mesma regra dos painéis)
  let down = false, offX = 0, offY = 0;

  h.addEventListener("pointerdown", (e) => {
    down = true;
    offX = e.clientX - mini.offsetLeft;
    offY = e.clientY - mini.offsetTop;
    try { h.setPointerCapture(e.pointerId); } catch (_) {}
  });

  window.addEventListener("pointermove", e => {
    if (!down) return;
    mini.style.left = (e.clientX - offX) + "px";
    mini.style.top = (e.clientY - offY) + "px";
  });

  window.addEventListener("pointerup", e => {
    down = false;
    try { h.releasePointerCapture(e.pointerId); } catch (_) {}
  });
}


