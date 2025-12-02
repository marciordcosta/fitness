// Painel de distribuição por grupo muscular
// Depende de: TREINOS, TREINO_EXS, BASE_EXERCICIOS (definidos em treino.js)

let painelInitialized = false;
let painelRoot = null;
let painelThead = null;
let painelTbody = null;
let painelEmptyMsg = null;

let grupoOrder = [];          // ordem customizada das linhas (grupos)
let intervalSlots = [];       // slots de intervalos entre colunas de treino
let intervaloSeq = 0;         // gerador de IDs de intervalos
let ultimoTreinosCount = 0;   // pra manter consistência dos slots

const PAINEL_GRUPO_ORDER_KEY = "painel_grupo_order_v1";
const PAINEL_INTERVAL_KEY = "painel_interval_slots_v1";
let intervalSlotsLoaded = false;

// listener único para inputs de séries
let painelInputListenerAttached = false;

// -----------------------------------------------------------------------------
// API chamada pelo treino.js
// -----------------------------------------------------------------------------
function atualizarPainel() {
  try {
    const colDireita = document.querySelector(".col-direita");
    if (!colDireita) return;

    if (!painelInitialized) {
      initPainel(colDireita);
    }

    // Anexa UMA vez o listener para atualizar o painel
    if (!painelInputListenerAttached) {
      painelInputListenerAttached = true;

      // Recalcular somente quando o usuário CONFIRMAR a edição (via mudança de foco/blur)
      document.addEventListener("change", (e) => {
        const alvo = e.target;
        if (!alvo || !alvo.classList) return;

        if (alvo.classList.contains("input-mini")) {
          atualizarPainel();
        }
      });

      // Também recalcular quando o usuário apertar ENTER
      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const alvo = e.target;
          if (alvo && alvo.classList && alvo.classList.contains("input-mini")) {
            // alvo.blur();       // Mantido como REMOVIDO para que o teclado não feche no celular
            atualizarPainel(); // atualiza depois de confirmado
          }
        }
      });

    }

    if (!Array.isArray(TREINOS) || !Array.isArray(TREINO_EXS) || !Array.isArray(BASE_EXERCICIOS)) {
      mostrarMensagemVazia("Carregando dados do treino...");
      return;
    }

    const treinosOrdenados = [...TREINOS].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

    if (!treinosOrdenados.length) {
      limparTabela();
      mostrarMensagemVazia("Nenhum treino cadastrado.");
      return;
    }

    // tenta carregar intervalos apenas 1 vez
    if (!intervalSlotsLoaded) {
      carregarIntervalSlots(treinosOrdenados);
      intervalSlotsLoaded = true;
    }

    // sincroniza slots com base na quantidade de treinos
    syncIntervalSlots(treinosOrdenados.length);
    ultimoTreinosCount = treinosOrdenados.length;

    // grupos musculares existentes
    const gruposAtual = calcularGruposMusculares();
    if (!gruposAtual.length) {
      limparTabela();
      mostrarMensagemVazia("Cadastre grupos musculares nos exercícios para ver o painel.");
      return;
    }

    syncGrupoOrder(gruposAtual);

    const modelo = calcularDistribuicao(treinosOrdenados, gruposAtual);
    renderPainel(modelo);

    // ativa botão P **DEPOIS** do renderPainel
    setTimeout(() => {
      document.querySelectorAll(".btn-prog-painel").forEach(btn => {
        btn.onclick = () => {
          const grupo = btn.dataset.grupo;
          abrirProgressoGrupo(grupo);
        };
      });
    }, 0);

    // salva intervalos após renderizar
    salvarIntervalSlots(treinosOrdenados);


  } catch (e) {
    console.error("Erro ao atualizar painel:", e);
  }
}

// -----------------------------------------------------------------------------
// Inicialização do painel (layout fixo)
// -----------------------------------------------------------------------------
function initPainel(colDireita) {
  const PAINEL_DATA_KEY = "painel_data_protocolo_v1";

  painelRoot = colDireita;

  // FIX: Adicionado user-select: none para impedir a seleção de texto e melhorar o drag/drop
  painelRoot.innerHTML = `
    <div id="painelTreino" class="painel-wrapper"
      style="
        user-select: none;
        -webkit-user-select: none; 
        -moz-user-select: none;
        -ms-user-select: none;
      "
    >

      <div class="painel-topo">
        <div class="painel-titulo">Distribuição por grupo muscular</div>
        <button id="btnAddIntervaloPainel" type="button" class="painel-btn-intervalo">Intervalo</button>
      </div>

      <div id="painelEmptyMsg" class="painel-empty" style="display:none;"></div>

      <div class="painel-tabela-wrapper">
        <table class="painel-tabela">
          <thead id="painelThead"></thead>
          <tbody id="painelTbody"></tbody>
        </table>
      </div>

      <div id="painel-data-wrapper"
        style="
          width:fit-content;
          margin-left:auto;
          margin-top:30px;
          display:flex;
          align-items:baseline;
          gap:10px;
          font-size:12px;
          color:#555;
        "
      >
        <label style="font-size:12px; color:#666;">Data:</label>

        <input 
          type="date" 
          id="painelDataInput"
          style="
            height:20px;          
            padding:0 6px;
            font-size:12px;
            color:#444;
            border:1px solid #ccc;
            border-radius:6px;
            background:#fff;
            margin-bottom: 0px;
          "
        >

        <span id="painelDiasAtivo"
          style="font-size:12px; font-weight:600; color:#444; margin-left:4px; white-space:nowrap;">
        </span>
      </div>

    </div>
  `;

  painelThead = painelRoot.querySelector("#painelThead");
  painelTbody = painelRoot.querySelector("#painelTbody");
  painelEmptyMsg = painelRoot.querySelector("#painelEmptyMsg");

  const btnAddIntervalo = painelRoot.querySelector("#btnAddIntervaloPainel");
  if (btnAddIntervalo) {
    btnAddIntervalo.addEventListener("click", () => adicionarIntervalo());
  }

  // --- Persistência da data ---
  function atualizarDiasAtivo() {
    const inp = painelRoot.querySelector("#painelDataInput");
    const out = painelRoot.querySelector("#painelDiasAtivo");

    if (!inp || !out) return;

    if (!inp.value) {
      out.textContent = "";
      return;
    }

    const hoje = new Date();
    // Garante que a data seja interpretada no fuso horário local como 00:00:00
    // Isso é importante para o cálculo de diferença em dias.
    const data = new Date(inp.value + "T00:00:00"); 
    const diff = Math.floor((hoje - data) / (1000 * 60 * 60 * 24));

    out.textContent = diff + " dias ativo";
  }

  const inputData = painelRoot.querySelector("#painelDataInput");
  const dataSalva = localStorage.getItem(PAINEL_DATA_KEY);

  if (inputData && dataSalva) {
    inputData.value = dataSalva;
  }

  atualizarDiasAtivo();

  if (inputData) {
    inputData.addEventListener("change", (e) => {
      localStorage.setItem(PAINEL_DATA_KEY, e.target.value || "");
      atualizarDiasAtivo();
    });

    inputData.addEventListener("input", atualizarDiasAtivo);
  }

  painelInitialized = true;
  
  // BLOQUEIO DE CÓPIA/COLA NO PAINEL (garante que, mesmo que algo seja selecionado, a cópia seja impedida)
  // Usa a fase de captura (true) para interceptar o evento antes que os elementos internos o vejam.
  const blockTextManipulation = (e) => {
    // Exceção: Não bloqueia a manipulação de texto em campos de input,
    // permitindo que o usuário interaja com a data, por exemplo.
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }
    e.preventDefault();
    e.stopPropagation(); 
    return false;
  };

  // Anexa o handler aos eventos copy, paste e cut no elemento raiz do painel
  painelRoot.addEventListener("copy", blockTextManipulation, true); 
  painelRoot.addEventListener("paste", blockTextManipulation, true);
  painelRoot.addEventListener("cut", blockTextManipulation, true);
}

// -----------------------------------------------------------------------------
// Helpers de estado
// -----------------------------------------------------------------------------
function mostrarMensagemVazia(msg) {
  if (!painelEmptyMsg) return;
  painelEmptyMsg.textContent = msg || "";
  painelEmptyMsg.style.display = msg ? "block" : "none";
}

function limparTabela() {
  if (painelThead) painelThead.innerHTML = "";
  if (painelTbody) painelTbody.innerHTML = "";
}

// garante que intervalSlots tenha tamanho treinosCount + 1
function syncIntervalSlots(treinosCount) {
  if (!Array.isArray(intervalSlots) || !intervalSlots.length) {
    intervalSlots = Array.from({ length: treinosCount + 1 }, () => []);
    return;
  }

  if (intervalSlots.length < treinosCount + 1) {
    while (intervalSlots.length < treinosCount + 1) {
      intervalSlots.push([]);
    }
  } else if (intervalSlots.length > treinosCount + 1) {
    const extras = intervalSlots.splice(treinosCount + 1);
    extras.forEach(slot => {
      // Move os IDs de intervalos excedentes para o último slot
      intervalSlots[treinosCount].push(...slot);
    });
  }
}

// mantém e carrega ordem dos grupos do localStorage
function syncGrupoOrder(gruposAtual) {
  const salvo = localStorage.getItem(PAINEL_GRUPO_ORDER_KEY);

  if (salvo) {
    try {
      const ordemSalva = JSON.parse(salvo);
      if (Array.isArray(ordemSalva)) {
        // mantém apenas grupos existentes
        grupoOrder = ordemSalva.filter(g => gruposAtual.includes(g));

        // adiciona novos grupos, se surgirem
        gruposAtual.forEach(g => {
          if (!grupoOrder.includes(g)) grupoOrder.push(g);
        });

        return;
      }
    } catch (_) {
      // se der erro, cai no fallback abaixo
    }
  }

  // se não tem nada salvo ou deu erro, usa ordem padrão (ordenada) atual
  grupoOrder = [...gruposAtual];
}

// -----------------------------------------------------------------------------
// SALVAR / CARREGAR INTERVALOS
// -----------------------------------------------------------------------------
function salvarIntervalSlots(treinos) {
  try {
    const idsTreinos = treinos.map(t => t.id);
    const payload = {
      idsTreinos,
      intervalSlots
    };
    localStorage.setItem(PAINEL_INTERVAL_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("Erro ao salvar intervalSlots:", e);
  }
}

function carregarIntervalSlots(treinos) {
  try {
    const raw = localStorage.getItem(PAINEL_INTERVAL_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.idsTreinos) || !Array.isArray(data.intervalSlots)) return;

    const idsAtuais = treinos.map(t => t.id);
    if (idsAtuais.length !== data.idsTreinos.length) return;

    for (let i = 0; i < idsAtuais.length; i++) {
      if (idsAtuais[i] !== data.idsTreinos[i]) return;
    }

    intervalSlots = data.intervalSlots;

  } catch (e) {
    console.error("Erro ao carregar intervalSlots:", e);
  }
}

// -----------------------------------------------------------------------------
// Cálculo dos grupos musculares
// -----------------------------------------------------------------------------
function calcularGruposMusculares() {
  const set = new Set();
  (BASE_EXERCICIOS || []).forEach(ex => {
    if (ex.grupo1) set.add(ex.grupo1.trim());
    if (ex.grupo2) set.add(ex.grupo2.trim());
    if (ex.grupo3) set.add(ex.grupo3.trim());
  });
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
}

// -----------------------------------------------------------------------------
// Cálculo da distribuição (diária e semanal)
// -----------------------------------------------------------------------------
function calcularDistribuicao(treinosOrdenados, gruposAtual) {
  const treinosCount = treinosOrdenados.length;

  const indicePorTreinoId = {};
  treinosOrdenados.forEach((t, idx) => {
    indicePorTreinoId[t.id] = idx;
  });

  const diarios = Array.from({ length: treinosCount }, () => ({}));
  const semana = {};

  (TREINO_EXS || []).forEach(exTreino => {
    if (!exTreino.treino_id || !exTreino.exercicio_id) return;

    const idxTreino = indicePorTreinoId[exTreino.treino_id];
    if (idxTreino === undefined) return;

    const base = BASE_EXERCICIOS.find(b => b.id === exTreino.exercicio_id);
    if (!base) return;

    const gruposEx = [
      { grupo: base.grupo1, peso: base.validas1 },
      { grupo: base.grupo2, peso: base.validas2 },
      { grupo: base.grupo3, peso: base.validas3 }
    ];

    // usa o número de séries válidas do exercício
    const seriesExercicio = Number(exTreino.validas) || 0;
    if (!seriesExercicio) {
      // sem séries válidas -> não entra nem no diário nem no semanal
      return;
    }

    // diário: 1 série por exercício x grupo (somente se há séries válidas)
    // diário: soma as séries válidas (exTreino.validas) para cada grupo
    gruposEx.forEach(item => {
      if (!item.grupo) return;
      const g = item.grupo.trim();
      diarios[idxTreino][g] = (diarios[idxTreino][g] || 0) + seriesExercicio;
    });

    // semanal: válidas * peso do grupo
    gruposEx.forEach(item => {
      if (!item.grupo || !item.peso) return;
      const g = item.grupo.trim();
      const bruto = seriesExercicio * Number(item.peso);
      const arred = Math.round(bruto);
      semana[g] = (semana[g] || 0) + arred;
    });
  });

  const colunas = [];

  for (let i = 0; i < treinosCount; i++) {
    (intervalSlots[i] || []).forEach(idInt => {
      colunas.push({ tipo: "intervalo", id: idInt });
    });

    colunas.push({
      tipo: "treino",
      treino: treinosOrdenados[i],
      indiceTreino: i
    });
  }

  (intervalSlots[treinosCount] || []).forEach(idInt => {
    colunas.push({ tipo: "intervalo", id: idInt });
  });

  return {
    treinos: treinosOrdenados,
    colunas,
    grupos: grupoOrder.filter(g => gruposAtual.includes(g)),
    diarios,
    semana
  };
}


// -----------------------------------------------------------------------------
// Renderização do painel
// -----------------------------------------------------------------------------
function renderPainel(modelo) {
  if (!painelThead || !painelTbody) return;

  mostrarMensagemVazia("");

  const { treinos, colunas, grupos, diarios, semana } = modelo;
  const treinosCount = treinos.length;

  const trHead = document.createElement("tr");

  // 1ª coluna: Grupo
  const thGrupo = document.createElement("th");
  thGrupo.textContent = "Grupo";
  thGrupo.className = "painel-th-grupo";
  trHead.appendChild(thGrupo);

  // 2ª coluna: Semana (total semanal) – logo após Grupo
  const thSemana = document.createElement("th");
  thSemana.textContent = "Semana";
  thSemana.className = "painel-th-semana";
  trHead.appendChild(thSemana);

  // Demais colunas dinâmicas (intervalos + treinos)
  colunas.forEach(col => {
    const th = document.createElement("th");

    if (col.tipo === "treino") {
      const idx = col.indiceTreino;
      const letra = String.fromCharCode("A".charCodeAt(0) + idx);

      th.innerHTML = `<div class="painel-caixa-header">${letra}</div>`;
      th.title = treinos[idx].nome_treino || "";
      th.dataset.kind = "treino";
      th.dataset.treinoIndex = String(idx);
      th.className = "painel-th-treino";
      th.draggable = false;

    } else {
      th.dataset.kind = "intervalo";
      th.dataset.intervalId = col.id;
      th.className = "painel-th-intervalo";
      th.draggable = true;

      th.innerHTML = `
        <div class="painel-caixa-header">—</div>
        <button type="button" class="painel-btn-del-intervalo">X</button>
      `;

      th.querySelector(".painel-btn-del-intervalo")
        .addEventListener("click", e => {
          e.stopPropagation();
          removerIntervalo(col.id);
        });
    }

    trHead.appendChild(th);
  });

  painelThead.innerHTML = "";
  painelThead.appendChild(trHead);

  // Corpo
  painelTbody.innerHTML = "";

  grupos.forEach(grupo => {
    const tr = document.createElement("tr");
    tr.className = "painel-grupo-row";
    tr.dataset.grupo = grupo;
    tr.draggable = true;

    // 1ª célula: Grupo
    const tdGrupo = document.createElement("td");
    tdGrupo.className = "painel-td-grupo";

    tdGrupo.innerHTML = `
      <span class="painel-grupo-handle">⠿</span>
      <span style="flex:1">${grupo}</span>
      <button class="btn-prog-painel" data-grupo="${grupo}" 
        style="
          cursor:pointer;
          padding:4px;
          margin-left:8px;
          height:24px;
          width:26px;
          border-radius:6px;
          background:#fff;
          border:1px solid #ffffffff;
          font-size:13px;
          font-weight:bold;
          color:#bad8f2;
        ">
        P
      </button>
    `;

    tr.appendChild(tdGrupo);


    // 2ª célula: Semana (total semanal) – texto puro, sem caixinha
    const tdSemana = document.createElement("td");
    tdSemana.className = "painel-td-num painel-td-semana";
    tdSemana.textContent = semana[grupo] ? semana[grupo] : "";
    tr.appendChild(tdSemana);

    // Demais células dinâmicas (treinos + intervalos)
    colunas.forEach(col => {
      const td = document.createElement("td");
      td.className = "painel-td-num";

      if (col.tipo === "treino") {
        const idxTreino = col.indiceTreino;
        const valor = diarios[idxTreino][grupo] || 0;

        if (valor) {
          const box = document.createElement("div");
          box.className = "painel-caixa";
          box.textContent = valor;

          // FORMATAÇÃO POR FAIXA
          if (valor > 10) {
            box.style.background = "#d32f2f"; // vermelho
            box.style.color = "#ffffff";
          } else if (valor >= 5) {
            box.style.background = "#2e7d32"; // verde
            box.style.color = "#ffffff";
          }

          td.appendChild(box);
        } else {
          td.textContent = "";
        }
      } else {
        td.textContent = "";
      }

      tr.appendChild(td);
    });

    painelTbody.appendChild(tr);
  });

  attachDragGrupos();
  attachDragIntervalos(treinosCount);
}

function abrirProgressoGrupo(grupoNome) {
  const lista = BASE_EXERCICIOS.filter(ex =>
    ex.grupo1 === grupoNome ||
    ex.grupo2 === grupoNome ||
    ex.grupo3 === grupoNome
  );

  if (!lista.length) {
    alert("Nenhum exercício encontrado para este grupo.");
    return;
  }

  // O ID do exercício base para o progresso é o do primeiro exercício encontrado
  const idBase = lista[0].id; 

  localStorage.setItem("progresso_exercicio_id", idBase);
  window.location.href = "treino_progresso.html";
}

// -----------------------------------------------------------------------------
// Drag & drop grupos
// -----------------------------------------------------------------------------
function attachDragGrupos() {
  if (!painelTbody) return;

  const linhas = Array.from(
    painelTbody.querySelectorAll(".painel-grupo-row")
  );

  let arr = null;

  linhas.forEach(row => {
    row.addEventListener("dragstart", e => {
      arr = row;
      row.classList.add("arrastando");
      try { e.dataTransfer.setData("text/plain", ""); } catch (_) {}
    });

    row.addEventListener("dragend", () => {
      if (!arr) return;

      arr.classList.remove("arrastando");

      grupoOrder = Array.from(
        painelTbody.querySelectorAll(".painel-grupo-row")
      ).map(r => r.dataset.grupo);

      // salva ordem dos grupos
      localStorage.setItem(PAINEL_GRUPO_ORDER_KEY, JSON.stringify(grupoOrder));

      arr = null;
      atualizarPainel();
    });
  });

  painelTbody.addEventListener("dragover", e => {
    e.preventDefault();
    if (!arr) return;

    const itens = Array.from(
      painelTbody.querySelectorAll(".painel-grupo-row")
    );

    const alvo = itens.find(el => {
      const box = el.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });

    if (alvo && alvo !== arr) painelTbody.insertBefore(arr, alvo);
    else if (!alvo) painelTbody.appendChild(arr);
  });
}

// -----------------------------------------------------------------------------
// Drag & drop intervalos
// -----------------------------------------------------------------------------
function attachDragIntervalos(treinosCount) {
  if (!painelThead) return;

  const linha = painelThead.querySelector("tr");
  if (!linha) return;

  let arr = null;

  const headers = Array.from(
    linha.querySelectorAll('th[data-kind="intervalo"]')
  );

  headers.forEach(th => {
    th.addEventListener("dragstart", e => {
      arr = th;
      th.classList.add("arrastando");
      try { e.dataTransfer.setData("text/plain", ""); } catch (_) {}
    });

    th.addEventListener("dragend", () => {
      if (!arr) return;

      arr.classList.remove("arrastando");

      const todos = Array.from(
        linha.querySelectorAll("th")
      ).filter(el =>
        el.dataset.kind === "treino" || el.dataset.kind === "intervalo"
      );

      const novoSlots = Array.from({ length: treinosCount + 1 }, () => []);
      let slot = 0;

      todos.forEach(el => {
        if (el.dataset.kind === "intervalo") {
          novoSlots[slot].push(el.dataset.intervalId);
        } else {
          const idx = Number(el.dataset.treinoIndex);
          slot = idx + 1;
        }
      });

      intervalSlots = novoSlots;
      arr = null;
      atualizarPainel();
    });
  });

  linha.addEventListener("dragover", e => {
    e.preventDefault();
    if (!arr) return;

    const candidates = Array.from(
      linha.querySelectorAll("th")
    ).filter(el =>
      el.dataset.kind === "treino" || el.dataset.kind === "intervalo"
    );

    const alvo = candidates.find(el => {
      const box = el.getBoundingClientRect();
      return e.clientX < box.left + box.width / 2;
    });

    if (alvo && alvo !== arr) linha.insertBefore(arr, alvo);
    else if (!alvo) linha.appendChild(arr);
  });
}

// -----------------------------------------------------------------------------
// Intervalos: adicionar / remover
// -----------------------------------------------------------------------------
function adicionarIntervalo() {
  const treinosCount = ultimoTreinosCount;
  if (!treinosCount) return;

  syncIntervalSlots(treinosCount);

  const idxUltimo = intervalSlots.length - 1;
  const novoId = "int_" + (++intervaloSeq);

  intervalSlots[idxUltimo].push(novoId);

  atualizarPainel();
}

function removerIntervalo(idIntervalo) {
  intervalSlots = intervalSlots.map(slot =>
    slot.filter(x => x !== idIntervalo)
  );
  atualizarPainel();
}
