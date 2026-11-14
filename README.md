# 🍅 Smart Study Planner & Tomato Flow (TomatoPlanner)

一個融合**加權智能排程**、**Flow-OS 番茄鐘專注系統**、**行事曆匯出**與**遊戲化激勵機制**的個人備考衝刺神器。

---

## 🔗 致敬與開源來源 (Acknowledgements & Open Source Credits)

本專案融合並擴充了以下三個優秀開源專案的核心技術與設計精粹，由衷感謝原作者的貢獻：

1. **[Smart-Study-Planner-Generator](https://github.com/M-Awad-27/Smart-Study-Planner-Generator)** by [@M-Awad-27](https://github.com/M-Awad-27)
   - **貢獻部分**：核心加權排程評分引擎（結合難易度、倒數天數迫切度與弱項加權）、每週 7 天輪轉排程演算法、動態時數分配與霓虹玻璃擬態（Glassmorphism）儀表板設計。

2. **[Flow-OS](https://github.com/thc1006/Flow-OS)** by [@thc1006](https://github.com/thc1006)
   - **貢獻部分**：番茄鐘計時器互動架構、專注/休息週期切換、植物成長進化動畫（🌱 ➔ 🌿 ➔ 🌳）、每日各科目番茄鐘顆數追蹤卡片與 Web Audio 清脆提示音。

3. **[study-scheduler-generator](https://github.com/julianunesp/study-scheduler-generator)** by [@julianunesp](https://github.com/julianunesp)
   - **貢獻部分**：`.ics` (iCalendar / RFC 5545) 課表匯出功能，支援一鍵匯入 Google Calendar、Apple 日曆、Outlook 等主流行事曆軟體。

---

## ✨ 核心特色與升級功能

### 1. 🧠 智能加權排程引擎 (Smart Priority Engine)
- **多維度科學計分**：綜合考量「科目難度 (35%)」、「考試倒數緊迫度 (45%)」與「自評弱科 (20%)」，自動計算 0–100 優先分數。
- **每日/每週課表生成**：動態將每日讀書時數分配至各科目，並智能插入休息時段。
- **📅 一鍵匯出 .ics 行事曆**：內建雙模（`icalendar` 套件 + 零依賴 RFC 5545 產生器），輕鬆匯出個人課表。

### 2. 🍅 Flow-OS 番茄鐘與科目追蹤
- **每日科目番茄鐘進度表**：即時將各科排定時數換算為番茄鐘顆數（可自訂 25m/5m/15m），完成可即時打勾。
- **📌 桌面置頂浮動計時器 (Always-on-Top PiP)**：
  - 支援 **Document Picture-in-Picture API** (Chrome / Edge 116+)，開啟真正的獨立浮動視窗，置頂於所有視窗與應用程式之上。
  - 內建 **Canvas Video PiP 自動備援** (Safari / 舊版瀏覽器)，切換到其他瀏覽器或 PDF 依舊隨時監看剩餘時間。
  - 瀏覽器分頁標題即時秒數倒數同步（例如：`(24:59) 🍅 計算機概論`）。
- **🎙️ 5-4-3-2-1 START! 起跑語音**：點擊開始時觸發英文語音倒數與賽車起跑和弦音效。

### 3. 🎮 超級瑪利歐遊戲化與自我獎勵商店 (Gamification & Reward Shop)
- **頂金幣與連擊特效**：番茄鐘完成時觸發經典瑪利歐跳躍金幣音效、綠色 `+$250` 飄字與畫面金色流光；連續完成觸發 `🔥 2x / 3x Combo` 暴擊加成。
- **🏪 自我獎勵商店**：可自訂犒賞項目（手搖飲、打電動等），存夠專注幣後點擊兌換，觸發清脆敲章聲與紅色「已核准」印章特效。
- **💾 SQLite + localStorage 雙重持久化**：自動儲存課表、專注幣餘額、商店兌換紀錄，網頁重整不遺失。

---

## 💻 技術技術堆疊 (Technology Stack)

- **後端 (Backend)**：Python 3, Flask, SQLite3
- **前端 (Frontend)**：HTML5, CSS3, Vanilla JavaScript (ES6+)
- **音效與動畫 (Audio & FX)**：Web Audio API (合成器音效), Web Speech API (英文倒數), Canvas API
- **日曆格式 (Calendar)**：RFC 5545 `.ics` 標準規範
- **圖表 (Charts)**：Chart.js

---

## 📦 本地快速安裝與啟動 (Getting Started)

### 1. 複製專案
```bash
git clone https://github.com/chienchien6/TomatoPlanner.git
cd TomatoPlanner
```

### 2. 建立並啟動虛擬環境 (Virtual Environment)
```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. 安裝依賴套件
```bash
pip install -r requirements.txt
```

### 4. 啟動伺服器
```bash
python app.py
```
啟動後打開瀏覽器訪問：**`http://127.0.0.1:5000`**

---

## 👨‍💻 授權與感謝 (Credits)
- 原排程核心演算法：[M-Awad-27/Smart-Study-Planner-Generator](https://github.com/M-Awad-27/Smart-Study-Planner-Generator)
- 番茄鐘設計靈感：[thc1006/Flow-OS](https://github.com/thc1006/Flow-OS)
- 行事曆匯出模組：[julianunesp/study-scheduler-generator](https://github.com/julianunesp/study-scheduler-generator)
- 整合與強化版開發：[chienchien6](https://github.com/chienchien6)
