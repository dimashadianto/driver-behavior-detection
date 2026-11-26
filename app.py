import base64
import io
import json
import logging
import threading
import webbrowser
from pathlib import Path

import numpy as np
import mediapipe as mp
import uvicorn

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from PIL import Image, ImageDraw, ImageFont, ImageOps
from ultralytics import YOLO

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass


# ==================================================
# KONFIGURASI
# ==================================================

HOST, PORT = "127.0.0.1", 8000

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "model" / "best.pt"
FACE_MODEL_PATH = BASE_DIR / "model" / "blaze_face_short_range.tflite"

REPORT_PATH = BASE_DIR / "model" / "laporan.json"
CONFUSION_MATRIX_PATH = BASE_DIR / "model" / "confusion_matrix.png"

STATIC_DIR = BASE_DIR / "static"

MAX_FILE_SIZE = 15 * 1024 * 1024
MIN_FACE_CONFIDENCE = 0.35

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==================================================
# INISIALISASI FASTAPI
# ==================================================

app = FastAPI(
    title="DriverWatch API",
    description="API klasifikasi perilaku pengemudi",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ==================================================
# MEMUAT MODEL YOLO
# ==================================================

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Model YOLO tidak ditemukan: {MODEL_PATH}"
    )

model = YOLO(str(MODEL_PATH))

logger.info("Model YOLO berhasil dimuat: %s", MODEL_PATH)


# ==================================================
# INISIALISASI MEDIAPIPE FACE DETECTOR
# ==================================================

if not FACE_MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Model MediaPipe tidak ditemukan: {FACE_MODEL_PATH}"
    )

face_options = mp.tasks.vision.FaceDetectorOptions(
    base_options=mp.tasks.BaseOptions(
        model_asset_path=str(FACE_MODEL_PATH)
    ),
    running_mode=mp.tasks.vision.RunningMode.IMAGE,
    min_detection_confidence=MIN_FACE_CONFIDENCE
)

face_detector = mp.tasks.vision.FaceDetector.create_from_options(
    face_options
)

face_detector_lock = threading.Lock()

logger.info("MediaPipe Face Detector berhasil dimuat.")


# ==================================================
# FUNGSI DETEKSI SATU WAJAH
# ==================================================

def deteksi_wajah(image):
    """
    Mendeteksi wajah menggunakan MediaPipe Face Detector.

    Hanya mengambil satu wajah dengan area terbesar.
    Mengembalikan koordinat:
    (x, y, width, height).

    Jika tidak ditemukan, mengembalikan None.
    """

    try:
        image_array = np.ascontiguousarray(
            np.asarray(image.convert("RGB"))
        )

        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=image_array
        )

        with face_detector_lock:
            result = face_detector.detect(mp_image)

        if not result.detections:
            logger.info("Tidak ada wajah yang terdeteksi.")
            return None

        kandidat_wajah = []

        tinggi, lebar = image_array.shape[:2]

        for detection in result.detections:

            if not detection.categories:
                continue

            confidence = float(
                detection.categories[0].score
            )

            if confidence < MIN_FACE_CONFIDENCE:
                continue

            bbox = detection.bounding_box

            x = int(bbox.origin_x)
            y = int(bbox.origin_y)
            w = int(bbox.width)
            h = int(bbox.height)

            # Membatasi koordinat agar tidak keluar gambar
            x1 = max(0, x)
            y1 = max(0, y)
            x2 = min(lebar, x + w)
            y2 = min(tinggi, y + h)

            w_baru = x2 - x1
            h_baru = y2 - y1

            if w_baru <= 0 or h_baru <= 0:
                continue

            luas = w_baru * h_baru

            kandidat_wajah.append({
                "box": (
                    x1,
                    y1,
                    w_baru,
                    h_baru
                ),
                "confidence": confidence,
                "area": luas
            })

        if not kandidat_wajah:
            logger.info("Tidak ada wajah valid yang ditemukan.")
            return None

        # Memilih satu wajah dengan area terbesar
        wajah_terpilih = max(
            kandidat_wajah,
            key=lambda item: item["area"]
        )

        logger.info(
            "Satu wajah terpilih dengan confidence %.2f%%",
            wajah_terpilih["confidence"] * 100
        )

        return wajah_terpilih["box"]

    except Exception as e:
        logger.exception("Gagal mendeteksi wajah: %s", e)
        return None


# ==================================================
# FORMAT LABEL PREDIKSI
# ==================================================

def format_label(prediksi):

    label = str(prediksi).strip().replace("_", " ")

    return label.upper()


# ==================================================
# MEMBUAT GAMBAR ANOTASI
# ==================================================

def buat_gambar_anotasi(image, prediksi, confidence):
    """
    Menggambar satu bounding box pada wajah pengemudi.

    Label prediksi ditempatkan di pojok kiri atas
    bounding box.

    Tidak menggambar kotak jika wajah tidak ditemukan.
    """

    hasil_image = image.copy().convert("RGB")
    draw = ImageDraw.Draw(hasil_image)

    lebar, tinggi = hasil_image.size

    wajah = deteksi_wajah(hasil_image)

    # Ukuran garis menyesuaikan resolusi gambar
    ketebalan = max(
        2,
        int(min(lebar, tinggi) * 0.006)
    )

    ukuran_font = max(
        14,
        int(min(lebar, tinggi) * 0.035)
    )

    try:
        font = ImageFont.truetype(
            "arial.ttf",
            ukuran_font
        )
    except OSError:
        font = ImageFont.load_default()

    if wajah is not None:

        x, y, w, h = wajah

        x1 = x
        y1 = y
        x2 = x + w
        y2 = y + h

        # Bounding box wajah berwarna merah
        draw.rectangle(
            [x1, y1, x2, y2],
            outline=(255, 0, 0),
            width=ketebalan
        )

        # Label hasil prediksi
        label = format_label(prediksi)

        bbox_teks = draw.textbbox(
            (0, 0),
            label,
            font=font
        )

        teks_width = bbox_teks[2] - bbox_teks[0]
        teks_height = bbox_teks[3] - bbox_teks[1]

        padding = max(4, int(ukuran_font * 0.25))

        label_width = teks_width + padding * 2
        label_height = teks_height + padding * 2

        # Label diletakkan di atas sisi kiri bounding box.
        # Jika terlalu dekat dengan tepi atas, letakkan di dalam kotak.
        label_y = y1 - label_height

        if label_y < 0:
            label_y = y1

        label_x = x1

        # Mencegah label keluar dari gambar
        label_x = min(
            label_x,
            max(0, lebar - label_width)
        )

        draw.rectangle(
            [
                label_x,
                label_y,
                label_x + label_width,
                label_y + label_height
            ],
            fill=(255, 0, 0)
        )

        draw.text(
            (
                label_x + padding,
                label_y + padding
            ),
            label,
            fill=(255, 255, 255),
            font=font
        )

    # Jika wajah tidak ditemukan, foto tetap dikembalikan
    # tanpa bounding box palsu.

    buffer = io.BytesIO()

    hasil_image.save(
        buffer,
        format="JPEG",
        quality=90
    )

    gambar_base64 = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    jumlah_wajah = 1 if wajah is not None else 0

    return gambar_base64, jumlah_wajah


# ==================================================
# MEMBACA LAPORAN MODEL
# ==================================================

def baca_laporan():

    if not REPORT_PATH.exists():
        return {
            "tersedia": False,
            "pesan": "File laporan.json belum tersedia."
        }

    try:
        with open(
            REPORT_PATH,
            "r",
            encoding="utf-8"
        ) as file:
            return json.load(file)

    except (json.JSONDecodeError, OSError) as e:

        logger.error(
            "Gagal membaca laporan: %s",
            e
        )

        return {
            "tersedia": False,
            "pesan": "Laporan tidak dapat dibaca."
        }


# ==================================================
# ENDPOINT HEALTH CHECK
# ==================================================

@app.get("/api/health")
def health_check():

    return {
        "status": "berjalan",
        "model": MODEL_PATH.exists(),
        "nama_model": "DriverWatch YOLO Classification",
        "deteksi_wajah": FACE_MODEL_PATH.exists(),
        "face_detector": "MediaPipe Tasks"
    }


# ==================================================
# ENDPOINT PREDIKSI
# ==================================================

@app.post("/api/predict")
@app.post("/predict")
async def predict(file: UploadFile = File(...)):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Nama file tidak valid."
        )

    if (
        file.content_type
        and not file.content_type.startswith("image/")
    ):
        raise HTTPException(
            status_code=400,
            detail="File yang diunggah harus berupa gambar."
        )

    try:
        file_bytes = await file.read()

        if not file_bytes:
            raise HTTPException(
                status_code=400,
                detail="File gambar kosong."
            )

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Ukuran gambar maksimal 15 MB."
            )

        image = Image.open(
            io.BytesIO(file_bytes)
        )

        image = ImageOps.exif_transpose(
            image
        ).convert("RGB")

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="File bukan gambar yang valid."
        )

    try:
        # Klasifikasi menggunakan YOLOv8 Classification
        hasil = model(
            image,
            verbose=False
        )[0]

        if hasil.probs is None:
            raise RuntimeError(
                "Model tidak menghasilkan probabilitas klasifikasi."
            )

        probabilities = hasil.probs.data.tolist()

        confidence_scores = {
            model.names[i]: round(float(score) * 100, 2)
            for i, score in enumerate(probabilities)
        }

        confidence_scores = dict(
            sorted(
                confidence_scores.items(),
                key=lambda item: item[1],
                reverse=True
            )
        )

        prediksi = next(iter(confidence_scores))

        confidence_tertinggi = confidence_scores[prediksi]

        gambar_anotasi, jumlah_wajah = buat_gambar_anotasi(
            image,
            prediksi,
            confidence_tertinggi
        )

        return {
            "prediksi": prediksi,
            "confidence": confidence_scores,
            "gambar_anotasi": gambar_anotasi,
            "jumlah_wajah": jumlah_wajah
        }

    except Exception as e:

        logger.exception(
            "Proses prediksi gagal"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Gagal memproses gambar: {str(e)}"
        )


# ==================================================
# ENDPOINT METRICS
# ==================================================

@app.get("/api/metrics")
def get_metrics():
    return baca_laporan()


# ==================================================
# ENDPOINT CONFUSION MATRIX
# ==================================================

@app.get("/api/confusion-matrix")
@app.get("/confusion-matrix")
def get_confusion_matrix():

    if not CONFUSION_MATRIX_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="File confusion_matrix.png tidak ditemukan."
        )

    return FileResponse(
        str(CONFUSION_MATRIX_PATH),
        media_type="image/png",
        filename="confusion_matrix.png"
    )


# ==================================================
# HALAMAN FRONTEND
# ==================================================

if STATIC_DIR.exists():

    app.mount(
        "/static",
        StaticFiles(directory=str(STATIC_DIR)),
        name="static"
    )


@app.get("/")
def home():

    index_path = STATIC_DIR / "index.html"

    if not index_path.exists():
        return {
            "message": "DriverWatch API berjalan.",
            "docs": "/docs"
        }

    return FileResponse(str(index_path))


@app.get("/tentang")
def tentang():

    tentang_path = STATIC_DIR / "tentang.html"

    if not tentang_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Halaman tentang tidak ditemukan."
        )

    return FileResponse(str(tentang_path))


# ==================================================
# MENJALANKAN SERVER
# ==================================================

if __name__ == "__main__":

    threading.Timer(
        2.0,
        lambda: webbrowser.open(
            f"http://{HOST}:{PORT}"
        )
    ).start()

    uvicorn.run(
        app,
        host=HOST,
        port=PORT
    )
