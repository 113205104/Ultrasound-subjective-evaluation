from pathlib import Path
import argparse
import csv
import json
import re

MODEL_ORDER = ["cut", "cyc", "fast", "p2p", "reg"]
VALID_STRATEGIES = {"unsupervised": "Unsupervised", "supervised": "Supervised", "semi-supervised": "Semi-supervised"}
PATTERN = re.compile(
    r"^(cut|cyc|fast|p2p|reg)-"
    r"([a-zA-Z0-9]+)-"
    r"(carotid|kidney|liver|thyroid)_"
    r"(\d+)\.(png|jpg|jpeg|webp)$",
    re.IGNORECASE,
)

def load_url_map(path: Path):
    if not path or not path.exists():
        return {}
    out = {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            file_name = (row.get("file") or row.get("filename") or "").strip()
            image_url = (row.get("image_url") or row.get("url") or "").strip()
            if file_name and image_url:
                out[file_name] = image_url
    return out

def canonical_strategy(name: str) -> str:
    return VALID_STRATEGIES.get(name.lower(), name)

def main():
    parser = argparse.ArgumentParser(description="Build manifest.json for Ultrasound Subjective Evaluation.")
    parser.add_argument("--root", default="images", help="圖片根目錄，預設 images")
    parser.add_argument("--out", default="manifest.json", help="輸出 manifest.json 路徑")
    parser.add_argument("--url-csv", default="image_urls.csv", help="可選：file,image_url 對照 CSV")
    args = parser.parse_args()

    root = Path(args.root)
    url_map = load_url_map(Path(args.url_csv))
    manifest = []
    skipped = []

    if not root.exists():
        print(f"找不到圖片根目錄：{root.resolve()}")
    else:
        for strategy_dir in sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
            for dataset_dir in sorted([p for p in strategy_dir.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
                model_dirs = sorted([p for p in dataset_dir.iterdir() if p.is_dir()], key=lambda p: MODEL_ORDER.index(p.name.lower()) if p.name.lower() in MODEL_ORDER else 999)
                for model_dir in model_dirs:
                    images = []
                    for img in sorted([p for p in model_dir.iterdir() if p.is_file()], key=lambda p: p.name.lower()):
                        match = PATTERN.match(img.name)
                        if not match:
                            skipped.append(str(img))
                            continue
                        model, machine_group, organ, group, _ext = match.groups()
                        item = {
                            "group": int(group),
                            "file": img.name,
                            "machine_group": machine_group.lower(),
                            "organ": organ.lower(),
                        }
                        if img.name in url_map:
                            item["image_url"] = url_map[img.name]
                        images.append(item)

                    images.sort(key=lambda x: (x["group"], x["file"]))
                    if images:
                        manifest.append({
                            "strategy": canonical_strategy(strategy_dir.name),
                            "dataset": dataset_dir.name,
                            "model": model_dir.name.lower(),
                            "total_groups": len(images),
                            "images": images,
                        })

    Path(args.out).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成，共建立 {len(manifest)} 個任務，輸出：{Path(args.out).resolve()}")
    if skipped:
        Path("manifest_skipped_files.txt").write_text("\n".join(skipped), encoding="utf-8")
        print(f"略過 {len(skipped)} 個不符合檔名規則的檔案，詳見 manifest_skipped_files.txt")

if __name__ == "__main__":
    main()
