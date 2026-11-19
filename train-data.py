import shutil
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix, classification_report
from ultralytics import YOLO

model = YOLO("yolov8n-cls.pt")
model.train(data="dataset", epochs=30, imgsz=224, batch=32, patience=10)
shutil.copy(model.trainer.best, "best.pt")

model = YOLO("best.pt")
class_names = [model.names[i] for i in range(len(model.names))]
nama_ke_idx = {n: i for i, n in enumerate(class_names)}

y_true, y_pred = [], []
for kelas_dir in sorted(Path("dataset/test").iterdir()):
    for img in kelas_dir.glob("*.jpg"):
        hasil = model(str(img), verbose=False)[0]
        y_true.append(nama_ke_idx[kelas_dir.name])
        y_pred.append(int(hasil.probs.top1))

cm = confusion_matrix(y_true, y_pred, labels=range(len(class_names)))
plt.figure(figsize=(7, 6))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=class_names, yticklabels=class_names)
plt.xlabel("Prediksi"); plt.ylabel("Aktual"); plt.title("Confusion Matrix (Data Test)")
plt.tight_layout()
plt.savefig("confusion_matrix.png", dpi=150)

print(classification_report(y_true, y_pred, target_names=class_names, digits=4))