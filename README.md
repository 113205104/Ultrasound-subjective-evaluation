# Ultrasound-subjective-evaluation

超音波影像主觀評分平台。此版採用 **Google Drive 直接讀取影像清單**，不再依賴本機掃描或手動更新 `manifest.json`。

## 核心功能

- 固定評分者：`Reviewer1`、`Reviewer2`。
- 模型匿名：`cut=Model A`、`cyc=Model B`、`fast=Model C`、`p2p=Model D`、`reg=Model E`。
- 每張 Tripanel 以 Google Form 矩陣方式評分：
  - 第一張、第二張、第三張
  - Whole image quality、Noise suppression、Contrast、Edge sharpness
  - 共 3 × 4 = 12 個分數
- 每次點選立即儲存：
  - localStorage
  - Google Sheet `responses`
- Google Drive 新增影像後，首頁會重新讀取最新影像清單。
- 已作答內容與影像清單分離：
  - 影像清單來自 Google Drive
  - 作答資料存在 Google Sheet
  - 只要 `imageId`/檔名不變，重新掃描 Drive 或新增影像不會讓舊作答消失
- 首頁與評分頁不顯示 cut/cyc/fast/p2p/reg，只顯示 Model A–E。

## GitHub Repo 放置

```text
index.html
survey.html
history.html
README.md
build_manifest.py        # 僅保留為舊版/備援工具，正式流程不需要執行
manifest.json            # 可保留 []；正式流程不依賴它
css/style.css
js/config.js
js/admin.js
js/home.js
js/survey.js
js/history.js
apps_script/Code.gs
apps_script/appsscript.json
```

## Apps Script 放置

將以下檔案內容貼到 Apps Script：

```text
apps_script/Code.gs
```

然後在 `Code.gs` 找到：

```javascript
const DRIVE_ROOT_FOLDER_ID = '';
```

貼上你的 Google Drive 根資料夾 `UltrasoundImages` 的 folder ID。

例如資料夾網址：

```text
https://drive.google.com/drive/folders/1AbCdEfGxxxxxx
```

則填：

```javascript
const DRIVE_ROOT_FOLDER_ID = '1AbCdEfGxxxxxx';
```

部署 Web App：

```text
Deploy → New deployment → Web app
Execute as: Me
Who has access: Anyone
```

部署完成後，確認 `js/config.js` 的 `appsScriptUrl` 是同一個 Web App URL。

## Google Drive 影像資料夾架構

```text
UltrasoundImages
├─ Supervised
│  └─ v7-only
│     ├─ cut
│     ├─ cyc
│     ├─ fast
│     ├─ p2p
│     └─ reg
├─ Unsupervised
│  ├─ v7-only
│  └─ all
└─ semi-supervised
   ├─ v7-only
   └─ all
```

每個模型資料夾放 Tripanel 圖檔。

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

## 重要保護機制

作答資料用以下穩定鍵值儲存：

```text
reviewer + strategy + dataset + model + imageId
```

其中 `imageId` 由檔名產生，例如：

```text
cut-v7-carotid_001.png → cut-v7-carotid_001
```

因此：

- 新增 `cut-v7-carotid_126.png` 不會影響 001–125 的作答。
- 重新讀取 Google Drive 不會清空 `responses` 或 `progress`。
- 除非評分者在同一張圖重新點選答案，否則舊答案不會被覆蓋。

## 圖片權限

Apps Script 可以掃描 Drive，但瀏覽器要顯示圖片時，圖片必須能被網頁訪問。

建議將 `UltrasoundImages` 或其內部圖片設為：

```text
Anyone with the link can view
```

或在 `Code.gs` 設定：

```javascript
const AUTO_SHARE_IMAGES = true;
```

若機構帳號禁止公開分享，圖片可能仍無法在網頁 `<img>` 中顯示。

## 初始化 Google Sheet

部署後開啟：

```text
<Web App URL>?action=setup
```

系統會建立或補齊：

```text
responses
progress
```

既有資料不會被清空，只會補上缺少欄位。
