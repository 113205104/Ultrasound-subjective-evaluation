from pathlib import Path
import json
import re

ROOT = Path("images")

manifest = []

VALID_STRATEGIES = {
    "Unsupervised",
    "supervised",
    "semi-supervised"
}

VALID_DATASETS = {
    "v7-only",
    "all"
}

pattern = re.compile(
    r"^(cut|cyc|fast|p2p|reg)-"
    r"(v7|ph)-"
    r"(carotid|kidney|liver|thyroid)_"
    r"(\d+)\.(png|jpg|jpeg)$",
    re.IGNORECASE
)

for strategy_dir in ROOT.iterdir():

    if not strategy_dir.is_dir():
        continue

    strategy = strategy_dir.name

    for dataset_dir in strategy_dir.iterdir():

        if not dataset_dir.is_dir():
            continue

        dataset = dataset_dir.name

        for model_dir in dataset_dir.iterdir():

            if not model_dir.is_dir():
                continue

            model = model_dir.name

            images = []

            for img in sorted(model_dir.iterdir()):

                if not img.is_file():
                    continue

                m = pattern.match(img.name)

                if not m:
                    continue

                model_name = m.group(1)
                machine_group = m.group(2)
                organ = m.group(3)
                group_no = int(m.group(4))

                images.append({
                    "group": group_no,
                    "file": img.name,
                    "machine_group": machine_group,
                    "organ": organ
                })

            images.sort(key=lambda x: x["group"])

            if images:

                manifest.append({
                    "strategy": strategy,
                    "dataset": dataset,
                    "model": model,
                    "total_groups": len(images),
                    "images": images
                })

with open("manifest.json", "w", encoding="utf-8") as f:
    json.dump(
        manifest,
        f,
        ensure_ascii=False,
        indent=2
    )

print(f"完成，共建立 {len(manifest)} 個任務")
