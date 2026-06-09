#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build manifest.json for Ultrasound Subjective Evaluation.

The official images are stored in Google Drive, not in GitHub. This script is
intended to scan a local Google Drive for desktop synced folder or a downloaded
mirror of the Google Drive folder structure.

Expected structure:
UltrasoundImages/<strategy>/<dataset>/<model>/*.png

Filename rule:
<model>-<machine_or_group>-<organ>_<number>.png
Examples:
cut-v7-carotid_001.png
cyc-v7-thyroid_021.png
fast-v7-kidney_031.png
p2p-v7-liver_050.png
reg-ph-carotid_104.png
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional

ALLOWED_MODELS = ["cut", "cyc", "fast", "p2p", "reg"]
MODEL_DISPLAY = {"cut": "Model A", "cyc": "Model B", "fast": "Model C", "p2p": "Model D", "reg": "Model E"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
FILENAME_RE = re.compile(r"^(cut|cyc|fast|p2p|reg)-(.+)-([^_]+)_(\d+)\.(png|jpg|jpeg|webp)$", re.I)


def natural_key(path: Path) -> List[object]:
    parts = re.split(r"(\d+)", path.name.lower())
    return [int(p) if p.isdigit() else p for p in parts]


def load_url_map(csv_path: Optional[Path]) -> Dict[str, str]:
    if not csv_path:
        return {}
    if not csv_path.exists():
        raise FileNotFoundError(f"drive-links CSV not found: {csv_path}")
    mapping: Dict[str, str] = {}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = {"filename", "url"}
        if not required.issubset(set(reader.fieldnames or [])):
            raise ValueError("drive-links CSV must contain columns: filename,url")
        for row in reader:
            filename = (row.get("filename") or "").strip()
            url = (row.get("url") or "").strip()
            if filename and url:
                mapping[filename] = url
    return mapping


def iter_images(model_dir: Path) -> Iterable[Path]:
    for p in sorted(model_dir.iterdir(), key=natural_key):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            yield p


def make_image_entry(path: Path, root: Path, url_map: Dict[str, str], base_url: str) -> Dict[str, str]:
    m = FILENAME_RE.match(path.name)
    if not m:
        raise ValueError(f"Filename does not follow required rule: {path.name}")
    model, machine_group, organ, number, _ext = m.groups()
    rel = path.relative_to(root).as_posix()
    if path.name in url_map:
        url = url_map[path.name]
    elif base_url:
        url = base_url.rstrip("/") + "/" + rel
    else:
        # This path works when users preview locally. For official deployment,
        # provide --drive-links or --base-url so the URL points to Google Drive.
        url = rel
    return {
        "id": f"{model.lower()}-{machine_group}-{organ}_{number}",
        "filename": path.name,
        "url": url,
        "machine_group": machine_group,
        "organ": organ,
        "number": number,
    }


def build_manifest(root: Path, url_map: Dict[str, str], base_url: str) -> List[dict]:
    if not root.exists():
        raise FileNotFoundError(f"Image root not found: {root}")
    manifest: List[dict] = []
    for strategy_dir in sorted([p for p in root.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
        strategy = strategy_dir.name
        for dataset_dir in sorted([p for p in strategy_dir.iterdir() if p.is_dir()], key=lambda p: p.name.lower()):
            dataset = dataset_dir.name
            for model in ALLOWED_MODELS:
                model_dir = dataset_dir / model
                if not model_dir.exists():
                    continue
                images = [make_image_entry(p, root, url_map, base_url) for p in iter_images(model_dir)]
                manifest.append({
                    "strategy": strategy,
                    "dataset": dataset,
                    "model": model,
                    "displayModel": MODEL_DISPLAY[model],
                    "images": images,
                })
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build manifest.json from UltrasoundImages folder.")
    parser.add_argument("--image-root", default="UltrasoundImages", help="Local synced/mirrored Google Drive image root.")
    parser.add_argument("--output", default="manifest.json", help="Output manifest path.")
    parser.add_argument("--drive-links", default="", help="Optional CSV with columns filename,url for Google Drive public links.")
    parser.add_argument("--base-url", default="", help="Optional public base URL prepended to relative image paths.")
    args = parser.parse_args()

    root = Path(args.image_root).resolve()
    output = Path(args.output).resolve()
    url_map = load_url_map(Path(args.drive_links).resolve() if args.drive_links else None)
    manifest = build_manifest(root, url_map, args.base_url)
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum(len(t["images"]) for t in manifest)
    print(f"Wrote {output}")
    print(f"Tasks: {len(manifest)}")
    print(f"Images: {total}")
    for task in manifest:
        print(f"- {task['strategy']} / {task['dataset']} / {task['model']}: {len(task['images'])}")


if __name__ == "__main__":
    main()
