# Ultrasound-subjective-evaluation

超音波影像主觀評分平台。此專案依照 `Ultrasound Subjective Evaluation 系統建置操作手冊 v1.0` 建立。

## 1. 功能對應

- 固定兩位評分者：`Reviewer1`、`Reviewer2`。
- 評分模型匿名顯示：`cut=Model A`、`cyc=Model B`、`fast=Model C`、`p2p=Model D`、`reg=Model E`。
- 每張三連圖評分四項：
  1. Whole image quality
  2. Noise suppression
  3. Contrast
  4. Edge sharpness
- 評分尺度：Radio Button 單選 `1`、`2`、`3`、`4`。
- 每次點選分數後立即同步：
  - `localStorage`
  - Google Sheet
- 再次開啟網站會依 `Reviewer` 回到上次作答位置。
- 首頁顯示每個模型任務進度，例如 `88 / 125 In Progress`、`125 / 125 Completed`。
- 作答紀錄頁採 Google Form 風格，可看原始三連圖與四項評分。

## 2. 專案結構

```text
Ultrasound-subjective-evaluation
├─ index.html
├─ survey.html
├─ history.html
├─ manifest.json
├─ build_manifest.py
├─ css/
│  └─ style.css
├─ js/
│  ├─ config.js
│  ├─ home.js
│  ├─ survey.js
│  ├─ history.js
│  └─ admin.js
├─ manifests/
├─ images/
└─ apps_script/
   ├─ Code.gs
   └─ appsscript.json
```

## 3. GitHub Pages 設定

Repository 名稱：

```text
Ultrasound-subjective-evaluation
```

GitHub Pages：

```text
Settings → Pages
Source: Deploy from branch
Branch: main
Folder: / (root)
```

網址：

```text
https://113205104.github.io/Ultrasound-subjective-evaluation/
```

## 4. Google Sheet

名稱：

```text
Ultrasound_subjective_evaluation_database
```

工作表：

```text
responses
progress
```

`responses` 儲存所有評分結果。  
`progress` 儲存作答進度。

## 5. Apps Script 部署

Apps Script 專案名稱：

```text
Ultrasound_subjective_evaluation_backend
```

操作：

1. 建立 Apps Script 專案。
2. 將 `apps_script/Code.gs` 貼到 Apps Script 的 `Code.gs`。
3. 將 `apps_script/appsscript.json` 內容貼到 Apps Script 的 manifest。
4. 部署為 Web App。
5. Execute as 選自己。
6. Who has access 選 Anyone。
7. 部署後確認 Web App URL 是否與 `js/config.js` 內的 `appsScriptUrl` 相同。

目前預設：

```text
https://script.google.com/macros/s/AKfycbx0pXw3alThi70IDIO30FbH_2Tg1SvuzfVsJMpQYOUk4k1fr2nUmwLlPOElc4eU7WU/exec
```

初次部署後，可在瀏覽器開啟：

```text
<Web App URL>?action=setup
```

這會建立或確認 Google Sheet 的 `responses` 與 `progress` 工作表。

## 6. 圖片存放規範

正式圖片不放 GitHub。圖片統一存放於 Google Drive。

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
├─ supervised
└─ semi-supervised
```

## 7. 檔名規則

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

## 8. 建立 manifest.json

`manifest.json` 告訴網站有哪些評分任務與影像。

若你的 Google Drive 已透過「Google Drive 電腦版」同步到本機，可執行：

```bash
python build_manifest.py --image-root "G:/My Drive/UltrasoundImages" --output manifest.json
```

如果你有每張圖片的公開 Google Drive 圖片 URL，請建立 `drive_links.csv`：

```csv
filename,url
cut-v7-carotid_001.png,https://drive.google.com/uc?export=view&id=XXXXX
```

再執行：

```bash
python build_manifest.py --image-root "G:/My Drive/UltrasoundImages" --drive-links drive_links.csv --output manifest.json
```

若使用可公開存取的圖片 base URL：

```bash
python build_manifest.py --image-root "UltrasoundImages" --base-url "https://example.com/UltrasoundImages" --output manifest.json
```

## 9. 新增模型流程範例

以 `Unsupervised / v7-only / cut` 為例：

1. 將 125 張三連圖上傳到 Google Drive：

```text
UltrasoundImages/Unsupervised/v7-only/cut/
```

2. 執行：

```bash
python build_manifest.py --image-root "你的 UltrasoundImages 路徑" --output manifest.json
```

3. Commit。
4. Push。
5. 首頁自動出現 `Model A`。

## 10. 最終匯出

Google Sheet：

```text
File → Download → CSV
File → Download → XLSX
```

匯入 SPSS 後可進行：

- Friedman Test
- Wilcoxon Signed-Rank Test
- ICC
- Cronbach’s α
- Spearman Correlation
- Pearson Correlation

## 11. 研究結束保留

完整重現研究結果需保留：

- GitHub Repository
- Google Sheet
- Google Drive
