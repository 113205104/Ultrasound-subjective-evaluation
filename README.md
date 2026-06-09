# Ultrasound Subjective Evaluation

## 必須覆蓋/新增的檔案

把本資料夾內容上傳到 GitHub repository 根目錄。

## Apps Script

Google Sheet → Extensions → Apps Script  
把 `Code.gs` 內容全部貼上，儲存後重新部署 Web App。

## Google Drive 圖片

圖片需設定「任何知道連結的人可查看」。

manifest.json 每張圖片建議放：

```json
"image_url": "https://drive.google.com/uc?export=view&id=FILE_ID"
```

若沒有 image_url，系統會嘗試讀 GitHub 本地路徑：

```text
images/strategy/dataset/model/file
```

## manifest.json 範例

```json
[
  {
    "strategy": "Unsupervised",
    "dataset": "v7-only",
    "model": "cut",
    "total_groups": 1,
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
