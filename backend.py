import io
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from ultralytics import YOLO

try:
    import pillow_heif; pillow_heif.register_heif_opener()
except ImportError:
    pass

app = FastAPI(title="Deteksi Ekspresi Pengendara")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

model = YOLO("best.pt")

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    try:
        img = Image.open(io.BytesIO(await file.read()))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise HTTPException(400, "File bukan gambar yang valid")

    hasil = model(img, verbose=False)[0]
    probs = hasil.probs.data.tolist()
    skor = {model.names[i]: round(p * 100, 2) for i, p in enumerate(probs)}
    skor = dict(sorted(skor.items(), key=lambda x: x[1], reverse=True))
    return {"prediksi": next(iter(skor)), "confidence": skor}

@app.get("/confusion-matrix")
def confusion_matrix_img():
    return FileResponse("confusion_matrix.png", media_type="image/png")