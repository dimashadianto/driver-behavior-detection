import random, shutil
from pathlib import Path
from PIL import Image, ImageOps

try:
    import pillow_heif; pillow_heif.register_heif_opener()
except ImportError:
    pass

SRC = Path("data-mentah")
DST = Path("dataset")
SPLIT = {"train": 0.7, "val": 0.15, "test": 0.15}
random.seed(42)

if DST.exists():
    shutil.rmtree(DST)

for folder in SRC.iterdir():
    if not folder.is_dir():
        continue
    kelas = folder.name.strip().lower().replace(" ", "_")
    files = [f for f in folder.rglob("*") if f.is_file()]
    random.shuffle(files)

    n = len(files)
    batas = {
        "train": int(n * SPLIT["train"]),
        "val": int(n * (SPLIT["train"] + SPLIT["val"])),
    }
    for i, f in enumerate(files):
        split = "train" if i < batas["train"] else "val" if i < batas["val"] else "test"
        out_dir = DST / split / kelas
        out_dir.mkdir(parents=True, exist_ok=True)
        try:
            img = Image.open(f)
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.save(out_dir / f"{kelas}_{i:05d}.jpg", quality=95)
        except Exception as e:
            print("Lewati file rusak:", f, e)
    print(f"{kelas}: {n} gambar")