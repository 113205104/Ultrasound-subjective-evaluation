from pathlib import Path
import json
import re

# 若你先用 GitHub 本地圖片，可用這支。
# 若使用 Google Drive，請手動在 manifest.json 的每張圖片加入 image_url。

ROOT = Path("images")
manifest = []

pattern = re.compile(
    r"^(cut|cyc|fast|p2p|reg)-"
    r"(v7|ph)-"
    r"(carotid|kidney|liver|thyroid)_"
    r"(\d+)\.(png|jpg|jpeg)$",
    re.IGNORECASE
)

if ROOT.exists():
    for strategy_dir in ROOT.iterdir():
        if not strategy_dir.is_dir():
            continue

        for dataset_dir in strategy_dir.iterdir():
            if not dataset_dir.is_dir():
                continue

            for model_dir in dataset_dir.iterdir():
                if not model_dir.is_dir():
                    continue

                images = []
                for img in sorted(model_dir.iterdir()):
                    if not img.is_file():
                        continue

                    m = pattern.match(img.name)
                    if not m:
                        continue

                    images.append({
                        "group": int(m.group(4)),
                        "file": img.name,
                        "machine_group": m.group(2).lower(),
                        "organ": m.group(3).lower()
                    })

                images.sort(key=lambda x: x["group"])

                if images:
                    manifest.append({
                        "strategy": strategy_dir.name,
                        "dataset": dataset_dir.name,
                        "model": model_dir.name,
                        "total_groups": len(images),
                        "images": images
                    })

with open("manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)

print(f"完成，共建立 {len(manifest)} 個任務")
