let grafico;
let dadosPesos = [];
let periodoAtual = 7;
let idEditar = null;

/* ===================== UTIL ===================== */
function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().substring(0, 10);
}

function toISODate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

/* ===================== MODAIS ===================== */
function fecharModals() {
  document.querySelectorAll(".modal").forEach(m => m.setAttribute("aria-hidden", "true"));
}

function abrirAddPeso() {
  fecharModals();
  document.getElementById("dataNovoPeso").value = hojeISO();
  document.getElementById("valorNovoPeso").value = "";
  document.getElementById("modalPeso").setAttribute("aria-hidden", "false");
}

function abrirFotoComDataDe(idInputData) {
  const v = document.getElementById(idInputData).value || hojeISO();
  fecharModals();
  document.getElementById("dataFoto").value = v;
  document.getElementById("modalFoto").setAttribute("aria-hidden", "false");
}

function abrirPeriodo() {
  fecharModals();
  document.getElementById("modalPeriodo").setAttribute("aria-hidden", "false");
}

/* ===================== LOAD ===================== */
window.addEventListener("load", () => {
  carregarPesos(true);
});

/* ===================== SALVAR PESO ===================== */
async function salvarPesoNovo() {
  const data = document.getElementById("dataNovoPeso").value;
  const peso = parseFloat(document.getElementById("valorNovoPeso").value);

  if (!data || isNaN(peso)) return alert("Preencha todos os campos.");

  await supabase.from("pesos").insert({ data, peso });

  fecharModals();
  carregarPesos(true);
}

/* ===================== SALVAR FOTO ===================== */
async function salvarFoto() {
  const data = document.getElementById("dataFoto").value;
  const files = document.getElementById("arquivoFoto").files;

  if (!data || !files.length) return alert("Selecione foto(s).");

  for (let file of files) {
    const nome = `${Date.now()}-${file.name}`;

    const { error: upErr } = await supabase.storage.from("fotos").upload(nome, file);
    if (upErr) {
      console.error(upErr);
      alert("Erro ao enviar imagem.");
      continue;
    }

    const { data: pub } = supabase.storage.from("fotos").getPublicUrl(nome);
    await supabase.from("fotos").insert({ data_foto: data, url: pub.publicUrl });
  }

  fecharModals();
}

/* ===================== CARREGAR PESOS ===================== */
async function carregarPesos(filtrar = false) {
  const { data, error } = await supabase
    .from("pesos")
    .select("id, data, peso")
    .order("data", { ascending: false });   // Histórico em ORDEM DECRESCENTE (mantido)

  if (error) return console.error(error);

  dadosPesos = data || [];

  if (filtrar) aplicarPeriodo();
  else {
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
  }

  calcularMedias();
}

function aplicarPeriodo() {
  const hoje = new Date();
  const limite = new Date(hoje.getTime() - periodoAtual * 86400000);

  const filtrado = dadosPesos.filter(p => new Date(p.data) >= limite);

  montarGrafico(filtrado);      // gráfico em ordem CRESCENTE (ajustado dentro da função)
  renderHistorico(filtrado);    // histórico permanece na ordem recebida (decrescente)
}

function filtroPeriodo(dias) {
  periodoAtual = Number(dias);
  fecharModals();
  aplicarPeriodo();
}

/* ===================== HISTÓRICO ===================== */
function renderHistorico(lista) {
  const el = document.getElementById("listaPesos");
  if (!lista.length) return el.innerHTML = "Nenhum registro.";

  el.innerHTML = "";

  lista.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="item-title">${item.peso.toFixed(1)} kg</div>
        <div class="item-sub">${item.data}</div>
      </div>

      <button class="btn-mini" style="border:1px solid #e5e5ea;background:#f7f7f7"
        onclick="abrirEditarDireto(${item.id})">Opções</button>
    `;

    el.appendChild(div);
  });
}

/* ===================== EDITAR PESO ===================== */
async function abrirEditarDireto(id) {
  const achou = dadosPesos.find(p => p.id === id);
  if (!achou) return;

  idEditar = id;
  document.getElementById("dataEditar").value = achou.data;
  document.getElementById("pesoEditar").value = achou.peso;

  document.getElementById("modalEditar").setAttribute("aria-hidden", "false");
}

async function salvarEdicao() {
  const data = document.getElementById("dataEditar").value;
  const peso = parseFloat(document.getElementById("pesoEditar").value);

  await supabase.from("pesos").update({ data, peso }).eq("id", idEditar);

  fecharModals();
  carregarPesos(true);
}

async function excluirPeso() {
  await supabase.from("pesos").delete().eq("id", idEditar);
  fecharModals();
  carregarPesos(true);
}

/* ===================== GRÁFICO ===================== */
function montarGrafico(lista) {
  // Garantir ordem CRESCENTE SOMENTE no gráfico
  const asc = [...lista].sort((a, b) => new Date(a.data) - new Date(b.data));

  const labels = asc.map(x => x.data);
  const pesos = asc.map(x => x.peso);

  if (grafico) grafico.destroy();

  grafico = new Chart(document.getElementById("graficoPeso"), {
    type: "line",
    data: {
      labels,
      datasets: [{ data: pesos, borderWidth: 3, tension: 0.25 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
      // (não oculto os rótulos do eixo X, conforme seu pedido atual)
    }
  });
}

/* ===================== MÉDIAS (semana TER→SEG) ===================== */
/*
  Definição:
  - Semana começa na TERÇA (2) e termina na SEGUNDA (1).
  - Média da semana atual: período [terça atual 00:00 ... segunda seguinte 23:59].
  - Semana anterior: 7 dias imediatamente anteriores.
  - Progressão (%) = ((média_atual - média_anterior) / média_anterior) * 100.
*/
function calcularMedias() {
  if (!dadosPesos.length) {
    document.getElementById("mediaSemanalValor").innerText = "--";
    document.getElementById("mediaProgressoValor").innerText = "--";
    return;
  }

  const hoje = new Date();
  hoje.setHours(0,0,0,0);

  // Encontrar a terça-feira da semana atual (getDay: 0=Dom,1=Seg,2=Ter,...)
  const day = hoje.getDay();                  // 0..6
  const deltaAteTerca = ( (day - 2 + 7) % 7 );// dias desde a terça mais recente
  const tercaAtual = new Date(hoje);
  tercaAtual.setDate(tercaAtual.getDate() - deltaAteTerca);
  tercaAtual.setHours(0,0,0,0);

  const segundaAtual = new Date(tercaAtual);
  segundaAtual.setDate(segundaAtual.getDate() + 6);
  segundaAtual.setHours(23,59,59,999);

  const tercaAnterior = new Date(tercaAtual);
  tercaAnterior.setDate(tercaAnterior.getDate() - 7);
  tercaAnterior.setHours(0,0,0,0);

  const segundaAnterior = new Date(tercaAtual);
  segundaAnterior.setDate(segundaAnterior.getDate() - 1);
  segundaAnterior.setHours(23,59,59,999);

  // Mapa de último peso por dia (YYYY-MM-DD) dentro de um período
  function ultimoPesoPorDiaNoPeriodo(inicio, fim) {
    const map = new Map(); // dateISO -> peso
    // dadosPesos está em ordem decrescente; o primeiro visto no dia será o último do dia
    for (const p of dadosPesos) {
      const d = new Date(p.data);
      if (d < inicio || d > fim) continue;
      const iso = toISODate(d);
      if (!map.has(iso)) map.set(iso, p.peso); // mantém o 1º encontrado (último do dia)
    }
    return map;
  }

  function mediaSemana(inicio, fim) {
    const porDia = ultimoPesoPorDiaNoPeriodo(inicio, fim);
    let soma = 0;
    let cont = 0;

    // percorre exatamente os 7 dias (TER, QUA, QUI, SEX, SAB, DOM, SEG)
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      d.setHours(0,0,0,0);
      const iso = toISODate(d);
      if (porDia.has(iso)) {
        soma += porDia.get(iso);
        cont += 1;
      }
    }

    if (cont === 0) return null;
    return soma / cont; // média dos dias em que houve registro
  }

  const mediaAtual = mediaSemana(tercaAtual, segundaAtual);
  const mediaAnterior = mediaSemana(tercaAnterior, segundaAnterior);

  document.getElementById("mediaSemanalValor").innerText =
    mediaAtual != null ? mediaAtual.toFixed(1) + " kg" : "--";

  if (mediaAtual == null || mediaAnterior == null || mediaAnterior === 0) {
    document.getElementById("mediaProgressoValor").innerText = "--";
  } else {
    const variacao = ((mediaAtual - mediaAnterior) / mediaAnterior) * 100;
    document.getElementById("mediaProgressoValor").innerText = variacao.toFixed(1) + "%";
  }
}
