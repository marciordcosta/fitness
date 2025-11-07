let data1 = localStorage.getItem("comp_data1");
let data2 = localStorage.getItem("comp_data2");

let fotos1 = [];
let fotos2 = [];

let selecionada1 = null;
let selecionada2 = null;

let fotoParaExcluir = null;

window.addEventListener("load", () => {
  carregarFotos();
});

/* ==================== CARREGAR FOTOS ==================== */
async function carregarFotos() {
  const { data } = await supabase
    .from("fotos")
    .select("id, data_foto, url");

  fotos1 = data.filter(x => x.data_foto.startsWith(data1));
  fotos2 = data.filter(x => x.data_foto.startsWith(data2));

  mostrarColuna("coluna1", fotos1, 1);
  mostrarColuna("coluna2", fotos2, 2);
}

function mostrarColuna(elemento, lista, lado) {
  const el = document.getElementById(elemento);
  el.innerHTML = "";

  lista.forEach(f => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = f.url;
    img.className = "foto-item";

    img.onclick = () => selecionarFoto(f, lado, img);

    const btn = document.createElement("button");
    btn.className = "btn-mini btn-danger";
    btn.innerText = "Excluir";
    btn.style.position = "absolute";
    btn.style.top = "6px";
    btn.style.right = "6px";

    btn.onclick = (e) => {
      e.stopPropagation();
      abrirModalExcluir(f);
    };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    el.appendChild(wrap);
  });
}

/* ==================== SELECIONAR ==================== */
function selecionarFoto(foto, lado, el) {
  if (lado === 1) {
    selecionada1 = foto;
    document.querySelectorAll("#coluna1 .foto-item")
      .forEach(i => i.classList.remove("selecionada"));
  } else {
    selecionada2 = foto;
    document.querySelectorAll("#coluna2 .foto-item")
      .forEach(i => i.classList.remove("selecionada"));
  }

  el.classList.add("selecionada");

  document.getElementById("btnComparar").disabled = !(selecionada1 && selecionada2);
}

/* ==================== EXCLUIR FOTO ==================== */
function abrirModalExcluir(foto) {
  fotoParaExcluir = foto;
  document.getElementById("modalExcluirFoto").setAttribute("aria-hidden","false");
}

function fecharModalExcluir() {
  fotoParaExcluir = null;
  document.getElementById("modalExcluirFoto").setAttribute("aria-hidden","true");
}

async function confirmarExclusaoFoto() {
  const caminho = fotoParaExcluir.url.split("/").pop();

  await supabase.storage.from("fotos").remove([caminho]);
  await supabase.from("fotos").delete().eq("id", fotoParaExcluir.id);

  fecharModalExcluir();
  carregarFotos();
}

/* ==================== TELA FINAL ==================== */
function mostrarComparacaoFinal() {
  const nova = window.open("", "_blank");

  nova.document.write(`
    <html>
    <head>
    <title>Comparação</title>
    <style>
      body { margin:0; padding:20px; background:#f5f5f7; text-align:center; font-family:-apple-system; }
      .wrap { display:flex; gap:10px; }
      img { width:50%; border-radius:12px; }
      @media(max-width:700px){
        .wrap { flex-direction:column; }
        img { width:100%; }
      }
    </style>
    </head>
    <body>
      <h2>Comparação</h2>
      <div class="wrap">
        <img src="${selecionada1.url}">
        <img src="${selecionada2.url}">
      </div>
      <button onclick="window.close()" style="margin-top:20px;">Voltar</button>
    </body>
    </html>
  `);
}
