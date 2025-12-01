// Usa o cliente criado em supabase.js
const sb = window.sb;

let currentUserId = null;

// estado
let padroes = [];      // colunas (padroes_movimento)
let exercicios = [];   // itens (exercicios)

// NOVO: cache de grupos musculares
let gruposMuscularesCache = [];

// refs gerais
let kanbanEl = null;

// estado modal exercício
let modalEx = null;
let exNomeInput = null;
let exDescansoInput = null;
let gruposContainer = null;
let btnSalvarEx = null;
let btnExcluirEx = null;
let gruposDinamicos = [];  // {id, grupo, valida}
let exercicioAtual = null; // objeto em edição ou null
let padraoAtualId = null;  // coluna em que será criado o exercício

// NOVO: instancia do Sortable para colunas
let sortableColunas = null;

document.addEventListener("DOMContentLoaded", async () => {
  kanbanEl = document.getElementById("kanban");
  criarModalExercicioDOM();

  await initUser();
  await carregarPadroes();
  await carregarExercicios();
  await carregarGruposMusculares();   // NOVO
  renderKanban();
});

// --------------------------------------------------
// AUTH (user_id único, mas mantém coerência com RLS)
// --------------------------------------------------
async function initUser() {
  try {
    const { data, error } = await sb.auth.getUser();
    if (error) {
      console.error("Erro auth.getUser:", error);
      return;
    }
    currentUserId = data?.user?.id || null;
  } catch (e) {
    console.error("Erro initUser:", e);
  }
}

// --------------------------------------------------
// MODAL EXERCÍCIO – DOM
// --------------------------------------------------
function criarModalExercicioDOM() {
  modalEx = document.createElement("div");
  modalEx.id = "modalExercicio";
  modalEx.className = "modal";
  modalEx.setAttribute("aria-hidden", "true");

  modalEx.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-box">
      <h3>Exercício</h3>

      <div style="display:grid;grid-template-columns:70% 30%;gap:10px;margin-bottom:10px;">
        <div>
          <label for="ex_nome">Exercício</label>
          <input type="text" id="ex_nome" />
        </div>
        <div>
          <label for="ex_descanso">Descanso (min)</label>
          <input type="number" id="ex_descanso" min="0" />
        </div>
      </div>

      <div style="margin-bottom:8px;font-size:12px;color:#555;">Grupo muscular / Séries válidas</div>
      <div id="gruposContainer" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>

      <button id="btnAddGrupo" class="btn-secondary" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span>+</span> <span>Adicionar</span>
      </button>

      <div class="modal-footer">
        <button class="btn-danger" id="btnExcluirEx">Excluir</button>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary" type="button" id="btnCancelarEx">Cancelar</button>
          <button class="btn-primary" id="btnSalvarEx">Salvar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEx);

  exNomeInput       = modalEx.querySelector("#ex_nome");
  exDescansoInput   = modalEx.querySelector("#ex_descanso");
  gruposContainer   = modalEx.querySelector("#gruposContainer");
  btnSalvarEx       = modalEx.querySelector("#btnSalvarEx");
  btnExcluirEx      = modalEx.querySelector("#btnExcluirEx");
  const btnAddGrupo = modalEx.querySelector("#btnAddGrupo");
  const btnCancelar = modalEx.querySelector("#btnCancelarEx");
  const backdrop    = modalEx.querySelector(".modal-backdrop");

  btnAddGrupo.onclick = () => {
    if (gruposDinamicos.length >= 3) return;
    gruposDinamicos.push(criarLinhaGrupo());
    renderGrupos();
  };

  btnCancelar.onclick = fecharModalExercicio;
  backdrop.onclick = fecharModalExercicio;

  btnSalvarEx.onclick = salvarExercicioDoModal;
  btnExcluirEx.onclick = excluirExercicioDoModal;
}


// atualiza botão de adicionar grupo
function atualizarEstadoBotaoAdd() {
  const btn = document.getElementById("btnAddGrupo");
  if (!btn) return;
  if (gruposDinamicos.length >= 3) {
    btn.disabled = true;
    btn.style.opacity = "0.4";
    btn.style.cursor = "not-allowed";
  } else {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.style.cursor = "pointer";
  }
}
// --------------------------------------------------
// MODAL – estado e helpers
// --------------------------------------------------
function abrirModalNovoExercicio(padraoId) {
  padraoAtualId   = padraoId;
  exercicioAtual  = null;
  exNomeInput.value = "";
  exDescansoInput.value = "";
  gruposDinamicos = [criarLinhaGrupo()];
  renderGrupos();
  btnExcluirEx.style.display = "none";
  modalEx.setAttribute("aria-hidden", "false");
}

function abrirModalEditarExercicio(id) {
  const e = exercicios.find(x => x.id === id);
  if (!e) return;
  exercicioAtual = e;
  padraoAtualId  = e.padrao_id;

  exNomeInput.value     = e.exercicio || "";
  exDescansoInput.value = e.descanso ?? "";

  gruposDinamicos = [];
  if (e.grupo1) gruposDinamicos.push(criarLinhaGrupo(e.grupo1, e.validas1));
  if (e.grupo2) gruposDinamicos.push(criarLinhaGrupo(e.grupo2, e.validas2));
  if (e.grupo3) gruposDinamicos.push(criarLinhaGrupo(e.grupo3, e.validas3));
  if (!gruposDinamicos.length) gruposDinamicos.push(criarLinhaGrupo());

  renderGrupos();
  btnExcluirEx.style.display = "inline-flex";
  modalEx.setAttribute("aria-hidden", "false");
}

function fecharModalExercicio() {
  modalEx.setAttribute("aria-hidden", "true");
}

function criarLinhaGrupo(grupo = "", valida = "") {
  return {
    id: Date.now() + Math.random(),
    grupo,
    valida
  };
}

function renderGrupos() {
  gruposContainer.innerHTML = "";
  gruposDinamicos.forEach(g => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "70% 20% 30px";
    row.style.gap = "8px";
    row.style.alignItems = "center";

    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = g.grupo;
    inp.placeholder = "Grupo muscular";
    inp.autocomplete = "off";

    inp.oninput = () => {
      g.grupo = inp.value;
      mostrarSugestoesGrupo(inp);
    };

    inp.onfocus = () => {
      if (inp.value.trim() !== "") mostrarSugestoesGrupo(inp);
    };

    const sel = document.createElement("select");
    sel.innerHTML = `
      <option value="">--</option>
      <option value="1">1</option>
      <option value="0.75">0.75</option>
      <option value="0.5">0.5</option>
      <option value="0.25">0.25</option>
    `;
    sel.value = g.valida != null ? String(g.valida) : "";
    sel.onchange = () => g.valida = sel.value;

    const btnX = document.createElement("button");
    btnX.type = "button";
    btnX.textContent = "X";
    btnX.className = "btn-danger";
    btnX.style.padding = "4px 0";
    btnX.onclick = () => {
      gruposDinamicos = gruposDinamicos.filter(x => x.id !== g.id);
      if (!gruposDinamicos.length) gruposDinamicos.push(criarLinhaGrupo());
      renderGrupos();
    };

    row.appendChild(inp);
    row.appendChild(sel);
    row.appendChild(btnX);
    gruposContainer.appendChild(row);
  });

  atualizarEstadoBotaoAdd();}

// --------------------------------------------------
// AUTOCOMPLETE GRUPOS MUSCULARES
// --------------------------------------------------
async function carregarGruposMusculares() {
  let q = sb
    .from("exercicios")
    .select("grupo1, grupo2, grupo3");

  if (currentUserId) q = q.eq("user_id", currentUserId);

  const { data, error } = await q;

  if (error) {
    console.error("Erro ao carregar grupos:", error);
    gruposMuscularesCache = [];
    return;
  }

  const lista = [];
  data.forEach(e => {
    if (e.grupo1) lista.push(e.grupo1.trim());
    if (e.grupo2) lista.push(e.grupo2.trim());
    if (e.grupo3) lista.push(e.grupo3.trim());
  });

  gruposMuscularesCache = [...new Set(lista)].sort();
}

function mostrarSugestoesGrupo(inputEl) {
  removerDropdownsGrupo();

  const valor = inputEl.value.trim().toLowerCase();
  if (!valor) return;

  const filtrados = gruposMuscularesCache.filter(g =>
    g.toLowerCase().includes(valor)
  );

  if (!filtrados.length) return;

  const box = document.createElement("div");
  box.className = "autocomplete-grupo-box";
  box.style.position = "absolute";
  box.style.background = "#fff";
  box.style.border = "1px solid #ccc";
  box.style.borderRadius = "6px";
  box.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
  box.style.zIndex = 9999;
  box.style.width = inputEl.offsetWidth + "px";
  box.style.maxHeight = "140px";
  box.style.overflowY = "auto";

  const rect = inputEl.getBoundingClientRect();
  box.style.left = rect.left + "px";
  box.style.top = rect.bottom + window.scrollY + "px";

  filtrados.forEach(txt => {
    const opt = document.createElement("div");
    opt.textContent = txt;
    opt.style.padding = "6px 8px";
    opt.style.cursor = "pointer";
    opt.style.fontSize = "13px";

    opt.onclick = () => {
      inputEl.value = txt;
      inputEl.dispatchEvent(new Event("input"));
      removerDropdownsGrupo();
    };

    opt.onmouseover = () => opt.style.background = "#f0f0f0";
    opt.onmouseout  = () => opt.style.background = "#fff";

    box.appendChild(opt);
  });

  document.body.appendChild(box);
}

function removerDropdownsGrupo() {
  document.querySelectorAll(".autocomplete-grupo-box").forEach(b => b.remove());
}

// safety: evita erro se target não for Element ou não tiver closest/classList
document.addEventListener("click", e => {
  const tgt = e.target;
  try {
    if (tgt && typeof tgt.closest === "function" && tgt.closest('.autocomplete-grupo-box')) {
      return; // clique dentro do dropdown — não remover
    }
  } catch (_) {
    // se qualquer coisa falhar, continuar para remover
  }
  removerDropdownsGrupo();
});

// --------------------------------------------------
// SALVAR / EXCLUIR via modal
// --------------------------------------------------
async function salvarExercicioDoModal() {
  const nome = exNomeInput.value.trim();
  if (!nome) {
    alert("Informe o exercício.");
    return;
  }

  const g1 = gruposDinamicos[0] || {};
  const g2 = gruposDinamicos[1] || {};
  const g3 = gruposDinamicos[2] || {};

  const payload = {
    exercicio: nome,
    descanso: exDescansoInput.value ? Number(exDescansoInput.value) : null,
    grupo1: g1.grupo?.trim() || null,
    grupo2: g2.grupo?.trim() || null,
    grupo3: g3.grupo?.trim() || null,
    validas1: g1.valida === "" || g1.valida == null ? null : Number(g1.valida),
    validas2: g2.valida === "" || g2.valida == null ? null : Number(g2.valida),
    validas3: g3.valida === "" || g3.valida == null ? null : Number(g3.valida),
  };

  if (!exercicioAtual) {
    if (!padraoAtualId) {
      alert("Nenhum padrão selecionado.");
      return;
    }
    const ordem = exercicios.filter(e => e.padrao_id === padraoAtualId).length;

    const insertPayload = {
      ...payload,
      padrao_id: padraoAtualId,
      ordem
    };
    if (currentUserId) insertPayload.user_id = currentUserId;

    const { data, error } = await sb.from("exercicios").insert(insertPayload).select();
    if (error) {
      console.error("Erro ao inserir exercício:", error);
      alert("Erro ao salvar exercício.");
      return;
    }
    exercicios.push(data[0]);
  } else {
    const updatePayload = { ...payload };
    const { error } = await sb
      .from("exercicios")
      .update(updatePayload)
      .eq("id", exercicioAtual.id);
    if (error) {
      console.error("Erro ao atualizar exercício:", error);
      alert("Erro ao salvar exercício.");
      return;
    }
    Object.assign(exercicioAtual, updatePayload);
  }

  renderKanban();
  fecharModalExercicio();
}

async function excluirExercicioDoModal() {
  if (!exercicioAtual) return;
  if (!confirm("Excluir este exercício?")) return;

  const { error } = await sb.from("exercicios").delete().eq("id", exercicioAtual.id);
  if (error) {
    console.error("Erro ao excluir exercício:", error);
    alert("Erro ao excluir exercício.");
    return;
  }
  exercicios = exercicios.filter(e => e.id !== exercicioAtual.id);
  renderKanban();
  fecharModalExercicio();
}

// --------------------------------------------------
// SUPABASE – carregar dados
// --------------------------------------------------
async function carregarPadroes() {
  let query = sb.from("padroes_movimento").select("*").order("ordem", { ascending: true });
  if (currentUserId) query = query.eq("user_id", currentUserId);
  const { data, error } = await query;
  if (error) {
    console.error("Erro carregar padroes:", error);
    padroes = [];
    return;
  }
  padroes = data || [];
}

async function carregarExercicios() {
  let query = sb.from("exercicios").select("*").order("ordem", { ascending: true });
  if (currentUserId) query = query.eq("user_id", currentUserId);
  const { data, error } = await query;
  if (error) {
    console.error("Erro carregar exercicios:", error);
    exercicios = [];
    return;
  }
  exercicios = data || [];
}

// --------------------------------------------------
// NOVO PADRÃO (coluna)
// --------------------------------------------------
async function novoPadrao() {
  const ordem = padroes.length;
  const insertPayload = {
    nome: "",
    cor_fundo: "#ffffff",
    cor_fonte: "#111111",
    ordem
  };
  if (currentUserId) insertPayload.user_id = currentUserId;

  const { data, error } = await sb.from("padroes_movimento").insert(insertPayload).select();
  if (error) {
    console.error("Erro ao criar padrão:", error);
    alert("Erro ao criar padrão.");
    return;
  }
  padroes.push(data[0]);
  renderKanban();
}
window.novoPadrao = novoPadrao;

// --------------------------------------------------
// RENDER KANBAN
// --------------------------------------------------
function renderKanban() {
  if (!kanbanEl) return;
  kanbanEl.innerHTML = "";

  if (!padroes.length) {
    const hint = document.createElement("div");
    hint.className = "hint-empty";
    hint.textContent = "Nenhum padrão cadastrado. Clique no +.";
    kanbanEl.appendChild(hint);
    return;
  }

  padroes.forEach(p => {
    kanbanEl.appendChild(criarColunaDOM(p));
  });

  attachDragExercicios();
  initDragColunas(); // NOVO: ativa o drag das colunas após cada render
}

function criarColunaDOM(p) {
  const col = document.createElement("div");
  col.className = "coluna";
  col.dataset.id = p.id;

  const topo = document.createElement("div");
  topo.className = "coluna-topo";

  const handleCol = document.createElement("button");
  handleCol.className = "icon-btn";
  handleCol.title = "Arrastar coluna";
  handleCol.innerHTML = `
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path d="M10 4h.01M14 4h.01M10 9h.01M14 9h.01M10 14h.01M14 14h.01M10 19h.01M14 19h.01"
    stroke="#666" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  handleCol.style.cursor = "grab";

  const nomeInput = document.createElement("input");
  nomeInput.className = "campo-nome-padrao";
  nomeInput.value = p.nome || "";
  nomeInput.style.background = p.cor_fundo || "#ffffff";
  nomeInput.style.color = p.cor_fonte || "#111111";
  nomeInput.oninput = async () => {
    const novoNome = nomeInput.value;
    const { error } = await sb
      .from("padroes_movimento")
      .update({ nome: novoNome })
      .eq("id", p.id);
    if (error) console.error("Erro atualizar nome padrão:", error);
    p.nome = novoNome;
  };

  const icons = document.createElement("div");
  icons.className = "coluna-icons";

  const btnCor = document.createElement("button");
  btnCor.className = "icon-btn";
  btnCor.title = "Editar cores";
  btnCor.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" stroke="#555" stroke-width="2" fill="none"/>
    </svg>
  `;
  btnCor.onclick = () => editarCoresPadrao(p, nomeInput);

  const btnAddEx = document.createElement("button");
  btnAddEx.className = "icon-btn";
  btnAddEx.title = "Adicionar exercício";
  btnAddEx.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke="#0a0" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  btnAddEx.onclick = () => abrirModalNovoExercicio(p.id);

  const btnDel = document.createElement("button");
  btnDel.className = "icon-btn";
  btnDel.title = "Excluir padrão";
  btnDel.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" stroke="#c00" stroke-width="2.2"/>
    </svg>`;
  btnDel.onclick = () => excluirPadrao(p.id);

  icons.appendChild(btnCor);
  icons.appendChild(btnAddEx);
  icons.appendChild(btnDel);

  topo.appendChild(handleCol);
  topo.appendChild(nomeInput);
  topo.appendChild(icons);
  col.appendChild(topo);

  const lista = document.createElement("div");
  lista.className = "lista-ex";
  lista.dataset.coluna = p.id;

  const exs = exercicios
    .filter(e => e.padrao_id === p.id)
    .sort((a,b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  if (!exs.length) {
    const h = document.createElement("div");
    h.className = "hint-empty";
    h.textContent = "Nenhum exercício. Clique no +.";
    lista.appendChild(h);
  } else {
    exs.forEach(e => lista.appendChild(criarItemExercicioDOM(e)));
  }

  col.appendChild(lista);
  return col;
}

function criarItemExercicioDOM(e) {
  const item = document.createElement("div");
  item.className = "item-ex";
  item.dataset.id = e.id;
  item.draggable = true;

  const nome = document.createElement("strong");
  nome.textContent = e.exercicio || "";

  const detalhes = document.createElement("small");
  const linhas = [];
  if (e.descanso != null) linhas.push(`Desc: ${e.descanso} min`);

  if (e.grupo1 && e.grupo1.trim() !== "") 
    linhas.push(`${e.grupo1} (${e.validas1 ?? ""})`);

  if (e.grupo2 && e.grupo2.trim() !== "") 
    linhas.push(`${e.grupo2} (${e.validas2 ?? ""})`);

  if (e.grupo3 && e.grupo3.trim() !== "") 
    linhas.push(`${e.grupo3} (${e.validas3 ?? ""})`);

  detalhes.textContent = linhas.join(" · ");

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const btnEdit = document.createElement("button");
  btnEdit.className = "icon-btn";
  btnEdit.title = "Editar";
  btnEdit.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24">
      <path d="M3 21v-3.75L14.8 5.4c.6-.6 1.6-.6 2.2 0l1.6 1.6c.6.6.6 1.6 0 2.2L6.8 21H3z"
            stroke="#e5e5e5" stroke-width="1.8"/>
    </svg>`;
  btnEdit.onclick = () => abrirModalEditarExercicio(e.id);

  const btnDel = document.createElement("button");
  btnDel.className = "icon-btn";
  btnDel.title = "Excluir";
  btnDel.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" stroke="rgba(252, 165, 165, 1)" stroke-width="2"/>
    </svg>`;
  btnDel.onclick = () => excluirExercicioDireto(e.id);

  actions.appendChild(btnEdit);
  actions.appendChild(btnDel);

  item.appendChild(nome);
  item.appendChild(detalhes);
  item.appendChild(actions);
  return item;
}

// --------------------------------------------------
// EDITAR / EXCLUIR PADRÃO
// --------------------------------------------------
let padraoEditandoCor = null;
let padraoInputElCor = null;

function editarCoresPadrao(p, inputEl) {
  padraoEditandoCor = p;
  padraoInputElCor = inputEl;

  document.getElementById("pick_fundo").value = p.cor_fundo || "#ffffff";
  document.getElementById("pick_fonte").value = p.cor_fonte || "#111111";

  document.getElementById("modalCores").setAttribute("aria-hidden", "false");
}

function fecharModalCores() {
  document.getElementById("modalCores").setAttribute("aria-hidden", "true");
  padraoEditandoCor = null;
  padraoInputElCor = null;
}

async function salvarCoresPadrao() {
  if (!padraoEditandoCor) return;

  const fundo = document.getElementById("pick_fundo").value;
  const fonte = document.getElementById("pick_fonte").value;

  const { error } = await sb
    .from("padroes_movimento")
    .update({ cor_fundo: fundo, cor_fonte: fonte })
    .eq("id", padraoEditandoCor.id);

  if (error) {
    console.error("Erro atualizar cores:", error);
    alert("Erro ao salvar cores.");
    return;
  }

  padraoEditandoCor.cor_fundo = fundo;
  padraoEditandoCor.cor_fonte = fonte;

  if (padraoInputElCor) {
    padraoInputElCor.style.background = fundo;
    padraoInputElCor.style.color = fonte;
  }

  fecharModalCores();
}

async function excluirPadrao(id) {
  if (!confirm("Excluir este padrão e todos os exercícios dele?")) return;

  const { error } = await sb.from("padroes_movimento").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir padrão:", error);
    alert("Erro ao excluir padrão.");
    return;
  }

  padroes = padroes.filter(p => p.id !== id);
  exercicios = exercicios.filter(e => e.padrao_id !== id);
  renderKanban();
}

// --------------------------------------------------
// EXCLUSÃO DIRETA
// --------------------------------------------------
async function excluirExercicioDireto(id) {
  if (!confirm("Excluir este exercício?")) return;
  const { error } = await sb.from("exercicios").delete().eq("id", id);
  if (error) {
    console.error("Erro ao excluir exercício:", error);
    alert("Erro ao excluir exercício.");
    return;
  }
  exercicios = exercicios.filter(e => e.id !== id);
  renderKanban();
}

// --------------------------------------------------
// DRAG & DROP – EXERCÍCIOS (mantido igual)
// --------------------------------------------------
function attachDragExercicios() {
  const listas = Array.from(document.querySelectorAll(".lista-ex"));
  let arrastando = null;

  listas.forEach(lista => {
    lista.querySelectorAll(".item-ex").forEach(item => {
      item.addEventListener("dragstart", () => {
        arrastando = item;
        item.classList.add("arrastando");
      });

      item.addEventListener("dragend", async () => {
        if (!arrastando) return;
        arrastando.classList.remove("arrastando");

        const novaLista = arrastando.closest(".lista-ex");
        const novoPadraoId = Number(novaLista.dataset.coluna);

        const ordem = Array.from(novaLista.querySelectorAll(".item-ex")).map((el, idx) => ({
          id: Number(el.dataset.id),
          ordem: idx
        }));

        for (const o of ordem) {
          await sb
            .from("exercicios")
            .update({ ordem: o.ordem, padrao_id: novoPadraoId })
            .eq("id", o.id);
        }

        await carregarExercicios();
        renderKanban();
        arrastando = null;
      });
    });

    lista.addEventListener("dragover", e => {
      e.preventDefault();
      if (!arrastando) return;

      const apos = Array.from(lista.querySelectorAll(".item-ex")).find(el => {
        const box = el.getBoundingClientRect();
        return e.clientY < box.top + box.height * 0.40;
      });

      if (apos && apos !== arrastando) {
        lista.insertBefore(arrastando, apos);
      } else if (!apos) {
        lista.appendChild(arrastando);
      }
    });
  });
}

// --------------------------------------------------
// NOVO: DRAG & DROP – COLUNAS COM SORTABLEJS
// --------------------------------------------------
function initDragColunas() {
  if (!kanbanEl) return;

  if (sortableColunas) {
    sortableColunas.destroy();
    sortableColunas = null;
  }

  sortableColunas = new Sortable(kanbanEl, {
    animation: 150,
    handle: ".coluna-topo",
    draggable: ".coluna",
    ghostClass: "arrastando", // usa a mesma classe visual
    onEnd: async function () {
      const ordem = Array.from(kanbanEl.children).map((el, idx) => ({
        id: Number(el.dataset.id),
        ordem: idx
      }));

      for (const o of ordem) {
        await sb
          .from("padroes_movimento")
          .update({ ordem: o.ordem })
          .eq("id", o.id);
      }
    }
  });
}
