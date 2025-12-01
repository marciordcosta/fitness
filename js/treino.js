// treino.js — versão corrigida final (harmonizado com treino_progresso.js e com parsing de datas)
/* Usa o cliente criado em supabase.js */
const sb = window.sb;

let currentUserId = null;

// estado
let PADROES = [];          // padroes_movimento (cores)
let BASE_EXERCICIOS = [];  // exercicios (banco de exercícios-base)
let TREINOS = [];          // blocos A..E (tabela treinos)
let TREINO_EXS = [];       // exercícios de cada bloco (tabela treino_exercicios)
let TREINO_REGISTROS = []; // registros usados para progresso

let boardEl = null;

// === Cores de progresso aplicadas globalmente (Harmonizado com treino_progresso.js) ===
function getCorProgresso(pct) {
  if (pct > 0) return "#bde6beff";
  if (pct < 0) return "#ffc5c0";
  return "#f2f2ee";
}

// utilitário: parsear YYYY-MM-DD como data local (meia-noite)
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  if (dateStr.includes('T')) return new Date(dateStr);
  return new Date(`${dateStr}T00:00:00`);
}

// Agrupa registros por data (mantendo a ordem das datas)
function agruparPorData(regs) {
  const mapa = {};
  regs.forEach(r => {
    const d = r.data;
    if (!mapa[d]) mapa[d] = [];
    mapa[d].push(r);
  });
  const arr = Object.entries(mapa).map(([data, regs]) => ({ data, regs }));
  // ordenar por data asc usando parseLocalDate
  arr.sort((a, b) => parseLocalDate(a.data) - parseLocalDate(b.data));
  return arr;
}

function calcular1RM(peso, reps) {
  // Harmonizado: retorna null quando dados faltam (igual treino_progresso.js)
  if (!peso || !reps) return null;
  return Number(peso) * (1 + Number(reps) / 30);
}


// === FUNÇÕES DE BUSCA DE PESO/REPS MÁXIMOS DO DIA (ALINHAMENTO com treino_progresso.js) ===

// Retorna o peso máximo registrado no dia
function lastValuePeso(regs) {
  // Harmonizado: retorna null quando não há valor
  if (!regs || !regs.length) return null;
  let mx = null; // Inicializa em null para comparação consistente
  regs.forEach(r => { 
    if (r.peso != null && r.peso !== '') { 
      const v = Number(r.peso); 
      if (!isNaN(v) && (mx === null || v > mx)) {
        mx = v; 
      }
    }
  });
  return mx;
}

// Retorna as repetições correspondentes ao peso máximo registrado no dia
function lastValueReps(regs) {
  // Harmonizado: retorna null quando não há valor
  if (!regs || !regs.length) return null;
  let mxPeso = null; // Peso máximo encontrado (inicializado em null)
  let rep = null;    // Reps correspondentes ao peso máximo
  regs.forEach(r => {
    if (r.peso != null && r.peso !== '') {
      const vp = Number(r.peso);
      const vr = Number(r.repeticoes);
      if (!isNaN(vp) && !isNaN(vr)) {
        if (mxPeso === null || vp > mxPeso) { 
          mxPeso = vp; 
          rep = vr; 
        }
      }
    }
  });
  return rep;
}

// Filtra registros considerando os últimos 30 dias A PARTIR DA ÚLTIMA DATA REAL
function filtrarUltimos30Dias(registros) {
  if (!registros || !registros.length) return [];

  // obter todas as datas e ordená-las (usando parseLocalDate)
  const datas = registros
    .map(r => parseLocalDate(r.data).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  if (!datas.length) return [];

  // última data real registrada
  const ultimaData = new Date(datas[datas.length - 1]);
  ultimaData.setHours(0, 0, 0, 0);

  // início = 30 dias antes da última data
  const inicio = new Date(ultimaData.getTime() - (29 * 24 * 60 * 60 * 1000));

  // retorna somente registros dentro do intervalo (comparando com parseLocalDate)
  return registros.filter(r => {
    const d = parseLocalDate(r.data);
    return d >= inicio && d <= ultimaData;
  });
}


// Calcula % de progresso para um exercicio base (exercicio_id)
function calcularPctProgressoExercicio(idBase) {
  if (!idBase) return 0;
  if (!Array.isArray(TREINO_REGISTROS) || !TREINO_REGISTROS.length) return 0;

  // filtra registros do exercício
  const regs = TREINO_REGISTROS.filter(r => Number(r.exercicio_id) === Number(idBase));
  if (!regs.length) return 0;

  // agrupa por data (mesma lógica do treino_progresso)
  const agrup = agruparPorData(regs);

  // calcula 1RM de cada dia
  const dias = agrup.map(g => {
    // maior 1RM da data
    const maior = g.regs.reduce((best, r) => {
      const rm = calcular1RM(r.peso, r.repeticoes);
      return (rm > best ? rm : best);
    }, 0);
    return { data: g.data, rm: maior };
  });

  if (!dias.length) return 0;

  // pegar no máximo os últimos 6 dias
  const ultimos = dias.slice(-6);

  // A — sempre usar primeiro e último disponível
  const primeiro = ultimos[0]?.rm ?? null;
  const ultimo   = ultimos[ultimos.length - 1]?.rm ?? null;

  if (
    primeiro == null || ultimo == null ||
    isNaN(primeiro) || isNaN(ultimo) ||
    primeiro <= 0
  ) {
    return 0;
  }

  // cálculo percentual
  const pct = ((ultimo - primeiro) / primeiro) * 100;
  return pct;
}

// ------------------------------------------
// Inicialização DOM
// ------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  boardEl = document.getElementById("treinoBoard");

  await initUser();
  await carregarPadroes();
  await carregarBaseExercicios();
  await carregarTreinos();
  await carregarTreinoExs();
  await carregarTreinoRegistros(); // garante registros carregados antes do render
  renderTreinos();

  const btnAdd = document.getElementById("btnAddTreino");
  if (btnAdd) btnAdd.addEventListener("click", novoTreino);
});

// ------------------------------------------
// AUTH
// ------------------------------------------
async function initUser() {
  try {
    const { data, error } = await sb.auth.getUser();
    if (error) {
      console.error("auth.getUser erro:", error);
      return;
    }
    currentUserId = data?.user?.id || null;
  } catch (e) {
    console.error("initUser erro:", e);
  }
}

// ------------------------------------------
// CARREGAR SUPABASE
// ------------------------------------------
async function carregarPadroes() {
  let q = sb.from("padroes_movimento").select("*").order("ordem", { ascending: true });
  if (currentUserId) q = q.eq("user_id", currentUserId);
  const { data, error } = await q;
  if (error) {
    console.error("Erro carregar padroes_movimento:", error);
    PADROES = [];
    return;
  }
  PADROES = data || [];
}

async function carregarBaseExercicios() {
  let q = sb.from("exercicios").select("*").order("ordem", { ascending: true });
  if (currentUserId) q = q.eq("user_id", currentUserId);
  const { data, error } = await q;
  if (error) {
    console.error("Erro carregar exercicios base:", error);
    BASE_EXERCICIOS = [];
    return;
  }
  BASE_EXERCICIOS = data || [];
}

async function carregarTreinos() {
  let q = sb.from("treinos").select("*").order("ordem", { ascending: true });
  if (currentUserId) q = q.eq("user_id", currentUserId);
  const { data, error } = await q;
  if (error) {
    console.error("Erro carregar treinos:", error);
    TREINOS = [];
    return;
  }
  TREINOS = data || [];
}

// Carrega todos os exercícios que pertencem aos treinos (com join em exercicios)
async function carregarTreinoExs() {
  let q = sb
    .from("treino_exercicios")
    .select(`
      *,
      exercicios (
        id,
        exercicio,
        descanso
      )
    `)
    .order("ordem", { ascending: true });

  if (currentUserId) q = q.eq("user_id", currentUserId);

  const { data, error } = await q;

  if (error) {
    console.error("Erro carregar treino_exercicios:", error);
    TREINO_EXS = [];
    return;
  }

  TREINO_EXS = data || [];
}

// Carrega registros de treino (histórico) usados para calcular progresso
async function carregarTreinoRegistros() {
  let q = sb.from("treino_registros").select("*").order("data", { ascending: true });
  if (currentUserId) q = q.eq("user_id", currentUserId);

  const { data, error } = await q;
  if (error) {
    console.error("Erro carregar treino_registros:", error);
    TREINO_REGISTROS = [];
    return;
  }
  TREINO_REGISTROS = data || [];
}

// ------------------------------------------
// HELPERS
// ------------------------------------------
function letraPorIndice(idx) {
  return String.fromCharCode("A".charCodeAt(0) + idx);
}

function padraoPorId(id) {
  return PADROES.find(p => p.id === id);
}

function exercicioBasePorId(id) {
  return BASE_EXERCICIOS.find(e => e.id === id);
}

function aplicarCorPadraoSelect(selPad, ex) {
  const p = padraoPorId(ex.padrao_id);

  if (!p) {
    // Sem padrão: fundo branco, borda padrão
    selPad.style.background = "#ffffff";
    selPad.style.color = "#111";
    selPad.style.border = "1px solid #ddd";
    return;
  }

  // Com padrão: fundo e borda iguais à cor do padrão
  const cor = p.cor_fundo || "#ffffff";

  selPad.style.background = cor;
  selPad.style.color = p.cor_fonte || "#111";

  // Borda com a mesma cor do padrão
  selPad.style.border = `1px solid ${cor}`;

  // Mantém formato da bolinha
  selPad.style.borderRadius = "16px";
}

// ------------------------------------------
// NOVO TREINO (BLOCO)
// ------------------------------------------
async function novoTreino() {
  const ordem = TREINOS.length;
  const payload = { nome_treino: "", ordem };
  if (currentUserId) payload.user_id = currentUserId;

  const { data, error } = await sb.from("treinos").insert(payload).select();
  if (error) {
    console.error("Erro ao criar treino:", error);
    alert("Erro ao criar treino.");
    return;
  }
  TREINOS.push(data[0]);
  renderTreinos();
}

// ------------------------------------------
// RENDER PRINCIPAL
// ------------------------------------------
function renderTreinos() {
  if (!boardEl) return;
  boardEl.innerHTML = "";

  if (!TREINOS.length) {
    const hint = document.createElement("div");
    hint.className = "hint-empty";
    hint.textContent = "Nenhum treino criado. Clique no + para adicionar.";
    boardEl.appendChild(hint);
    return;
  }

  TREINOS.sort((a,b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  TREINOS.forEach((t, idx) => {
    const card = criarTreinoCard(t, idx);
    boardEl.appendChild(card);
  });

  attachDragTreinos();
  attachDragExercicios();

  // Depois de renderizar, atualiza painel se existir
  if (typeof atualizarPainel === "function") atualizarPainel();
}

function formatarTempo(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m} min`;
}

function criarTreinoCard(treino, index) {
  const card = document.createElement("div");
  card.className = "treino-card";
  card.dataset.id = treino.id;
  card.draggable = false; // vamos arrastar só pelo handle

  const topo = document.createElement("div");
  topo.className = "treino-topo";

  const left = document.createElement("div");
  left.className = "treino-left";

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "treino-handle icon-btn";
  handle.title = "Arrastar treino";
  handle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M10 4h.01M14 4h.01M10 9h.01M14 9h.01M10 14h.01M14 14h.01M10 19h.01M14 19h.01"
        stroke="#666" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
  handle.draggable = true;

  const letra = document.createElement("div");
  letra.className = "treino-letra";
  letra.textContent = letraPorIndice(index);

  const nomeInp = document.createElement("input");
  nomeInp.className = "nome-treino";
  nomeInp.placeholder = `${letra.textContent} - Nome do treino`;
  nomeInp.value = treino.nome_treino || "";
  nomeInp.oninput = async () => {
    const novo = nomeInp.value;
    treino.nome_treino = novo;
    const { error } = await sb.from("treinos").update({ nome_treino: novo }).eq("id", treino.id);
    if (error) console.error("Erro atualizar nome_treino:", error);
  };

  left.appendChild(handle);
  left.appendChild(letra);
  left.appendChild(nomeInp);

  const right = document.createElement("div");
  right.className = "treino-right";

  const btnAddEx = document.createElement("button");
  btnAddEx.className = "icon-btn";
  btnAddEx.title = "Adicionar exercício";
  btnAddEx.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="#0a0" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `;
  btnAddEx.onclick = () => adicionarExercicioTreino(treino.id);

  const btnDelTreino = document.createElement("button");
  btnDelTreino.className = "icon-btn";
  btnDelTreino.title = "Excluir treino";
  btnDelTreino.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" stroke="#c00" stroke-width="2.2"/>
    </svg>
  `;
  btnDelTreino.onclick = () => excluirTreino(treino.id);

  right.appendChild(btnAddEx);
  right.appendChild(btnDelTreino);

  topo.appendChild(left);
  topo.appendChild(right);
  card.appendChild(topo);

  const lista = document.createElement("div");
  lista.className = "ex-list";
  lista.dataset.treino = treino.id;

  const exs = TREINO_EXS
    .filter(e => e.treino_id === treino.id)
    .sort((a,b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  if (!exs.length) {
    const h = document.createElement("div");
    h.className = "hint-empty";
    h.textContent = "Nenhum exercício. Clique no + para adicionar.";
    lista.appendChild(h);
  } else {
    exs.forEach(e => {
      lista.appendChild(criarLinhaExercicio(treino, e));
    });
  }

  card.appendChild(lista);

  /* ====== CÁLCULO ====== */
  const exsDoTreino = TREINO_EXS.filter(e => e.treino_id === treino.id);

  let totalValidas = 0;
  let totalTempoEstimado = 0; // Armazena a soma de todos os tempos de exercício

  exsDoTreino.forEach(ex => {
    const prep = Number(ex.prep) || 0;
    const val = Number(ex.validas) || 0;
    const descanso = Number(ex.exercicios?.descanso) || 0;

    const tempoPrep = prep * 2;
    const tempoValidasEmExecucao = val * 1;
    const tempoDescansoTotal = descanso * val;
    const tempoExercicio = tempoPrep + tempoValidasEmExecucao + tempoDescansoTotal;

    totalValidas += val;
    totalTempoEstimado += tempoExercicio;
  });

  // O tempo estimado é o total calculado com a nova lógica
  const tempoEstimado = totalTempoEstimado;

  /* ====== BLOCO FIXO NO RODAPÉ ====== */
  const resumo = document.createElement("div");
  resumo.style.cssText = `
    margin-top: auto;
    padding: 10px;
    border-radius: 15px;
    background:#f3f3f3;
    font-size:14px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:20px;
    color:#333;
  `;

  resumo.innerHTML = `
    <div>
      <strong>Séries válidas:</strong> ${totalValidas}
    </div>

    <div style="text-align:right;">
      <strong>Tempo estimado:</strong> ${formatarTempo(tempoEstimado)}
    </div>
  `;

  card.appendChild(resumo);

  return card;
}

// ------------------------------------------
// LINHA DE EXERCÍCIO
// ------------------------------------------
function criarLinhaExercicio(treino, ex) {
  const row = document.createElement("div");
  row.className = "item-ex";
  row.dataset.id = ex.id;
  row.draggable = false;

  const dragHandle = document.createElement("div");
  dragHandle.className = "ex-handle";
  dragHandle.textContent = "⠿";
  dragHandle.style.cursor = "grab";
  dragHandle.draggable = true;

  const selPad = document.createElement("select");
  selPad.className = "sel-padrao";

  const optBlank = document.createElement("option");
  optBlank.value = "";
  optBlank.textContent = "--";
  selPad.appendChild(optBlank);

  PADROES.forEach(p => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.nome;
    selPad.appendChild(o);
  });

  selPad.value = ex.padrao_id || "";

  aplicarCorPadraoSelect(selPad, ex);

  selPad.addEventListener("mousedown", () => {
    selPad.style.background = "#ffffff";
    selPad.style.color = "#111";
  });

  selPad.addEventListener("change", async () => {
    const novoPadraoId = selPad.value ? Number(selPad.value) : null;
    ex.padrao_id = novoPadraoId;
    ex.exercicio_id = null;

    const payload = { padrao_id: novoPadraoId, exercicio_id: null };
    const { error } = await sb.from("treino_exercicios").update(payload).eq("id", ex.id);
    if (error) console.error("Erro atualizar padrao_id:", error);

    aplicarCorPadraoSelect(selPad, ex);
    renderTreinos();
  });

  const selEx = document.createElement("select");
  selEx.className = "sel-exercicio";

  const optEBlank = document.createElement("option");
  optEBlank.value = "";
  optEBlank.textContent = "--";
  selEx.appendChild(optEBlank);

  let listaBase = BASE_EXERCICIOS;
  if (ex.padrao_id) {
    listaBase = BASE_EXERCICIOS.filter(b => b.padrao_id === ex.padrao_id);
  }
  listaBase.forEach(b => {
    const o = document.createElement("option");
    o.value = b.id;
    o.textContent = b.exercicio;
    if (ex.exercicio_id === b.id) o.selected = true;
    selEx.appendChild(o);
  });

  selEx.onchange = async () => {
    const novoId = selEx.value ? Number(selEx.value) : null;
    ex.exercicio_id = novoId;
    const { error } = await sb.from("treino_exercicios").update({ exercicio_id: novoId }).eq("id", ex.id);
    if (error) console.error("Erro atualizar exercicio_id:", error);
    // Re-render para que o botão P use a cor correta (base id -> historico)
    await carregarTreinoRegistros(); // opcional: recarrega histórico caso tenha mudado
    renderTreinos();
  };

  const prep = document.createElement("input");
  prep.type = "number";
  prep.className = "input-mini";
  prep.placeholder = "prep";
  prep.min = "0";
  prep.value = ex.prep ?? "";
  prep.oninput = async () => {
    if (prep.value < 0) prep.value = 0;
    const valor = prep.value ? Number(prep.value) : null;
    ex.prep = valor;
    const { error } = await sb.from("treino_exercicios").update({ prep: valor }).eq("id", ex.id);
    if (error) console.error("Erro atualizar prep:", error);
    renderTreinos();
  };

  const val = document.createElement("input");
  val.type = "number";
  val.className = "input-mini";
  val.placeholder = "válidas";
  val.min = "0";
  val.value = ex.validas ?? "";
  val.oninput = async () => {
    if (val.value < 0) val.value = 0;
    const valor = val.value ? Number(val.value) : null;
    ex.validas = valor;
    const { error } = await sb.from("treino_exercicios").update({ validas: valor }).eq("id", ex.id);
    if (error) console.error("Erro atualizar validas:", error);
    renderTreinos();
  };

  const btnRem = document.createElement("button");
  btnRem.type = "button";
  btnRem.className = "btn-remove-ex";
  btnRem.title = "Remover exercício";
  btnRem.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" stroke="rgba(255, 183, 183, 1)" stroke-width="2"/>
    </svg>
  `;
  btnRem.onclick = () => excluirTreinoExercicio(ex.id);

  row.appendChild(dragHandle);
  row.appendChild(selPad);
  row.appendChild(selEx);
  row.appendChild(prep);
  row.appendChild(val);

  // Botão de progresso "1RM"
  const btnProg = document.createElement("button");
  btnProg.type = "button";
  btnProg.className = "btn-progresso";
  btnProg.title = "Progresso do exercício";
  btnProg.textContent = "1RM";
  btnProg.onclick = () => {
    if (!ex.exercicio_id) {
      alert("Selecione o exercício antes de abrir o progresso.");
      return;
    }

    localStorage.setItem("progresso_exercicio_id", String(ex.exercicio_id));
    localStorage.setItem("progresso_treino_id", String(treino.id));
    window.location.href = "treino_progresso.html";
  };


  // === COR DO P NO CARD: usa exercicio base (ex.exercicio_id) e os registros ===
  const baseId = ex.exercicio_id;
  const pct = calcularPctProgressoExercicio(baseId);
  btnProg.style.background = getCorProgresso(pct);

  row.appendChild(btnProg);
  row.appendChild(btnRem);

  return row;
}

// ------------------------------------------
// CRUD EXERCÍCIO DO TREINO
// ------------------------------------------
async function adicionarExercicioTreino(treinoId) {
  const exsTreino = TREINO_EXS.filter(e => e.treino_id === treinoId);
  const ordem = exsTreino.length;

  const payload = {
    treino_id: treinoId,
    padrao_id: null,
    exercicio_id: null,
    descanso: null,
    prep: null,
    validas: null,
    ordem
  };
  if (currentUserId) payload.user_id = currentUserId;

  const { data, error } = await sb.from("treino_exercicios").insert(payload).select();
  if (error) {
    console.error("Erro ao adicionar exercício no treino:", error);
    alert("Erro ao adicionar exercício.");
    return;
  }
  TREINO_EXS.push(data[0]);
  renderTreinos();
}

async function excluirTreinoExercicio(id) {
  if (!confirm("Excluir este exercício do treino?")) return;
  const { error } = await sb.from("treino_exercicios").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir treino_exercicio:", error);
    alert("Erro ao excluir exercício.");
    return;
  }
  TREINO_EXS = TREINO_EXS.filter(e => e.id !== id);
  renderTreinos();
}

// ------------------------------------------
// EXCLUIR TREINO
// ------------------------------------------
async function excluirTreino(id) {
  if (!confirm("Excluir este treino e todos os exercícios dele?")) return;
  const { error } = await sb.from("treinos").delete().eq("id", id);
  if (error) {
    console.error("Erro excluir treino:", error);
    alert("Erro ao excluir treino.");
    return;
  }
  TREINOS = TREINOS.filter(t => t.id !== id);
  TREINO_EXS = TREINO_EXS.filter(e => e.treino_id !== id);
  renderTreinos();
}

// ------------------------------------------
// DRAG & DROP – TREINOS
// ------------------------------------------
function attachDragTreinos() {
  if (!boardEl) return;
  const cards = Array.from(boardEl.querySelectorAll(".treino-card"));
  let arrastando = null;

  cards.forEach(card => {
    const handle = card.querySelector(".treino-handle");
    if (!handle) return;

    handle.addEventListener("dragstart", e => {
      arrastando = card;
      card.classList.add("arrastando");
      try { e.dataTransfer.setData("text/plain", ""); } catch(_) {}
    });

    handle.addEventListener("dragend", async () => {
      if (!arrastando) return;
      arrastando.classList.remove("arrastando");

      const ordemNova = Array.from(boardEl.children)
        .filter(el => el.classList.contains("treino-card"))
        .map((el, idx) => ({ id: Number(el.dataset.id), ordem: idx }));

      for (const o of ordemNova) {
        await sb.from("treinos").update({ ordem: o.ordem }).eq("id", o.id);
        const item = TREINOS.find(t => t.id === o.id);
        if (item) item.ordem = o.ordem;
      }

      renderTreinos();
      arrastando = null;
    });
  });

  boardEl.ondragover = e => {
    e.preventDefault();
    if (!arrastando) return;

    const cardsAtuais = Array.from(boardEl.querySelectorAll(".treino-card"));
    const alvo = cardsAtuais.find(el => {
      const box = el.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });

    if (alvo && alvo !== arrastando) boardEl.insertBefore(arrastando, alvo);
    else if (!alvo) boardEl.appendChild(arrastando);
  };
}

// ------------------------------------------
// DRAG & DROP – EXERCÍCIOS
// ------------------------------------------
function attachDragExercicios() {
  const listas = Array.from(document.querySelectorAll(".ex-list"));
  let arrastando = null;

  listas.forEach(lista => {
    const itens = Array.from(lista.querySelectorAll(".item-ex"));

    itens.forEach(row => {
      const handle = row.querySelector(".ex-handle");
      if (!handle) return;

      handle.addEventListener("dragstart", e => {
        arrastando = row;
        row.classList.add("arrastando");
        try { e.dataTransfer.setData("text/plain", ""); } catch(_) {}
      });

      handle.addEventListener("dragend", async () => {
        if (!arrastando) return;
        row.classList.remove("arrastando");

        const novaLista = arrastando.closest(".ex-list");
        const novoTreinoId = Number(novaLista.dataset.treino);

        const ordemNova = Array.from(novaLista.querySelectorAll(".item-ex"))
          .map((el, idx) => ({ id: Number(el.dataset.id), ordem: idx }));

        for (const o of ordemNova) {
          await sb.from("treino_exercicios").update({ ordem: o.ordem, treino_id: novoTreinoId }).eq("id", o.id);
          const itemObj = TREINO_EXS.find(e => e.id === o.id);
          if (itemObj) {
            itemObj.ordem = o.ordem;
            itemObj.treino_id = novoTreinoId;
          }
        }

        arrastando = null;
      });
    });
  });

  listas.forEach(lista => {
    lista.addEventListener("dragover", e => {
      e.preventDefault();
      if (!arrastando) return;

      const itens = Array.from(lista.querySelectorAll(".item-ex"));
      const alvo = itens.find(el => {
        const box = el.getBoundingClientRect();
        return e.clientY < box.top + box.height / 2;
      });

      if (alvo && alvo !== arrastando) lista.insertBefore(arrastando, alvo);
      else if (!alvo) lista.appendChild(arrastando);
    });
  });
}

window.addEventListener("load", () => {
  if (typeof atualizarPainel === "function") atualizarPainel();
});

// Abre a página de progresso para o exercício selecionado
function abrirProgresso(exercicioId, treinoId) {
  if (!exercicioId) {
    alert("Selecione um exercício antes de abrir o progresso.");
    return;
  }

  // salvar os IDs corretos
  localStorage.setItem("progresso_exercicio_id", exercicioId);
  localStorage.setItem("progresso_treino_id", treinoId);

  // ir para a tela de progresso
  window.location.href = "treino_progresso.html";
}
