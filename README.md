# Ultrasound Subjective Evaluation

此版本不使用 `build_manifest.py`。圖片由 Apps Script 直接讀取 Google Drive 大專案資料夾。

## Drive 資料夾結構

請將 Drive 圖片整理成以下階層：

```text
大專案資料夾
├─ 訓練策略 1
│  ├─ 來源組別 1
│  │  ├─ cut
│  │  ├─ cyc
│  │  ├─ fast
│  │  ├─ p2p
│  │  └─ reg
│  └─ 來源組別 2
│     ├─ cut
│     ├─ cyc
│     ├─ fast
│     ├─ p2p
│     └─ reg
└─ 訓練策略 2
   ├─ 來源組別 1
   │  ├─ cut
   │  ├─ cyc
   │  ├─ fast
   │  ├─ p2p
   │  └─ reg
   └─ 來源組別 2
      ├─ cut
      ├─ cyc
      ├─ fast
      ├─ p2p
      └─ reg
```

首頁會自動產生任務：

```text
Model A | 訓練策略 | 來源組別
Model B | 訓練策略 | 來源組別
Model C | 訓練策略 | 來源組別
Model D | 訓練策略 | 來源組別
Model E | 訓練策略 | 來源組別
```

模型匿名對照固定如下：

```text
cut  -> Model A
cyc  -> Model B
fast -> Model C
p2p  -> Model D
reg  -> Model E
```

## Apps Script 設定

只需要修改 `Code.gs` 這一段：

```javascript
projectRootFolderId: 'PASTE_PROJECT_ROOT_FOLDER_ID_HERE',
```

填入「大專案資料夾」的 Drive folder ID，不需要逐一填 20 個模型資料夾 ID。

## 評分與儲存

- Reviewer1 / Reviewer2 會分開儲存進度。
- 按「儲存目前進度」會更新 Google Sheet 的 `progress` 與 `responses`。
- 按「確認完成並送出」會檢查全部題目完成，並把最新答案完整寫入 `responses`。
- `history.html` 直接讀取 Google Sheet 的 `responses`，可查看作答記錄。
- `responses` 欄位包含：
  - `whole_image_quality_1`
  - `whole_image_quality_2`
  - `whole_image_quality_3`
  - `noise_suppression_1` ...
  - `contrast_1` ...
  - `edge_sharpness_1` ...

## 2026-06 修正版重點

- Drive 讀取結構：大專案資料夾 / 訓練策略 / 來源組別 / cut|cyc|fast|p2p|reg / 圖片。
- 評分者只看到 Model A-E；responses 仍記錄真實 model 欄位方便管理。
- responses 欄位改為：whole_1~3、noise_1~3、contrast_1~3、edge_1~3。
- 作答記錄頁顯示最後修改時間、Reviewer、策略、來源組別、真實模型、Model A-E、題號、圖片連結、filename 與全部分數。
- 評分頁初始化時會先讀 Google Sheet responses/progress，換裝置也能續作。
