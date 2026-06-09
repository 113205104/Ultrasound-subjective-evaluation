# Ultrasound Subjective Evaluation

此版本已依照《Ultrasound Subjective Evaluation 系統建置操作手冊 v1.0》整理成可部署結構。

## 專案功能

- 固定兩位評分者：`Reviewer1`、`Reviewer2`
- 首頁模型匿名顯示：
  - `cut` → `Model A`
  - `cyc` → `Model B`
  - `fast` → `Model C`
  - `p2p` → `Model D`
  - `reg` → `Model E`
- 每張三連圖評分 4 個項目：
  - Whole image quality
  - Noise suppression
  - Contrast
  - Edge sharpness
- 每項分數為 1、2、3、4 單選 Radio Button
- 每次點選分數會同時儲存：
  - `localStorage`
  - Google Sheet：`responses` 與 `progress`
- 再次開啟同一 reviewer / task 會自動續作
- `history.html` 可查看該任務每張三連圖與已填分數
- 首頁會顯示每個任務進度，例如 `88 / 125 In Progress`

## Repository 結構

```text
Ultrasound-subjective-evaluation
├─ index.html
├─ survey.html
├─ history.html
├─ manifest.json
├─ build_manifest.py
├─ image_urls.csv
├─ Code.gs
├─ README.md
├─ css/
│  └─ style.css
├─ js/
│  ├─ config.js
│  ├─ api.js
│  ├─ home.js
│  ├─ survey.js
│  └─ history.js
├─ manifests/
└─ images/
```

## GitHub Pages

Repository 名稱建議：

```text
Ultrasound-subjective-evaluation
```

GitHub Pages 設定：

```text
Settings → Pages → Deploy from branch → main → /(root)
```

## Google Sheet / Apps Script

1. 建立 Google Sheet，名稱建議：

```text
Ultrasound_subjective_evaluation_database
```

2. 進入：

```text
Extensions → Apps Script
```

3. 將 `Code.gs` 全部貼上。

4. 部署 Web App：

```text
Deploy → New deployment → Web app
Execute as: Me
Who has access: Anyone
```

5. 將取得的 Web App URL 填入：

```javascript
js/config.js
CONFIG.APPS_SCRIPT_URL
```

目前已先填入你提供的 URL，如重新部署，請更新此處。

## 圖片存放方式

手冊規定圖片不放 GitHub，建議放 Google Drive。

Google Drive 建議結構：

```text
UltrasoundImages
├─ Unsupervised
│  ├─ v7-only
│  │  ├─ cut
│  │  ├─ cyc
│  │  ├─ fast
│  │  ├─ p2p
│  │  └─ reg
│  └─ all
├─ Supervised
└─ Semi-supervised
```

每張圖片需要設定：

```text
任何知道連結的人可查看
```

`manifest.json` 中每張圖片建議加入：

```json
"image_url": "https://drive.google.com/uc?export=view&id=FILE_ID"
```

## manifest.json 格式

```json
[
  {
    "strategy": "Unsupervised",
    "dataset": "v7-only",
    "model": "cut",
    "total_groups": 125,
    "images": [
      {
        "group": 1,
        "file": "cut-v7-carotid_001.png",
        "machine_group": "v7",
        "organ": "carotid",
        "image_url": "https://drive.google.com/uc?export=view&id=FILE_ID"
      }
    ]
  }
]
```

## build_manifest.py 用法

若你本機有一份圖片鏡像資料夾，可用：

```bash
python build_manifest.py --root images --out manifest.json
```

若要批次補 Google Drive 圖片連結，建立 `image_urls.csv`：

```csv
file,image_url
cut-v7-carotid_001.png,https://drive.google.com/uc?export=view&id=FILE_ID
```

再執行：

```bash
python build_manifest.py --root images --out manifest.json --url-csv image_urls.csv
```

## 檔名規則

```text
模型-機台組別-器官_編號.png
```

範例：

```text
cut-v7-carotid_001.png
cyc-v7-thyroid_021.png
fast-v7-kidney_031.png
p2p-v7-liver_050.png
reg-ph-carotid_104.png
```

## 最終資料匯出

評分結果會在 Google Sheet：

- `responses`：每一張圖、每一評分項目的分數
- `progress`：每位 reviewer、每個任務的進度

研究結束後可由 Google Sheet 匯出：

```text
File → Download → CSV 或 XLSX
```

再匯入 SPSS 進行 Friedman、Wilcoxon、ICC、Cronbach's α、Spearman、Pearson 等分析。
