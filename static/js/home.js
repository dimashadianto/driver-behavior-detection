const $ = id => document.getElementById(id);

// =====================================
// INFORMASI KELAS
// =====================================

const META = {
  fokus: {
    label: "Fokus",
    icon: "🎯",
    color: "#16a34a",
    level: "Aman",
    note: "Pengendara terlihat fokus ke jalan."
  },
  mengantuk: {
    label: "Mengantuk",
    icon: "😴",
    color: "#d97706",
    level: "Waspada",
    note: "Terdeteksi tanda kelelahan. Sebaiknya beristirahat."
  },
  merokok: {
    label: "Merokok",
    icon: "🚬",
    color: "#dc2626",
    level: "Berisiko",
    note: "Pengendara terdeteksi sedang merokok."
  },
  dengan_hp: {
    label: "Dengan HP",
    icon: "📱",
    color: "#7c3aed",
    level: "Berisiko",
    note: "Pengendara terdeteksi memakai ponsel."
  }
};

const meta = k => META[k] || {
  label: String(k).replace(/_/g, " "),
  icon: "🔍",
  color: "#2563eb",
  level: "",
  note: ""
};

// =====================================
// ELEMEN DAN VARIABEL
// =====================================

let berkas = null;
let objectUrl = null;
let previewToken = 0;

const drop = $("drop");
const input = $("file");
const preview = $("preview");
const placeholder = $("ph");
const tombolPrediksi = $("go");
const tombolReset = $("reset");
const hasil = $("hasil");
const hasilGambar = $("hasilGambar");

if (
  !drop ||
  !input ||
  !preview ||
  !placeholder ||
  !tombolPrediksi ||
  !tombolReset ||
  !hasil ||
  !hasilGambar
) {
  console.error(
    "Elemen halaman tidak ditemukan. Periksa kembali ID pada index.html."
  );
} else {

  // =====================================
  // UPLOAD GAMBAR
  // =====================================

  // Klik area upload untuk membuka File Explorer
  drop.addEventListener("click", event => {
    if (event.target.closest("button")) return;
    input.click();
  });

  // Dukungan keyboard
  drop.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });

  input.addEventListener("click", event => {
    event.stopPropagation();
  });

  // Memilih gambar
  input.addEventListener("change", () => {
    if (input.files && input.files.length > 0) {
      pilih(input.files[0]);
    }
  });

  // Drag and drop
  ["dragenter", "dragover"].forEach(eventName => {
    drop.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      drop.classList.add("over");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    drop.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      drop.classList.remove("over");
    });
  });

  drop.addEventListener("drop", event => {
    const file = event.dataTransfer.files[0];

    if (file) {
      pilih(file);
    }
  });

  // =====================================
  // PREVIEW GAMBAR
  // =====================================

  function bersihkanPreview() {
    previewToken++;

    preview.onload = null;
    preview.onerror = null;
    preview.removeAttribute("src");

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function pilih(file) {
    if (!file || !file.type.startsWith("image/")) {
      alert("Silakan pilih file gambar.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert("Ukuran gambar maksimal 15 MB.");
      return;
    }

    bersihkanPreview();

    berkas = file;
    input.value = "";

    const tokenSaatIni = previewToken;

    objectUrl = URL.createObjectURL(file);

    preview.onload = () => {
      if (tokenSaatIni !== previewToken) return;

      preview.style.display = "block";
      placeholder.style.display = "none";
      tombolPrediksi.disabled = false;
    };

    preview.onerror = () => {
      if (tokenSaatIni !== previewToken) return;

      alert("Gambar tidak dapat ditampilkan. Coba pilih gambar lain.");
      resetGambar();
    };

    preview.src = objectUrl;

    hasil.innerHTML =
      '<div class="empty">Gambar siap diprediksi.</div>';

    hasilGambar.innerHTML =
      '<div class="empty">Foto hasil prediksi akan tampil di sini.</div>';
  }

  // =====================================
  // RESET GAMBAR
  // =====================================

  function resetGambar() {
    berkas = null;

    bersihkanPreview();

    input.value = "";

    preview.style.display = "none";
    placeholder.style.display = "block";

    tombolPrediksi.disabled = true;

    hasil.innerHTML =
      '<div class="empty">Hasil prediksi akan tampil di sini.</div>';

    hasilGambar.innerHTML =
      '<div class="empty">Foto hasil prediksi akan tampil di sini.</div>';
  }

  tombolReset.addEventListener("click", event => {
    event.preventDefault();
    resetGambar();
  });

  // =====================================
  // PROSES PREDIKSI
  // =====================================

  tombolPrediksi.addEventListener("click", async () => {
    if (!berkas) {
      alert("Silakan pilih gambar terlebih dahulu.");
      return;
    }

    tombolPrediksi.disabled = true;

    hasil.innerHTML =
      '<div class="empty">Sedang memproses gambar...</div>';

    hasilGambar.innerHTML =
      '<div class="empty">Sedang memproses foto hasil prediksi...</div>';

    const fd = new FormData();
    fd.append("file", berkas);

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        body: fd
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Gagal melakukan prediksi.");
      }

      tampil(data);

    } catch (error) {
      console.error("Kesalahan prediksi:", error);

      hasil.innerHTML =
        `<div class="empty">⚠️ ${error.message}</div>`;

      hasilGambar.innerHTML =
        '<div class="empty">Foto hasil prediksi tidak tersedia.</div>';

    } finally {
      tombolPrediksi.disabled = !berkas;
    }
  });

  // =====================================
  // MENAMPILKAN HASIL PREDIKSI
  // =====================================

  function tampil(d) {
    const m = meta(d.prediksi);
    const top = Number(d.confidence?.[d.prediksi] || 0);

    let html = `
      <div class="top">
        <div class="ring"
          style="background:conic-gradient(${m.color} ${top}%,var(--line) 0)">
          <b>${top.toFixed(1)}%</b>
        </div>

        <div>
          <span class="pill" style="background:${m.color}">
            ${m.level}
          </span>

          <h3>${m.icon} ${m.label}</h3>

          <p class="muted" style="font-size:14px">
            ${m.note}
          </p>
        </div>
      </div>
    `;

    let teks = "";

    // Menampilkan confidence setiap kelas
    for (const [k, v] of Object.entries(d.confidence || {})) {
      const mk = meta(k);
      const nilai = Number(v);

      html += `
        <div class="row">
          <div class="lbl">
            <span>${mk.icon} ${mk.label}</span>
            <span>${nilai.toFixed(2)}%</span>
          </div>

          <div class="bar">
            <span style="width:${nilai}%;background:${mk.color}"></span>
          </div>
        </div>
      `;

      teks += `${mk.label}: ${nilai.toFixed(2)}%\n`;
    }

    teks += `Prediksi: ${m.label}`;

    // Hasil klasifikasi hanya ditampilkan di bagian bawah
    html += `
      <pre>${teks}</pre>

      <div class="actions">
        <button class="btn ghost sm" id="salin">
          📋 Salin teks
        </button>
      </div>
    `;

    hasil.innerHTML = html;

    // =====================================
    // FOTO HASIL ANOTASI
    // Ditampilkan di kotak sebelah kanan
    // =====================================

    const gambar = d.gambar_anotasi;

    let sumberGambar = null;

    if (typeof gambar === "string" && gambar.trim() !== "") {
      sumberGambar = gambar.startsWith("data:image/")
        ? gambar
        : `data:image/jpeg;base64,${gambar}`;
    }

    if (sumberGambar) {
      hasilGambar.innerHTML = `
        <img
          id="gambarAnotasi"
          alt="Foto hasil prediksi"
        />

        <p class="muted" style="font-size:13px;margin-top:10px">
          Jumlah wajah terdeteksi: ${d.jumlah_wajah ?? "Tidak diketahui"}
        </p>
      `;

      const gambarAnotasi = $("gambarAnotasi");

      gambarAnotasi.onerror = () => {
        hasilGambar.innerHTML = `
          <div class="empty">
            Gambar anotasi gagal ditampilkan.
          </div>
        `;
      };

      gambarAnotasi.src = sumberGambar;

    } else {
      hasilGambar.innerHTML = `
        <div class="empty">
          Gambar anotasi tidak diterima dari backend.
        </div>
      `;
    }

    // =====================================
    // TOMBOL SALIN TEKS
    // =====================================

    $("salin").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(teks);
        $("salin").textContent = "Teks Tersalin";

      } catch (error) {
        console.error("Gagal menyalin teks:", error);
      }
    });
  }
}

// =====================================
// EVALUASI MODEL
// =====================================

fetch("/api/metrics")
  .then(response => {
    if (!response.ok) {
      throw new Error("Evaluasi belum tersedia.");
    }

    return response.json();
  })
  .then(m => {
    $("hAcc").textContent =
      (m.akurasi * 100).toFixed(1) + "%";

    const k = m.kelas;

    // Confusion Matrix
    let cm =
      '<table class="cm"><tr><th>Aktual / Prediksi</th>' +
      k.map(x => `<th>${meta(x).label}</th>`).join("") +
      "</tr>";

    m.matriks.forEach((row, i) => {
      const total = row.reduce((a, b) => a + b, 0) || 1;

      cm += `<tr><th>${meta(k[i]).label}</th>`;

      cm += row.map((v, j) =>
        `<td style="background:rgba(${i === j ? "22,163,74" : "220,38,38"},${((v / total) * 0.85).toFixed(2)})">${v}</td>`
      ).join("");

      cm += "</tr>";
    });

    cm += "</table>";

    // Classification Report
    let rep =
      '<table class="rep"><tr><th>Kelas</th><th>Precision</th><th>Recall</th><th>F1-score</th><th>Jumlah</th></tr>';

    k.forEach(n => {
      const r = m.per_kelas[n];

      rep += `
        <tr>
          <td>${meta(n).icon} ${meta(n).label}</td>
          <td>${(r.precision * 100).toFixed(1)}%</td>
          <td>${(r.recall * 100).toFixed(1)}%</td>
          <td>${(r["f1-score"] * 100).toFixed(1)}%</td>
          <td>${r.support}</td>
        </tr>
      `;
    });

    rep += "</table>";

    $("evalBox").innerHTML = `
      <div class="stats">
        <div class="card stat">
          <b>${(m.akurasi * 100).toFixed(2)}%</b>
          <span>Akurasi</span>
        </div>

        <div class="card stat">
          <b>${(m.macro_f1 * 100).toFixed(2)}%</b>
          <span>Macro F1-score</span>
        </div>

        <div class="card stat">
          <b>${m.jumlah_test}</b>
          <span>Gambar data test</span>
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <h3>Confusion Matrix</h3>
          <div class="scroll">${cm}</div>

          <div class="actions">
            <button class="btn ghost sm" id="bukaCm">
              🖼️ Buka sebagai gambar
            </button>
          </div>
        </div>

        <div class="card">
          <h3>Laporan per kelas</h3>
          <div class="scroll">${rep}</div>
        </div>
      </div>
    `;

    $("bukaCm").addEventListener("click", bukaModal);
  })
  .catch(error => {
    console.error(error);

    $("evalBox").innerHTML =
      '<div class="card empty">Evaluasi belum tersedia. Salin <b>laporan.json</b> ke folder <b>model/</b>.</div>';
  });

// =====================================
// CONFUSION MATRIX MODAL
// =====================================

const modal = $("modal");

function bukaModal() {
  const img = $("cmImg");

  $("cmErr").hidden = true;
  img.hidden = false;

  if (!img.getAttribute("src")) {
    img.src = "/api/confusion-matrix";
  }

  modal.showModal();
}

$("cmImg").onerror = () => {
  $("cmImg").hidden = true;
  $("cmErr").hidden = false;
  $("cmImg").removeAttribute("src");
};

$("tutup").addEventListener("click", () => modal.close());

modal.addEventListener("click", event => {
  if (event.target === modal) {
    modal.close();
  }
});

// =====================================
// NAVIGASI
// =====================================

document.querySelectorAll("[data-scroll]").forEach(a => {
  a.addEventListener("click", event => {
    event.preventDefault();

    document.querySelector(a.dataset.scroll)
      ?.scrollIntoView({ behavior: "smooth" });
  });
});
