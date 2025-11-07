let data1 = localStorage.getItem("comp_data1");
let data2 = localStorage.getItem("comp_data2");

let fotos1 = [];
let fotos2 = [];

let selecionada1 = null;
let selecionada2 = null;

window.addEventListener("load", () => {
  document.getElementById("datasEscolhidas").innerHTML =
    `<strong>${data1}</strong> x <strong>${data2}</strong>`;

  carregarFotos();
});

/* ==================== CARREGAR FOTOS ==================== */
async function carregarFotos() {
  const { data, error } = await supabase
    .from("fotos")
    .select("id, data_foto, url");

  if (error) {
    alert("Erro ao carregar fotos.");
    return;
  }

  fotos1 = data.filter(x => x.data_foto === data1);
  fotos2 = data.filter(x => x.data_foto === data2);

  mostrarColuna("coluna1", fotos1, 1);
  mostrarColuna("coluna2", fotos2, 2);
}

function mostrarColuna(elemento, lista, lado) {
  const el = document.getElementById(elemento);
  el.innerHTML = "";

  lista.forEach(f => {
    const img = document.createElement("img");
    img.src = f.url;
    img.className = "foto-item";

    img.onclick = () => selecionarFoto(f, lado, img);

    el.appendChild(img);
  });
}

/* ==================== SELECIONAR FOTO ==================== */
function selecionarFoto(foto, lado, elemento) {
  if (lado === 1) {
    selecionada1 = foto;
    document.querySelectorAll("#coluna1 .foto-item")
      .forEach(i => i.classList.remove("selecionada"));
  } else {
    selecionada2 = foto;
    document.querySelectorAll("#coluna2 .foto-item")
      .forEach(i => i.classList.remove("selecionada"));
  }

  elemento.classList.add("selecionada");

  document.getElementById("btnComparar").disabled = !(selecionada1 && selecionada2);
}

/* ==================== VOLTAR ==================== */
function voltarSelecao() {
  window.history.back();
}

/* ==================== TELA FINAL ==================== */
function mostrarComparacaoFinal() {
  const novaJanela = window.open("", "_blank");

  novaJanela.document.write(`
    <html>
    <head>
    <title>Comparação</title>
    <style>
      body { font-family: -apple-system; margin: 0; padding: 0; text-align:center; background:#f5f5f7;}
      .wrap { display:flex; gap:10px; padding:10px; }
      img { width: 50%; border-radius:12px; }
      @media(max-width:700px){
        .wrap { flex-direction:column; }
        img { width: 100%; }
      }
      button {
        margin-top:20px;
        padding:12px 20px;
        background:#007aff;
        border:none;
        color:white;
        border-radius:10px;
        font-size:16px;
      }
    </style>
    </head>
    <body>
      <h2>Comparação</h2>
      <div class="wrap">
        <img src="${selecionada1.url}">
        <img src="${selecionada2.url}">
      </div>
      <button onclick="window.close()">Voltar</button>
    </body>
    </html>
  `);
}
