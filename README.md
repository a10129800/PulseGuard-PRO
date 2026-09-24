# PulseGuard PRO - 全方位電腦頓挫黑盒子與防毒診斷體檢系統

<div align="center">

![Python Version](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![UI](https://img.shields.io/badge/Design-Cyberpunk%20Glassmorphism-8b5cf6?style=for-the-badge)
![Security](https://img.shields.io/badge/Antivirus-Windows%20Defender%20Native-10b981?style=for-the-badge&logo=windows-terminal&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

<p align="center">
  <b>為解決「電腦莫名卡頓、滑鼠掉幀，但打開工作管理員時又抓不到兇手」而設計的極致黑盒子與防毒體檢工具。</b><br>
  整合微軟 Windows Defender 原生掃描引擎、可疑挖礦與偽裝行程獵殺、Hosts 防劫持、開機自啟動清道夫與桌面純圓形懸浮球。
</p>

</div>

---

## 🌟 核心特色功能矩陣

| 功能模組 | 功能名稱 | 核心價值與解決的痛點 |
| :--- | :--- | :--- |
| **防毒安全** | 🛡️ **微軟原生防毒與惡意獵殺中心** | 聯動微軟原生 `MpCmdRun.exe` 核心（快速/完整掃描/病毒碼更新），並具備記憶體偽裝行程（Spoofing）、虛擬幣挖礦木馬獵殺與 Hosts 劫持體檢。快捷鍵按 <kbd>7</kbd>。 |
| **黑盒子** | 🚨 **頓挫黑盒子 (Lag Hunter)** | 回溯分析過去 60 秒硬體高峰，秒抓是哪一個軟體突然暴衝吃光 CPU/RAM/磁碟。快捷鍵按 <kbd>Space</kbd> 隨時觸發。 |
| **自動監控** | 🤖 **自動卡頓哨兵與智慧診斷結論** | 背景自動值守，一旦出現 CPU 飆高或凍結**自動拍照存證**；並提供**【大白話診斷結論與 1-2-3 解決步驟】**（含 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd> 工作管理員排解防毒高佔用指引），即使不懂技術也能秒懂兇手與解法。快捷鍵按 <kbd>3</kbd>。 |
| **硬體遙測** | 🎮 **GPU 顯卡與過熱降頻監控** | 即時監測 GPU 溫度 (°C) 與 VRAM 顯存佔用，揪出因顯存塞爆或過熱降頻引起的遊戲/剪輯畫面掉幀。 |
| **一鍵減負** | ⚡ **一鍵急救減負 (Instant RAM Trim)** | 呼叫 Windows 底層 `EmptyWorkingSet` 強制釋放閒置記憶體、清理 `%TEMP%` 並刷新 DNS 快取。按 <kbd>R</kbd> 隨時觸發。 |
| **深度清潔** | 🧹 **深度快取清道夫 (Deep Cleaner)** | 掃描並清除 Windows Update 安裝殘留包、Chrome/Edge 瀏覽器快取、檔案總管縮圖快取與暫存檔。快捷鍵按 <kbd>4</kbd>。 |
| **專業報告** | 📥 **一鍵匯出體檢報告 (Export Report)** | 將電腦規格、健康評分、防毒安全指數與卡頓事件打包匯出成獨立質感的 **HTML / Markdown 體檢報告單**。 |
| **桌面懸浮球** | 🪟 **純圓形桌面置頂懸浮球 (Speed Ball)** | 桌面極簡 100% 透明無框小圓球（系統級最高置頂 Always on Top，切換視窗絕不縮小），點擊立即釋放記憶體，右鍵可一鍵查毒與診斷。 |
| **開機診斷** | 🚀 **開機自啟動清道夫 (Startup Inspector)** | 掃描註冊表開機啟動項，標註「高負載」軟體並給予禁用調校建議。快捷鍵按 <kbd>6</kbd>。 |

---

## 🏗️ 模組化系統架構

```text
pc-lag-diagnostics/
├── core/                         # 核心配置與背景元件
│   ├── config.py                 # 全域設定、警報臨界值 (CPU/RAM/Disk 門檻)
│   ├── flight_recorder.py        # 執行緒安全的 60 秒滾動飛行紀錄緩衝環 (Ring Buffer)
│   ├── sentinel.py               # 自動卡頓哨兵 (Auto Lag Sentinel)
│   └── hud_launcher.py           # 桌面懸浮球跨程序發起器
├── collectors/                   # 硬體遙測與安全採集器
│   ├── system_metrics.py         # 即時 CPU/多核心/記憶體/Commit/磁碟 I/O 遙測
│   ├── gpu_metrics.py            # NVIDIA / 整合顯卡溫度、VRAM 顯存與降頻狀態監控
│   ├── security_scanner.py       # Windows Defender 核心聯動、行程獵殺、Hosts/防火牆體檢
│   ├── startup_inspector.py      # Windows 註冊表開機啟動項掃描與高負載分析
│   └── health_checker.py         # C 槽容量/開機時長/虛擬記憶體健康度評測 (0-100分)
├── analyzers/                    # 診斷與報告生成演算法
│   ├── lag_analyzer.py           # 頓挫峰值偵測、權重計算、兇手行程影響力排序
│   └── report_generator.py       # 獨立 HTML / Markdown 體檢報告生成器
├── optimizers/                   # 系統減負與深層快取清理模組
│   └── system_optimizer.py       # EmptyWorkingSet 記憶體修剪、瀏覽器快取/更新殘留深度清除
├── server/                       # 網路服務與 API 路由
│   ├── handlers.py               # REST API 路由與靜態儀表板發送
│   └── server.py                 # 背景採樣守護執行緒與 HTTP 伺服器生命週期
├── static/                       # 前端視覺化儀表板
│   ├── index.html                # 主 Cyberpunk 玻璃擬態儀表板結構 (7 大模組)
│   ├── style.css                 # 質感深色主題、雷達微動效與即時警示視覺
│   ├── app.js                    # 遙測更新、雙曲線 Canvas 動態波形、智慧結論邏輯
│   └── mini.html                 # 備用微型懸浮窗
├── app.py                        # 主啟動入口 (支援 --port, --no-browser 參數)
├── floating_ball.py              # 桌面純圓形置頂懸浮小球 (Tkinter 穿透透明)
├── start.bat                     # Windows 一鍵無痛啟動主程式腳本
├── run_floating_ball.bat         # 獨立啟動桌面懸浮球腳本
├── push_to_github.bat            # 本地專用推送腳本 (已列入 .gitignore，不會上傳至 GitHub)
├── .gitignore                    # Git 版本控管排除清單
├── requirements.txt              # 可選高效能相依套件 (psutil)
└── README.md                     # 專案完整中文說明手冊
```

---

## 🛠️ 安裝與啟動使用

### 方式 1：一鍵點擊執行 (最推薦)
直接在資料夾中雙擊執行：
```text
start.bat
```
腳本會自動檢查環境，並在預設瀏覽器中開啟診斷面板 (`http://localhost:8899`)。

### 方式 2：使用終端機執行
```bash
# 1. 建議安裝可選加速模組 (推薦，大幅提升遙測效能)
pip install psutil

# 2. 啟動伺服器
python app.py
```

### 方式 3：單獨開啟桌面置頂懸浮小圓球
雙擊執行：
```text
run_floating_ball.bat
```
會在螢幕右上角常駐純透明圓形小球：
- **左鍵點擊小球**：立即執行急救釋放 RAM。
- **右鍵點擊小球**：可選擇「抓出剛才卡頓兇手」或「微軟快速查毒」。

---

## ⌨️ 快捷鍵一覽表

| 快捷鍵 | 對應動作 |
| :---: | :--- |
| <kbd>Space</kbd> | 隨時觸發**「抓出剛才卡頓兇手」**並進行 60 秒深度黑盒子分析 |
| <kbd>R</kbd> | 隨時執行**「一鍵急救減負」**（強制釋放閒置 RAM 與清空臨時暫存） |
| <kbd>1</kbd> | 切換至 **即時監控儀表**（CPU / RAM / Commit / C槽 / GPU 溫度） |
| <kbd>2</kbd> | 切換至 **頓挫黑盒子分析**（抓出瞬間暴衝兇手） |
| <kbd>3</kbd> | 切換至 **自動卡頓哨兵事件簿**（含智慧診斷結論與解決步驟） |
| <kbd>4</kbd> | 切換至 **深度垃圾清道夫**（清除系統更新殘留與瀏覽器快取） |
| <kbd>5</kbd> | 切換至 **全機深度體檢**（0-100 健康評分與扣分弱點） |
| <kbd>6</kbd> | 切換至 **常駐啟動清道夫**（分析拖慢開機速度的軟體） |
| <kbd>7</kbd> | 切換至 **防毒安全中心**（Defender 快速/完整掃描、特徵驗證與威脅獵殺） |

---

## 💡 常見問題與卡頓排解 (FAQ & Troubleshooting)

### Q1：自動卡頓哨兵一直抓到 `MsMpEng.exe` 吃滿 CPU（甚至高達數百 %），該怎麼解決？

> **【為什麼會發生？】**  
> `MsMpEng.exe` 是 Windows Defender 內建防毒的核心進程。微軟會在背景發起「系統自動排程維護」或與頻繁讀寫檔案的軟體（如程式碼編輯器、Python 專案、ComfyUI 模型暫存）互相拉扯，導致防毒瞬間調用多個 CPU 核心（在多核心電腦上加總可達 100% ~ 800%+），造成畫面嚴重掉幀或卡死。

#### 🛠️ 解決方法 A：使用【Ctrl + Alt + Del】工作管理員手動降速／中止（最速應急）
1. **打開工作管理員**：同時按下鍵盤 <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Del</kbd>（或直接按 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Esc</kbd>），點選進入**【工作管理員】**。
2. **找出高負載防毒進程**：在「處理程序」列表中，點擊「CPU」欄位由大到小排序，找到佔用最高的 **Antimalware Service Executable** (`MsMpEng.exe`) 或其他第三方防毒軟體。
3. **終止或降低優先順序**：
   - 在該程序上點擊滑鼠右鍵，選擇**【結束工作】**。
   - 若因 Windows 底層防篡改保護無法直接結束，請切換至**【詳細資料】**頁籤，找到 `MsMpEng.exe` 點擊滑鼠右鍵 ➔ **【設定優先順序】** 改為**「低」**，立即將 100% 處理器算力釋放還給目前操作的視窗！

#### 🌟 解決方法 B：將專案目錄加入「排除清單」（一勞永逸，徹底根治）
1. 打開 Windows「設定」➔「更新與安全性」➔**【Windows 安全性】**（或直接在工作列搜尋「Windows 安全性」）。
2. 點擊進入**【病毒與威脅防護】**。
3. 在「病毒與威脅防護設定」段落下，點擊藍色文字**【管理設定】**。
4. 頁面滾動到最下方，找到「排除項目」，點擊**【新增或移除排除項目】**。
5. 點擊**【＋ 新增排除項目】**：
   - 選擇**「資料夾」**：將常有大量暫存檔或程式碼讀寫的專案目錄加入。
   - 選擇**「處理程序」**：輸入 `python.exe`。
6. 加入後，微軟防毒便永遠不會再次死磕這些檔案，從此徹底杜絕突發性 100% 卡頓！

---

## 🚀 如何推送到 GitHub (使用一鍵腳本)

本專案已為您準備了專屬的自動化 Git 提交腳本：

1. 在專案目錄中，雙擊執行 **`push_to_github.bat`**。
2. 腳本會自動檢查 Git 環境；如果是第一次使用，會引導您貼上您的 GitHub 倉庫網址（例如 `https://github.com/你的帳號/倉庫名.git`）。
3. 輸入本次更新說明（或直接按 Enter 使用預設說明）。
4. 腳本會自動執行 `git add .`、`git commit` 與 `git push -u origin main`，並自動處理分支同步！

---

## 🔒 隱私與安全保證

- **100% 本地運作**：所有遙測、行程分析、防毒指令均在您的電腦本機執行，絕不將任何數據或檔案上傳到外部伺服器。
- **無後門、無外部廣告**：純原生 Python + Windows 原生 API 打造，保護您的系統隱私與資源純淨。

---

## 📄 開源授權

本專案採用 [MIT License](LICENSE) 條款開源授權。
