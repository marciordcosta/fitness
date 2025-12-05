// --------- Estado/global -------------
const sb = window.sb;
let progressoChart = null;
let chartCtx = null;
const selecionadosParaComparacao = new Set();
let currentUserId = null;
const CACHE = { baseExercicio: null, relacionados: [], registros: {} };

// --------- utilitários -------------
function removerAcento(str){ if(!str) return str; return str.normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function normalizarTexto(str){ if(!str) return null; return removerAcento(String(str).trim().toLowerCase()); }
function formatNum(v){ return v==null || isNaN(v) ? '-' : (Number(v).toFixed(1)); }
function formatSignPct(v){ if (v==null || isNaN(v)) return ''; const r = Number(v).toFixed(1); if (r>0) return `(+${r}%)`; if (r<0) return `(${r}%)`; return `(0%)`; }
function formatDateLabel(d){ if (!d) return '-'; try { const dt = new Date(d); return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return d; } }

function calcular1RM(peso, reps){ if (!peso || !reps) return null; return Number(peso) * (1 + Number(reps)/30); }
function tonagemSerie(peso, reps){ if (!peso || !reps) return 0; return Number(peso) * Number(reps); }

function agruparPorData(registros){
  const byDate = {};
  (registros||[]).forEach(r => {
    const d = r.data;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });
  // garante ordenação por data asc (tempos sem hora)
  return Object.keys(byDate).sort((a,b) => {
    const da = parseLocalDate(a);
    const db = parseLocalDate(b);
    return da - db;
  }).map(k => ({ data: k, regs: byDate[k] }));
}

function somaTonelagemPorData(regs){ let total = 0; (regs||[]).forEach(s => { total += tonagemSerie(s.peso, s.repeticoes); }); return total; }

function lastValuePeso(regs){
  if (!regs || !regs.length) return null;
  let mx = null;
  regs.forEach(r => { if (r.peso != null && r.peso !== '') { const v = Number(r.peso); if (!isNaN(v) && (mx===null || v>mx)) mx = v; } });
  return mx;
}
function lastValueReps(regs){
  if (!regs || !regs.length) return null;
  let mxPeso = null, rep = null;
  regs.forEach(r => {
    if (r.peso != null && r.peso !== '') {
      const vp = Number(r.peso), vr = Number(r.repeticoes);
      if (!isNaN(vp) && !isNaN(vr)) {
        if (mxPeso === null || vp > mxPeso){ mxPeso = vp; rep = vr; }
      }
    }
  });
  return rep;
}

function normalizeSeries(series){
  if (!series || !series.length) return [];
  return series.map(s => {
    const nums = (s.values||[]).map(v => (v==null||isNaN(v)?null:Number(v))).filter(v => v!==null);
    if (!nums.length) return { label: s.label, values: (s.values||[]).map(()=>null) };
    const min = Math.min(...nums), max = Math.max(...nums), range = (max-min)||1;
    return { label: s.label, values: (s.values||[]).map(v => (v==null||isNaN(v)?null:((Number(v)-min)/range)*100)) };
  });
}

// Usado para as bolinhas (5 bolinhas)
function getCorProgresso(pct) {
  if (pct > 0) return "#4CAF50";     // verde
  if (pct < 0) return "#F44336";     // vermelho
  return "#CCCCCC";                  // cinza neutro
}

// Usado para o texto de percentual no histórico
function getCorTextoProgresso(pct) {
    if (pct == null || isNaN(pct)) return "#333333";
    const v = Number(pct);
    if (v > 0) return "#27AE60"; // Verde escuro
    if (v < 0) return "#C0392B"; // Vermelho escuro
    return "#666666";            // Cinza neutro
}

// utilitário: parsear YYYY-MM-DD como data local (meia-noite)
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  // se já vier com hora, tenta usar diretamente
  if (dateStr.includes('T')) return new Date(dateStr);
  return new Date(`${dateStr}T00:00:00`);
}

// ------------------------------------------
// AUTH
// ------------------------------------------
async function initUser(){
  try {
    const { data, error } = await sb.auth.getUser();
    if (error){ currentUserId = null; return; }
    currentUserId = data?.user?.id || null;
  } catch(e){ currentUserId = null; }
}

// --------- Supabase queries (RLS) -------------
async function buscarExercicioPorId(id){
  try {
    let q = sb.from('exercicios').select('id, exercicio, grupo1, grupo2, grupo3').eq('id', id);
    if (currentUserId) q = q.eq('user_id', currentUserId);
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return data;
  } catch(e){ return null; }
}

async function buscarExerciciosRelacionadosViaTreinoExs(gruposNormalizados){
  if (!gruposNormalizados || !gruposNormalizados.length) return [];
  try {
    let q = sb.from('treino_exercicios').select('exercicio_id, exercicios(id, exercicio, grupo1, grupo2, grupo3)').order('ordem',{ascending:true});
    if (currentUserId) q = q.eq('user_id', currentUserId);
    const { data, error } = await q;
    if (error) return [];
    const rows = data || [];
    const map = new Map();
    rows.forEach(r => {
      const ex = r.exercicios; if (!ex) return;
      const g1 = ex.grupo1 ? normalizarTexto(ex.grupo1) : null;
      const g2 = ex.grupo2 ? normalizarTexto(ex.grupo2) : null;
      const g3 = ex.grupo3 ? normalizarTexto(ex.grupo3) : null;
      if (gruposNormalizados.includes(g1) || gruposNormalizados.includes(g2) || gruposNormalizados.includes(g3)){
        if (!map.has(ex.id)) map.set(ex.id, ex);
      }
    });
    return Array.from(map.values());
  } catch(e){ return []; }
}

async function buscarRegistrosPeriodo(exercicioId, periodo) {
  try {
    // 1) busca TODOS os registros primeiro
    let q = sb.from('treino_registros')
              .select('data, peso, repeticoes, serie, treino_id')
              .eq('exercicio_id', exercicioId)
              .order('data', { ascending: true });

    if (currentUserId) q = q.eq('user_id', currentUserId);

    const { data, error } = await q;
    if (error || !data) return [];

    // se for ALL → devolve tudo, sem filtro
    if (periodo === 'all') return data;

    // converte periodo para dias de forma robusta
    let periodoStr = String(periodo);
    let dias = Number(periodoStr);
    if (isNaN(dias)) {
      if (periodoStr.endsWith('m')) {
        dias = Number(periodoStr.replace('m','')) * 30;
      }
    }
    if (isNaN(dias) || dias <= 0) dias = 30;

    // pega a última data REAL dos registros, sem depender do filtro anterior
    const datas = data.map(r => parseLocalDate(r.data).getTime()).filter(t => !isNaN(t));
    if (!datas.length) return [];
    const ultimaData = new Date(Math.max(...datas));
    ultimaData.setHours(0, 0, 0, 0);

    // 3) calcula o início (últimaData - (dias-1))
    const inicio = new Date(ultimaData.getTime() - (Number(dias) - 1) * 24 * 60 * 60 * 1000);

    // 4) filtra SOMENTE AQUI (apenas 1 vez)
    return data.filter(r => {
      const d = parseLocalDate(r.data);
      return d >= inicio && d <= ultimaData;
    });

  } catch(e) {
    console.error(e);
    return [];
  }
}

// --------- UI e lógica -------------
async function montarListaECalcular(baseExercicioId){
  const container = document.getElementById('exerciciosList');
  if (!container) return;
  container.innerHTML = 'Carregando...';
  if (!currentUserId){ container.innerHTML='Erro: usuário não autenticado.'; return; }

  const base = await buscarExercicioPorId(baseExercicioId);
  if (!base){ container.innerHTML='Exercício base não encontrado.'; return; }
  CACHE.baseExercicio = base;

  const grupos = [base.grupo1, base.grupo2, base.grupo3].filter(Boolean).map(g => normalizarTexto(g));
  const relacionados = await buscarExerciciosRelacionadosViaTreinoExs(grupos);
  CACHE.relacionados = relacionados;
  if (!relacionados.length){ container.innerHTML='Nenhum exercício relacionado.'; return; }

  const periodo = document.getElementById('filtroPeriodo')?.value || '30';
  container.innerHTML = '';

  // Cria itens da lista, pré-carrega registros (await em série para evitar concorrência excessiva)
  for (const ex of relacionados) {
    // carrega registros (cache) — usa chave string consistente
    const registros = await (async () => {
      const key = String(ex.id);
      if (CACHE.registros[key]) return CACHE.registros[key];
      const r = await buscarRegistrosPeriodo(ex.id, periodo);
      CACHE.registros[key] = r;
      return r;
    })();

    // agrupa por data e calcula o maior 1RM por dia
    const agrup = agruparPorData(registros);
    const dias = agrup.map(g => {
      const maior = g.regs.reduce((best, r) => {
        const rm = calcular1RM(r.peso, r.repeticoes);
        return (rm > best ? rm : best);
      }, 0);
      return { data: g.data, rm: maior };
    });

    // pegar últimos 6 dias (para 5 comparações)
    const ultimos = dias.slice(-6);
    const comparacoes = [];

    for (let i = 1; i < ultimos.length; i++) {

        // Usa exatamente o mesmo cálculo do histórico, sem || 0
        const prevRM = ultimos[i - 1].rm;
        const atualRM = ultimos[i].rm;

        let pct = null;

        // Se ambos existirem e forem números válidos
        if (
            prevRM != null && !isNaN(prevRM) &&
            atualRM != null && !isNaN(atualRM) &&
            prevRM > 0
        ) {
            pct = ((atualRM - prevRM) / prevRM) * 100;
        }

      comparacoes.push(pct);
    }


    const div = document.createElement('div');
    div.className = 'ex-item';
    // Removido a abertura do painel daqui (agora é via o histórico na direita)
    // div.onclick = () => {abrirPainelProgresso(null, item.data);};
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '8px';
    div.style.padding = '8px';
    div.style.borderBottom = '1px solid #eee';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.id = ex.id;
    cb.className = 'checkbox';
    if (selecionadosParaComparacao.has(String(ex.id))) cb.checked = true;

    // Marca automaticamente o exercício vindo do botão 1RM (se for o caso)
    const exSelecionado = localStorage.getItem("progresso_exercicio_id");
    if (exSelecionado && Number(exSelecionado) === Number(ex.id)) {
        cb.checked = true;
        selecionadosParaComparacao.add(String(ex.id));
    }

    cb.addEventListener('change', async (e) => {
      const id = String(e.target.dataset.id);
      if (e.target.checked) selecionadosParaComparacao.add(id);
      else selecionadosParaComparacao.delete(id);
      await atualizarGraficoComparacao();
      await atualizarDetalhesComparacao();
    });

    const label = document.createElement('div');
    label.textContent = ex.exercicio;
    label.className = 'ex-name';

    
    // --- 5 bolinhas alinhadas à direita ---
    const bolinhas = document.createElement('div');
    bolinhas.style.display = 'flex';
    bolinhas.style.gap = '6px';

    // array de 5 posições, todas iniciam null
    const displayDots = new Array(5).fill(null);

    // alinhar as comparacoes para a direita
    if (comparacoes && comparacoes.length) {
      const start = Math.max(0, 5 - comparacoes.length);
      for (let j = 0; j < Math.min(comparacoes.length, 5); j++) {
        displayDots[start + j] = comparacoes[j];
      }
    }

    // montar as bolinhas com base em displayDots
    for (let i = 0; i < 5; i++){
      const pct = displayDots[i];
      const cor = (pct == null) ? '#DDDDDD' : getCorProgresso(pct);

      const s = document.createElement('span');
      s.style.width = '10px';
      s.style.height = '10px';
      s.style.borderRadius = '50%';
      s.style.display = 'inline-block';
      s.style.background = cor;

      bolinhas.appendChild(s);
    }


    div.appendChild(cb);
    div.appendChild(label);
    div.appendChild(bolinhas);

    container.appendChild(div);
  }
}

// ---------------------------------------------------
// getMetricsByDateFull - retorna 1RM, volume total e média por rep
// ---------------------------------------------------
async function getMetricsByDateFull(registros){
    const agrup = agruparPorData(registros);
    const map = new Map();

    agrup.forEach(a => {

        // === 1RM EXATAMENTE COMO NO HISTÓRICO ===
        const rmDia = a.regs.reduce((m, r) => {
            const x = calcular1RM(r.peso, r.repeticoes);
            return x > m ? x : m;
        }, 0);

        // === VOLUME TOTAL EXATAMENTE COMO NO HISTÓRICO ===
        const volDia = somaTonelagemPorData(a.regs);

        map.set(a.data, {
            '1rm': rmDia,
            'vol_total': volDia
        });
    });

    return map;
}

async function buscarDatasUnion(ids, periodo){
  const sets = [];
  for (const idStr of ids){
    const id = Number(idStr);
    let regs = CACHE.registros[String(id)];
    if (!regs) { regs = await buscarRegistrosPeriodo(id, periodo); CACHE.registros[String(id)] = regs; }
    const agrup = agruparPorData(regs);
    sets.push(agrup.map(a => a.data));
  }
  // ordenação temporal (evita sort lexicográfico)
  const union = Array.from(new Set(sets.flat())).sort((a,b) => parseLocalDate(a) - parseLocalDate(b));
  return union;
}

async function atualizarGraficoComparacao(){
  // remove botão comparar se existir (por segurança caso HTML ainda contenha)
  const btnComp = document.getElementById('btn-comparar'); if (btnComp) btnComp.remove();

  const periodo = document.getElementById('filtroPeriodo')?.value || '30';
  if (!selecionadosParaComparacao.size) {
    if (progressoChart) progressoChart.destroy();
    const detalhes = document.getElementById('detalhes'); if (detalhes) detalhes.innerHTML = '';
    return;
  }

  const ids = Array.from(selecionadosParaComparacao);
  const datasUnion = await buscarDatasUnion(ids, periodo); // labels
  if (!datasUnion.length) {
    if (progressoChart) progressoChart.destroy();
    return;
  }

  // Para cada exercício selecionado, obter séries alinhadas a datasUnion (1RM e Vol)
  const exerciseMap = new Map(CACHE.relacionados.map(ex => [String(ex.id), ex.exercicio]));
  const seriesList = []; // armazenará { nome, values1, valuesVol }

  for (const idStr of ids) {
    const id = Number(idStr);
    let registros = CACHE.registros[String(id)];
    if (!registros) { registros = await buscarRegistrosPeriodo(id, periodo); CACHE.registros[String(id)] = registros; }
    const metrics = await getMetricsByDateFull(registros);
    const aligned1 = datasUnion.map(d => metrics.get(d)?.['1rm'] ?? null);
    const alignedVol = datasUnion.map(d => metrics.get(d)?.['vol_total'] ?? null);
    seriesList.push({ nome: exerciseMap.get(idStr) || `ID ${id}`, values1: aligned1, valuesVol: alignedVol });
  }
 
// --------------------------------------------------------
// GRÁFICO REAL — sem normalização; um eixo Y independente por dataset (invisíveis)
// --------------------------------------------------------

  // montar datasets reais (1RM sólido, Vol tracejado). cada dataset recebe yAxisID = y{index}
  const datasets = [];

  seriesList.forEach((s, idx) => {
      const hue = (idx * 60) % 360;
      const baseColor = `hsl(${hue} 70% 45%)`;

      // 1RM — sólida
      datasets.push({
          label: `${s.nome} — 1RM`,
          data: s.values1.map(v => (v == null ? null : Number(v))),
          borderColor: baseColor,
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          yAxisID: `y${datasets.length}`,
          pointRadius: 3,
          pointHoverRadius: 6,
          hitRadius: 8, 
          spanGaps: true,
          meta: { rawValues: s.values1 }
      });

      // Volume total — tracejada
      datasets.push({
          label: `${s.nome} — Vol`,
          data: s.valuesVol.map(v => (v == null ? null : Number(v))),
          borderColor: baseColor,
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.3,
          fill: false,
          yAxisID: `y${datasets.length}`,
          pointRadius: 0,
          pointHoverRadius: 0,
          spanGaps: true,
          meta: { rawValues: s.valuesVol }
      });
  });

  //Apagar linha vol na comparação//
  const multiple = ids.length > 1;
    if (multiple) {
      datasets.forEach(ds => {
        if (ds.label.includes("Vol")) {
            ds.hidden = true;
        }
    });
  }


  // === Garantir canvas/contexto e ordem correta ===
  const canvas = document.getElementById('chartProgresso');
  if (!canvas) { console.error('canvas #chartProgresso não encontrado'); return; }
  if (!chartCtx) chartCtx = canvas.getContext('2d');

  if (progressoChart) progressoChart.destroy();

  // criar um objeto scales com um eixo Y para cada dataset (todos invisíveis),
  // e manter o eixo X com grid visível para linhas verticais de data.
  const scales = datasets.reduce((acc, ds, i) => {
      acc[`y${i}`] = {
          type: 'linear',
          display: false,        // eixo invisível
          beginAtZero: false,
          ticks: { display: false },
          grid: { drawOnChartArea: false } // evita desenhar grids vindos desses eixos
      };
      return acc;
  }, {});

  // eixo X
  scales.x = {
      title: { display: false },
      grid: { display: true, drawOnChartArea: true, drawTicks: true }
  };

  // animação: manter fade (evita "deslocamento" ao trocar escalas)
  const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
          duration: 400,
          easing: 'easeOutQuad',
          animations: {
              y: { type: 'number', duration: 0 },
              x: { type: 'number', duration: 0 },
              tension: { duration: 300 }
          }
      },
      transitions: {
          active: { animation: { duration: 0 } },
          resize: { animation: { duration: 0 } }
      },
      scales,
      plugins: {
          legend: {
              display: true,
              position: 'bottom',
              labels: { boxWidth: 30, boxHeight: 2, padding: 10 }
          },
          tooltip: {
    usePointStyle: true,
    padding: 6,
    titleColor: "#000000",                      // título preto
    bodyColor: "#000000",                       // texto do corpo preto   
    backgroundColor: 'rgba(125, 125, 125, 0.13)',
    titleFont: { size: 11, weight: 'normal' },
    bodyFont: { size: 11, weight: '600' },
    boxPadding: 3,
    caretSize: 4,
    displayColors: true,

    yAlign: (ctx) => {
        const chart = ctx.chart;
        const tooltip = ctx.tooltip;

        if (!tooltip || !tooltip.dataPoints?.length) return 'bottom';

        const point = tooltip.dataPoints[0].element;

        // Ponto muito no topo → tooltip deve ir para baixo
        if (point.y < 50) return 'bottom';

        // Ponto muito no fundo → tooltip deve ir para cima
        if (point.y > chart.height - 50) return 'top';

        // Caso normal → tooltip abaixo da linha
        return 'bottom';
    },

    xAlign: 'center',

    filter: function(item) {
    const active = item.chart.getActiveElements();
    if (!active || !active.length) return false;

    const activeDataset = active[0].datasetIndex;
    return item.datasetIndex === activeDataset;
    },

    callbacks: {
        title: (items) => {
            // só a data
            return items[0].label;
        },
        label: (context) => {
    const ds = context.dataset;

    // Se for dataset de Volume → NÃO mostrar no tooltip
    if (ds.label.includes("Vol")) return "";

    const idx = context.dataIndex;
    const raw = ds.meta?.rawValues?.[idx] ?? null;

    // Nome base do exercício (antes de "— 1RM")
    const nome = ds.label.split("—")[0].trim();

    if (raw == null || isNaN(raw)) return `${nome}: -`;

    return `${nome}: ${Number(raw).toFixed(1)}kg`;
}

    }
}

      },
      elements: {
          point: { radius: 0, hoverRadius: 0 }
      }
  };

  progressoChart = new Chart(chartCtx, {
      type: 'line',
      data: { labels: datasUnion, datasets },
      options: chartOptions
  });

}

// Detalhes — histórico por data (colunas)
async function atualizarDetalhesComparacao(){
  const painel = document.getElementById('detalhes');
  if (!painel) return;
  painel.innerHTML = '';

  const selecionados = Array.from(selecionadosParaComparacao);
  if (!selecionados.length) {
    painel.innerHTML = "<em>Selecione exercícios.</em>";
    return;
  }

  let html = `<table style="width:100%; border-collapse:collapse;
"><tbody><tr>`;

  for (const id of selecionados) {

    const nome = CACHE.relacionados.find(e => e.id == id)?.exercicio || id;

    const agrupado = agruparPorData(CACHE.registros[String(id)] || [])
                      .sort((a,b) => parseLocalDate(b.data) - parseLocalDate(a.data));

    // Removed the '+' that opened modal; kept name display
    let col = `
      <div style="font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:6px; font-size:16px;">
        ${nome}
      </div>
    `;

    for (let i = 0; i < agrupado.length; i++) {

      const atual = agrupado[i];
      const anterior = agrupado[i + 1];

      const rmAtual = atual.regs.reduce((m,r)=>{
        const x = calcular1RM(r.peso, r.repeticoes);
        return x > m ? x : m;
      }, 0);

      const volAtual = somaTonelagemPorData(atual.regs);

      let pctRM = null, pctVol = null;
      let pctRMSign = '', pctVolSign = '';

      if (anterior) {

        const rmAnt = anterior.regs.reduce((m,r)=>{
          const x = calcular1RM(r.peso, r.repeticoes);
          return x > m ? x : m;
        }, 0);

        const volAnt = somaTonelagemPorData(anterior.regs);

        if (rmAnt > 0) pctRM = ((rmAtual - rmAnt)/rmAnt)*100;
        if (volAnt > 0) pctVol = ((volAtual - volAnt)/volAnt)*100;

        // Aplica formatação de sinal (+X%) e cor
        if (pctRM !== null) pctRMSign = `<span style="color:${getCorTextoProgresso(pctRM)};">${formatSignPct(pctRM)}</span>`;
        if (pctVol !== null) pctVolSign = `<span style="color:${getCorTextoProgresso(pctVol)};">${formatSignPct(pctVol)}</span>`;
      }
      
      // Se não houver anterior ou percentual for null/0, mostra valor sem cor/sinal.
      if (pctRMSign === '') pctRMSign = formatSignPct(pctRM);
      if (pctVolSign === '') pctVolSign = formatSignPct(pctVol);

      // CORREÇÃO: Removido o span de ícone e o clique movido para o container principal (div.historico-registro)
      col += `
        <div class="historico-registro" 
          style="cursor:pointer;"
          onclick="abrirPainelProgresso(${id}, '${atual.data}')"

          onmouseover="hoverDataNoGrafico('${atual.data}')"
          onmouseout="clearHoverGrafico()">

          <span class="data-registro">${atual.data}</span>
          — 1RM: ${formatNum(rmAtual)}kg ${pctRMSign}
          | Vol: ${formatNum(volAtual)}kg ${pctVolSign}
        </div>
      `;

    }

    html += `<td style="vertical-align:top; padding:8px; width:200px;">${col}</td>`;
  }

  html += `</tr></tbody></table>`;
  painel.innerHTML = html;
}

// (fim da função atualizarDetalhesComparacao)

// === Hover programático no gráfico pela data ===
window.hoverDataNoGrafico = function (dataStr) {
    if (!progressoChart) return;

    const labels = progressoChart.data.labels;
    const idx = labels.indexOf(dataStr);
    if (idx === -1) return;

    const active = [];
    const tooltipActive = [];

    progressoChart.data.datasets.forEach((ds, dsIndex) => {
        // ignorar datasets de Volume
        if (ds.label.includes("Vol")) return;
        // ignorar datasets hidden
        if (ds.hidden) return;

        const val = ds.data[idx];
        if (val == null || isNaN(val)) return;

        active.push({ datasetIndex: dsIndex, index: idx });
        tooltipActive.push({ datasetIndex: dsIndex, index: idx });
    });

    if (active.length === 0) return;

    progressoChart.setActiveElements(active);
    const point = progressoChart.getDatasetMeta(tooltipActive[0].datasetIndex).data[idx];
    const pos = point.getProps(['x', 'y'], true);

progressoChart.tooltip.setActiveElements(tooltipActive, {
    x: pos.x,
    y: pos.y
});

    progressoChart.update();
};


// ---------------------------------------------------
// NOTE: Modal/progresso de criação/edição/exclusão removidos conforme solicitado.
// Funções e handlers relacionados foram eliminados do arquivo.
// ---------------------------------------------------

// ---------------------------------------------------
// Inicialização
// ---------------------------------------------------
window.addEventListener('load', async () => {

  const btnComp = document.getElementById('btn-comparar');
  if (btnComp) btnComp.remove();

  await initUser();

  const id = Number(localStorage.getItem('progresso_exercicio_id'));
  const cont = document.getElementById('exerciciosList');

  if (!cont) return;
  if (!id || isNaN(id)) {
    cont.innerHTML = '<em>Nenhum exercício selecionado.</em>';
    return;
  }

  CACHE.registros = {};
  await montarListaECalcular(id);
  await atualizarGraficoComparacao();
  await atualizarDetalhesComparacao();

  const filtro = document.getElementById('filtroPeriodo');
  if (filtro) {
    filtro.addEventListener('change', async () => {
      CACHE.registros = {};
      await montarListaECalcular(id);
      await atualizarGraficoComparacao();
      await atualizarDetalhesComparacao();
    });
  }
});

// ---------------------------------------------------
// Mantive os listeners genéricos que não estavam abrindo o modal.
// Removi explicitamente o listener que disparava a abertura do modal.
// ---------------------------------------------------

window.addEventListener('editarRegistro', async (ev) => {
  // Mantido para compatibilidade; atualmente não faz ação adicional
  console.log('editarRegistro', ev.detail);
});

window.addEventListener('excluirRegistro', async (ev) => {
  // Mantido para compatibilidade; atualmente não faz ação adicional
  console.log('excluirRegistro', ev.detail);
  const { data } = ev.detail || {};
});

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnVoltarProgresso');
  if (!btn) return;
  btn.onclick = () => {
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = 'treino.html';
    }
  };
});
