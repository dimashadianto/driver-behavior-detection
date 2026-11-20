import io
import json
import os
import threading
import webbrowser
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from ultralytics import YOLO

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    pass

BASE = Path(__file__).parent

HASIL = Path(os.getenv("HASIL_DIR", BASE / "model"))
MAKS_MB = 15
HOST, PORT = "127.0.0.1", 8000

if not (HASIL / "best.pt").exists():
    raise SystemExit(
        f"best.pt tidak ditemukan di: {HASIL}\n"
        "Salin best.pt, laporan.json, dan confusion_matrix.png dari folder 'hasil' di Drive ke folder tersebut."
    )

IMGSZ = 320
if (HASIL / "laporan.json").exists():
    IMGSZ = json.loads((HASIL / "laporan.json").read_text(encoding="utf-8")).get(
        "imgsz", IMGSZ
    )

model = YOLO(str(HASIL / "best.pt"))
app = FastAPI(title="DriverWatch")

app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

@app.get("/")
def beranda():
    return FileResponse(BASE / "static" / "index.html")

@app.get("/tentang")
def tentang():
    return FileResponse(BASE / "static" / "tentang.html")

@app.post("/api/predict")
def predict(file: UploadFile = File(...)):
    data = file.file.read()
    if len(data) > MAKS_MB * 1024 * 1024:
        raise HTTPException(413, f"Ukuran file maksimal {MAKS_MB} MB")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((1280, 1280))
    except Exception:
        raise HTTPException(400, "File bukan gambar yang valid")

    probs = model(img, imgsz=IMGSZ, verbose=False)[0].probs.data.tolist()
    skor = {model.names[i]: round(p * 100, 2) for i, p in enumerate(probs)}
    skor = dict(sorted(skor.items(), key=lambda x: -x[1]))
    return {"prediksi": next(iter(skor)), "confidence": skor}

@app.get("/api/metrics")
def metrics():
    p = HASIL / "laporan.json"
    if not p.exists():
        raise HTTPException(404, "laporan.json belum ada")
    return json.loads(p.read_text(encoding="utf-8"))

@app.get("/api/confusion-matrix")
def confusion_matrix_img():
    p = HASIL / "confusion_matrix.png"
    if not p.exists():
        raise HTTPException(404, "confusion_matrix.png belum ada")
    return FileResponse(p, media_type="image/png")

if __name__ == "__main__":
    threading.Timer(2.0, lambda: webbrowser.open(f"http://{HOST}:{PORT}")).start()
    uvicorn.run(app, host=HOST, port=PORT)
