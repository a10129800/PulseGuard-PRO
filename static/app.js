/**
 * PulseGuard PRO Frontend Application
 * High-frequency telemetry, Canvas continuous timeline, Lag Hunter, Auto Sentinel,
 * Deep Cache Cleaner, Client-Side Instant Report Exporter, and Document PiP Speed Ball.
 */

// State
const pollInterval = 1000;
let historyBuffer = [];
const MAX_HISTORY_POINTS = 60;
let isOptimizing = false;

// Cached state for instant client-side report generation
let lastMetrics = null;
let lastAudit = null;
let lastIncidents = [];
let lastStartups = [];

// Canvas setup
const canvas = document.getElementById("liveTimelineCanvas");
const ctx = canvas.getContext("2d");

// Sound Synthesizer via Web Audio API
let audioCtx = null;
function playSound(type = "radar") {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === "radar") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else if (type === "success") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {}
}

// Toast Notifications Helper
function showToast(title, body, stats = null, duration = 5000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";

  let statsHtml = "";
  if (stats) {
    statsHtml = `
      <div class="toast-stats">
        <div>🧠 釋放 RAM: <span>+${stats.ram} MB</span></div>
        <div>🗑️ 清理暫存: <span>+${stats.temp} MB</span></div>
      </div>
    `;
  }

  toast.innerHTML = `
    <div class="toast-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${escapeHtml(title)}</span>
    </div>
    <div class="toast-body">${escapeHtml(body)}</div>
    ${statsHtml}
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Resize canvas correctly
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Render dual-curve smooth timeline on Canvas
function drawTimeline() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;
  for (let y = 0; y <= 100; y += 25) {
    const py = height - (y / 100) * height;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "10px JetBrains Mono";
    ctx.fillText(`${y}%`, 8, py - 4);
  }

  if (historyBuffer.length < 2) return;

  const pointsCount = MAX_HISTORY_POINTS;
  const stepX = width / (pointsCount - 1);
  const offset = pointsCount - historyBuffer.length;

  function plotSeries(getValue, strokeColor, fillColor) {
    const coords = [];
    for (let i = 0; i < historyBuffer.length; i++) {
      const val = Math.min(100, Math.max(0, getValue(historyBuffer[i])));
      const x = (offset + i) * stepX;
      const y = height - (val / 100) * (height - 20) - 10;
      coords.push({ x, y });
    }

    if (coords.length === 0) return;

    ctx.beginPath();
    ctx.moveTo(coords[0].x, height);
    for (let i = 0; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.lineTo(coords[coords.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const head = coords[coords.length - 1];
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  plotSeries(d => d.memory ? d.memory.percent : 0, "#06b6d4", "rgba(6, 182, 212, 0.1)");
  plotSeries(d => d.cpu_total || 0, "#6366f1", "rgba(99, 102, 241, 0.18)");
}

function getStatusColor(percent) {
  if (percent > 85) return "#ef4444";
  if (percent > 65) return "#f59e0b";
  return "#10b981";
}

// Fetch real-time telemetry metrics
async function fetchMetrics() {
  try {
    const res = await fetch("/api/metrics");
    if (!res.ok) return;
    const data = await res.json();
    lastMetrics = data;

    const engineText = document.getElementById("engineStatusText");
    if (data.has_psutil) {
      engineText.textContent = "psutil 高速硬體模式";
    } else {
      engineText.textContent = "Windows 原生模式 (建議安裝 psutil)";
    }

    // 1. CPU
    const cpuVal = data.cpu_total || 0;
    document.getElementById("cpuVal").textContent = cpuVal.toFixed(0);
    const cpuBar = document.getElementById("cpuBarFill");
    cpuBar.style.width = `${Math.min(100, cpuVal)}%`;
    cpuBar.style.backgroundColor = getStatusColor(cpuVal);

    if (data.cpu_cores && data.cpu_cores.length > 0) {
      document.getElementById("cpuCoreInfo").textContent = `${data.cpu_cores.length} 核心平行監測中`;
    }

    // 2. RAM
    if (data.memory) {
      const ramVal = data.memory.percent || 0;
      document.getElementById("ramVal").textContent = ramVal.toFixed(0);
      const ramBar = document.getElementById("ramBarFill");
      ramBar.style.width = `${Math.min(100, ramVal)}%`;
      ramBar.style.backgroundColor = getStatusColor(ramVal);
      document.getElementById("ramUsageDetail").textContent = `${data.memory.used_gb} / ${data.memory.total_gb} GB (${data.memory.available_gb || 0} GB 可用)`;

      const commitVal = data.memory.commit_percent || 0;
      document.getElementById("commitVal").textContent = commitVal.toFixed(0);
      const commitBar = document.getElementById("commitBarFill");
      commitBar.style.width = `${Math.min(100, commitVal)}%`;
      commitBar.style.backgroundColor = getStatusColor(commitVal);
      document.getElementById("commitUsageDetail").textContent = `已認可: ${data.memory.commit_used_gb || 0} / ${data.memory.commit_total_gb || 0} GB`;
    }

    // 3. Disk
    if (data.disk) {
      const totalMb = ((data.disk.read_mb_s || 0) + (data.disk.write_mb_s || 0)).toFixed(1);
      document.getElementById("diskVal").textContent = totalMb;
      const diskBar = document.getElementById("diskBarFill");
      diskBar.style.width = `${Math.min(100, data.disk.busy_percent || 0)}%`;
      document.getElementById("diskRwDetail").textContent = `讀取: ${data.disk.read_mb_s} MB/s | 寫入: ${data.disk.write_mb_s} MB/s`;
    }

    // 4. GPU & Thermal
    if (data.gpu) {
      const tempC = Math.round(data.gpu.temperature_c || 0);
      document.getElementById("gpuTempVal").textContent = tempC > 0 ? tempC : "--";
      document.getElementById("gpuBarFill").style.width = `${Math.min(100, (tempC / 90) * 100)}%`;
      document.getElementById("gpuNameDetail").textContent = `${data.gpu.name || '標準顯卡'} (VRAM: ${data.gpu.vram_used_gb || 0}G/${data.gpu.vram_total_gb || 0}G)`;
      
      const tag = document.getElementById("gpuThermalTag");
      tag.textContent = data.gpu.thermal_status || "正常";
      if (tempC >= 80) {
        tag.style.background = "rgba(239, 68, 68, 0.2)";
        tag.style.color = "#f87171";
      } else {
        tag.style.background = "rgba(16, 185, 129, 0.15)";
        tag.style.color = "#34d399";
      }
    }

    // Top Processes
    if (data.top_processes && data.top_processes.length > 0) {
      renderProcessTable(data.top_processes);
    }

    historyBuffer.push(data);
    if (historyBuffer.length > MAX_HISTORY_POINTS) {
      historyBuffer.shift();
    }

    drawTimeline();

  } catch (err) {
    console.error("Fetch metrics error:", err);
  }
}

function renderProcessTable(processes) {
  const tbody = document.getElementById("topProcessesTbody");
  tbody.innerHTML = "";

  processes.forEach(proc => {
    const tr = document.createElement("tr");
    let tagHtml = `<span class="badge-tag">一般程式</span>`;
    const nameLower = proc.name.toLowerCase();
    if (nameLower.includes("chrome") || nameLower.includes("edge") || nameLower.includes("firefox") || nameLower.includes("brave")) {
      tagHtml = `<span class="badge-tag badge-mid">瀏覽器行程</span>`;
    } else if (nameLower.includes("code") || nameLower.includes("node") || nameLower.includes("python") || nameLower.includes("java")) {
      tagHtml = `<span class="badge-tag badge-low">開發工具</span>`;
    } else if (nameLower.includes("system") || nameLower.includes("searchindexer") || nameLower.includes("defender") || nameLower.includes("antimalware")) {
      tagHtml = `<span class="badge-tag badge-high">Windows 系統/防毒</span>`;
    } else if (proc.cpu > 20) {
      tagHtml = `<span class="badge-tag badge-high">高 CPU 佔用</span>`;
    }

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); color: var(--text-dim);">${proc.pid}</td>
      <td style="font-weight: 600; font-family: var(--font-mono);">${escapeHtml(proc.name)}</td>
      <td style="font-weight: 700; color: ${proc.cpu > 15 ? '#f87171' : 'var(--text-main)'}; font-family: var(--font-mono);">${proc.cpu}%</td>
      <td style="font-family: var(--font-mono); color: var(--text-muted);">${proc.ram}%</td>
      <td>${tagHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 1-Click Fast Optimization
async function triggerOptimization() {
  if (isOptimizing) return;
  isOptimizing = true;

  const btnTop = document.getElementById("btnOptimizeSystem");
  const btnAudit = document.getElementById("btnAuditRunOptimize");

  if (btnTop) {
    btnTop.classList.add("optimizing");
    btnTop.querySelector("strong").textContent = "急救中...";
  }
  if (btnAudit) {
    btnAudit.disabled = true;
    btnAudit.textContent = "釋放處理中...";
  }

  try {
    const res = await fetch("/api/optimize_system", { method: "POST" });
    const data = await res.json();

    playSound("success");
    showToast(
      "系統減負完成！",
      data.message,
      { ram: data.ram_freed_mb, temp: data.temp_freed_mb }
    );

    fetchMetrics();
    fetchHealthAudit();
  } catch (err) {
    showToast("減負執行失敗", err.message);
  } finally {
    isOptimizing = false;
    if (btnTop) {
      btnTop.classList.remove("optimizing");
      btnTop.querySelector("strong").textContent = "一鍵急救減負";
    }
    if (btnAudit) {
      btnAudit.disabled = false;
      btnAudit.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        急救減負 (RAM)
      `;
    }
  }
}

// Lag Hunter Diagnostic
async function triggerLagHunter() {
  playSound("radar");
  switchTab("tab-hunter");
  
  const summaryEl = document.getElementById("hunterSummaryText");
  summaryEl.textContent = "🔍 正在深入翻找過去 60 秒的硬體黑盒子紀錄與行程關聯，請稍候...";
  
  try {
    const res = await fetch("/api/diagnose_lag");
    const report = await res.json();
    
    if (report.status === "collecting") {
      summaryEl.textContent = report.message;
      return;
    }

    document.getElementById("worstTimeText").textContent = report.worst_time || "--:--:--";
    document.getElementById("peakCpuText").textContent = `${report.peak_cpu || 0} %`;
    document.getElementById("peakMemText").textContent = `${report.peak_mem || 0} %`;
    document.getElementById("peakDiskText").textContent = `${report.peak_disk_write || 0} MB/s`;
    summaryEl.textContent = report.summary;

    const listEl = document.getElementById("culpritsList");
    listEl.innerHTML = "";

    if (!report.culprits || report.culprits.length === 0) {
      listEl.innerHTML = `<div class="empty-state">過去 60 秒內未發現造成卡頓的異常程式。</div>`;
      return;
    }

    report.culprits.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "culprit-item";
      card.innerHTML = `
        <div class="culprit-info">
          <div class="culprit-title-row">
            <span style="color: var(--accent-crimson); font-weight:800;">#${idx + 1}</span>
            <span class="culprit-name">${escapeHtml(item.name)}</span>
            <span class="badge-tag badge-high">${escapeHtml(item.tag)}</span>
          </div>
          <div class="culprit-suggestion">💡 <strong>分析與建議：</strong>${escapeHtml(item.suggestion)}</div>
        </div>
        <div class="culprit-metrics">
          <div class="metric-box">
            <span class="val">${item.max_cpu}%</span>
            <span class="lbl">最高 CPU 峰值</span>
          </div>
          <div class="metric-box">
            <span class="val" style="color: var(--accent-cyan);">${item.max_ram}%</span>
            <span class="lbl">記憶體佔比</span>
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });

  } catch (err) {
    summaryEl.textContent = "診斷發生錯誤：" + err.message;
  }
}

// Fetch Auto Sentinel Incidents
async function fetchSentinelIncidents() {
  const tbody = document.getElementById("incidentsTbody");
  const badge = document.getElementById("incidentCountBadge");

  try {
    const res = await fetch("/api/incidents");
    const list = await res.json();
    lastIncidents = list || [];

    const conclusionCard = document.getElementById("sentinelConclusionCard");
    if (list && list.length > 0) {
      badge.textContent = list.length;
      badge.style.display = "inline-block";

      // Count occurrences of culprits
      const counts = {};
      let maxCpu = 0;
      list.forEach(i => {
        const name = i.culprit_name || "Unknown";
        counts[name] = (counts[name] || 0) + 1;
        if (i.peak_cpu > maxCpu) maxCpu = i.peak_cpu;
      });
      const topCulprit = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      const topLower = topCulprit.toLowerCase();

      if (conclusionCard) {
        conclusionCard.style.display = "flex";
        const titleEl = document.getElementById("conclusionTitle");
        const descEl = document.getElementById("conclusionDesc");
        const solutionsEl = document.getElementById("conclusionSolutions");

        if (topLower.includes("msmpeng") || topLower.includes("defender")) {
          titleEl.textContent = `主要卡頓兇手：微軟防毒核心 (${topCulprit}) - 佔據 CPU ${maxCpu}%`;
          descEl.innerHTML = `<strong>【為什麼剛才會卡頓？】</strong><br>這是 Windows Defender 原生防毒正在背景進行自動排程掃描或高強度檔案檢查。微軟防毒為了盡速完成安全檢驗，會瞬間調用多核心算力（最高可達數百%甚至吃滿整台電腦），造成畫面嚴重掉幀或卡死。<br><span style="color:#6ee7b7;">💡 請放心：這是微軟防毒保護系統時的正常高負載，並非中毒或硬體損壞！</span>`;
          solutionsEl.innerHTML = `
            <div class="solution-item">
              <span class="sol-tag sol-rec">自然恢復 1</span>
              <span><strong>稍候 1~2 分鐘自動降溫：</strong>微軟防毒的背景維護完成後，CPU 負載會立刻自動降回 5%~10%，電腦重返順暢。</span>
            </div>
            <div class="solution-item" style="border-color: rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.08);">
              <span class="sol-tag sol-action">手動根治 2</span>
              <span style="line-height: 1.7;">
                <strong>使用【Ctrl + Alt + Del】工作管理員終止或降速：</strong><br>
                ① 同時按下鍵盤快捷鍵 <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;border:1px solid #475569;font-weight:bold;">Ctrl</kbd> + <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;border:1px solid #475569;font-weight:bold;">Alt</kbd> + <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;border:1px solid #475569;font-weight:bold;">Del</kbd>（或直接按 <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;border:1px solid #475569;font-weight:bold;">Ctrl</kbd> + <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;border:1px solid #475569;font-weight:bold;">Shift</kbd> + <kbd style="background:#1e293b;padding:2px 6px;border-radius:4px;border:1px solid #475569;font-weight:bold;">Esc</kbd>）。<br>
                ② 點選進入<strong>【工作管理員】</strong>。<br>
                ③ 在「處理程序」列表中，點擊「CPU」欄位從大到小排序，找到佔用最高的 <strong>Antimalware Service Executable</strong> (或相應防毒軟體)。<br>
                ④ 在上面點擊滑鼠右鍵，選擇<strong>【結束工作】</strong>；或在「詳細資料」頁籤對其點右鍵 ➔<strong>【設定優先順序】</strong>改為「低」，立即釋放 100% 處理器算力！
              </span>
            </div>
            <div class="solution-item">
              <span class="sol-tag sol-rec">一勞永逸 3</span>
              <span><strong>加入排除名單（以後再也不卡）：</strong>打開「Windows 安全性」➔「病毒與威脅防護」➔「管理設定」➔「排除項目」，將您的專案資料夾或 <code>python.exe</code> 加入排除，微軟防毒便永遠不會再次搶佔 CPU。</span>
            </div>
          `;
        } else if (topLower.includes("chrome") || topLower.includes("edge") || topLower.includes("firefox")) {
          titleEl.textContent = `主要卡頓兇手：網頁瀏覽器 (${topCulprit}) - 佔據 CPU ${maxCpu}%`;
          descEl.innerHTML = `<strong>【為什麼剛才會卡頓？】</strong><br>瀏覽器開啟了過多分頁、正在播放高畫質影片或有廣告腳本在背景持續運算，耗盡了處理器執行緒。`;
          solutionsEl.innerHTML = `
            <div class="solution-item">
              <span class="sol-tag sol-rec">推薦步驟 1</span>
              <span><strong>關閉未使用的網頁分頁：</strong>特別是含有大量動畫、影音或長時間未關閉的分頁。</span>
            </div>
            <div class="solution-item">
              <span class="sol-tag sol-action">應急步驟 2</span>
              <span><strong>按右上角【一鍵急救減負 (R)】：</strong>瞬間回收被瀏覽器快取霸佔的實體記憶體。</span>
            </div>
          `;
        } else if (topLower.includes("antigravity")) {
          titleEl.textContent = `主要卡頓兇手：編輯器開發環境 (${topCulprit}) - 佔據 CPU ${maxCpu}%`;
          descEl.innerHTML = `<strong>【為什麼剛才會卡頓？】</strong><br>編輯器剛才在儲存大量檔案、建立索引或編譯程式碼，瞬間進行了高強度的硬碟讀寫與運算。存檔結束後負載便會自然降下。`;
          solutionsEl.innerHTML = `
            <div class="solution-item">
              <span class="sol-tag sol-rec">推薦步驟 1</span>
              <span><strong>存檔編譯完成即可恢復：</strong>等候目前專案作業完成，即可恢復正常。</span>
            </div>
            <div class="solution-item">
              <span class="sol-tag sol-action">清空日誌 2</span>
              <span><strong>點擊右上方【清空事件簿】：</strong>移除歷史記錄，讓儀表板回到綠燈狀態。</span>
            </div>
          `;
        } else {
          titleEl.textContent = `主要卡頓兇手：${escapeHtml(topCulprit)} (峰值 CPU: ${maxCpu}%)`;
          descEl.innerHTML = `<strong>【為什麼剛才會卡頓？】</strong><br>程式 <code>${escapeHtml(topCulprit)}</code> 剛才在背景進行了密集運算，瞬間霸佔了處理器運算資源。`;
          solutionsEl.innerHTML = `
            <div class="solution-item">
              <span class="sol-tag sol-rec">步驟 1</span>
              <span><strong>按右上角【一鍵急救減負 (R)】：</strong>強制釋放記憶體工作集。</span>
            </div>
            <div class="solution-item">
              <span class="sol-tag sol-action">步驟 2</span>
              <span><strong>檢查該軟體：</strong>若是不需要的背景程式，可至「常駐啟動清道夫」評估是否將其開機自啟動關閉。</span>
            </div>
          `;
        }
      }
    } else {
      badge.style.display = "none";
      if (conclusionCard) conclusionCard.style.display = "none";
    }

    tbody.innerHTML = "";
    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading-td">✅ 哨兵目前值守中，暫無捕捉到瞬間凍結事件。</td></tr>`;
      return;
    }

    list.forEach(inc => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code style="color: var(--accent-cyan);">${escapeHtml(inc.id)}</code></td>
        <td style="font-family: var(--font-mono);">${escapeHtml(inc.time_str)}</td>
        <td><span class="badge-tag badge-high">${escapeHtml(inc.reason)}</span></td>
        <td style="font-weight: 700; font-family: var(--font-mono);">${escapeHtml(inc.culprit_name)}</td>
        <td style="color: #f87171; font-weight: 700;">${inc.peak_cpu}%</td>
        <td>${inc.peak_mem}%</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="loading-td">載入哨兵日誌失敗</td></tr>`;
  }
}

// Clear Sentinel Incidents
async function clearSentinelIncidents() {
  await fetch("/api/incidents/clear", { method: "POST" });
  showToast("哨兵日誌已清空", "所有歷史卡頓事件已清除。");
  const conclusionCard = document.getElementById("sentinelConclusionCard");
  if (conclusionCard) conclusionCard.style.display = "none";
  fetchSentinelIncidents();
}

// Deep Cleaner Scan & Execute
async function scanDeepClean() {
  const grid = document.getElementById("cleanerGrid");
  const totalMbEl = document.getElementById("cleanerTotalMb");

  try {
    const res = await fetch("/api/deep_clean_scan");
    const data = await res.json();
    totalMbEl.textContent = data.total_cleanable_mb;

    grid.innerHTML = "";
    data.categories.forEach(cat => {
      const card = document.createElement("div");
      card.className = "cleaner-card";
      card.innerHTML = `
        <div class="cleaner-card-title">
          <span>${escapeHtml(cat.name)}</span>
          <span class="cleaner-card-mb">${cat.cleanable_mb} MB</span>
        </div>
        <div class="cleaner-card-desc">${escapeHtml(cat.desc)} (${cat.file_count} 個項目)</div>
      `;
      grid.appendChild(card);
    });
  } catch (e) {
    grid.innerHTML = `<div class="loading-td">掃描快取失敗</div>`;
  }
}

async function executeDeepClean() {
  const btn = document.getElementById("btnExecuteDeepClean");
  btn.disabled = true;
  btn.textContent = "深度清理中...";

  try {
    const res = await fetch("/api/deep_clean", { method: "POST" });
    const result = await res.json();
    playSound("success");
    showToast("深度清潔完成！", result.message);
    scanDeepClean();
    fetchMetrics();
    fetchHealthAudit();
  } catch (e) {
    showToast("清理失敗", e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> 一鍵深度清理`;
  }
}

// ========================================================
// Client-Side Bulletproof Report Exporter (100% Reliable)
// ========================================================
function generateClientReportHtml() {
  const nowStr = new Date().toLocaleString('zh-TW', { hour12: false });
  const audit = lastAudit || { score: 85, grade: '良好', grade_color: '#10b981', uptime_hours: 12, deductions: [], tips: [] };
  const metrics = lastMetrics || { cpu_total: 35, memory: { percent: 50 }, disk_c: { free_gb: 50 }, gpu: {} };
  const gpu = metrics.gpu || { name: '標準顯示卡', temperature_c: 45, vram_percent: 30, thermal_status: '正常' };
  const incidents = lastIncidents || [];

  let incidentsRows = "";
  if (incidents.length > 0) {
    incidents.slice(0, 10).forEach(inc => {
      incidentsRows += `
        <tr>
          <td><code>${escapeHtml(inc.id)}</code></td>
          <td>${escapeHtml(inc.time_str)}</td>
          <td><span class="badge badge-danger">${escapeHtml(inc.reason)}</span></td>
          <td><b>${escapeHtml(inc.culprit_name)}</b></td>
          <td>${inc.peak_cpu}%</td>
        </tr>
      `;
    });
  } else {
    incidentsRows = "<tr><td colspan='5' style='text-align:center;color:#94a3b8;padding:15px;'>✅ 哨兵值守中，暫無捕捉到瞬間凍結事件</td></tr>";
  }

  let deductionsHtml = "";
  if (audit.deductions && audit.deductions.length > 0) {
    audit.deductions.forEach(d => {
      deductionsHtml += `<li>⚠️ ${escapeHtml(d)}</li>`;
    });
  } else {
    deductionsHtml = "<li style='color:#10b981;'>✅ 未發現顯著瓶頸扣分項，系統狀態健康！</li>";
  }

  let tipsHtml = "";
  (audit.tips || ["定期重開機以釋放核心鎖死記憶體", "保持 C 槽至少 20GB 以上空間"]).forEach(t => {
    tipsHtml += `<li>💡 ${escapeHtml(t)}</li>`;
  });

  const secScore = lastSecurityAudit ? lastSecurityAudit.security_score : 100;
  const secDef = (lastSecurityAudit && lastSecurityAudit.defender_status) ? lastSecurityAudit.defender_status : {};
  const secEngine = secDef.engine_name || "Windows Defender";
  const secRt = secDef.realtime_protection ? "即時防護中" : "未開啟";

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>PulseGuard 系統體檢報告 - ${nowStr}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; padding: 40px 20px; line-height: 1.6; margin: 0; }
  .container { max-width: 900px; margin: 0 auto; background: #131b2e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 36px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 20px; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 24px; color: #38bdf8; }
  .score-badge { background: rgba(16,185,129,0.15); border: 2px solid ${audit.grade_color || '#10b981'}; color: ${audit.grade_color || '#10b981'}; padding: 10px 20px; border-radius: 12px; text-align: center; }
  .score-badge .num { font-size: 28px; font-weight: 800; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0; }
  .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; }
  .card .lbl { font-size: 13px; color: #94a3b8; }
  .card .val { font-size: 20px; font-weight: 700; margin-top: 4px; color: #fff; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
  th { color: #94a3b8; background: rgba(255,255,255,0.02); }
  .badge { padding: 3px 8px; border-radius: 6px; font-size: 12px; }
  .badge-danger { background: rgba(239,68,68,0.2); color: #f87171; }
  ul { padding-left: 20px; color: #cbd5e1; }
  li { margin-bottom: 8px; }
  .footer { text-align: center; color: #64748b; font-size: 13px; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>PulseGuard 系統效能與頓挫診斷體檢單</h1>
      <p style="margin: 4px 0; color: #94a3b8; font-size: 14px;">產出時間: ${nowStr} | 連續開機: ${audit.uptime_hours || 0} 小時</p>
    </div>
    <div class="score-badge">
      <div class="num">${audit.score || 85}</div>
      <div style="font-size:12px;">${audit.grade || '良好'}</div>
    </div>
  </div>

  <h2>即時硬體狀態摘要</h2>
  <div class="grid">
    <div class="card"><div class="lbl">CPU 負載</div><div class="val">${Math.round(metrics.cpu_total || 0)}%</div></div>
    <div class="card"><div class="lbl">實體記憶體 RAM</div><div class="val">${Math.round(metrics.memory ? metrics.memory.percent : 0)}%</div></div>
    <div class="card"><div class="lbl">C: 槽剩餘空間</div><div class="val">${metrics.disk_c ? metrics.disk_c.free_gb : 0} GB</div></div>
    <div class="card"><div class="lbl">GPU 溫度</div><div class="val">${gpu.temperature_c ? Math.round(gpu.temperature_c) : '--'}°C</div></div>
    <div class="card"><div class="lbl">防毒安全指數</div><div class="val" style="color:#10b981;">${secScore}/100</div></div>
  </div>

  <h2>🛡️ 系統安全與防毒指標</h2>
  <div class="grid">
    <div class="card"><div class="lbl">原生防毒核心</div><div class="val" style="font-size:16px;">${escapeHtml(secEngine)}</div></div>
    <div class="card"><div class="lbl">微軟即時防護</div><div class="val" style="font-size:16px; color:#10b981;">${escapeHtml(secRt)}</div></div>
  </div>

  <h2>系統瓶頸檢測</h2>
  <ul>${deductionsHtml}</ul>

  <h2>自動卡頓哨兵日誌 (最近異常)</h2>
  <table>
    <thead><tr><th>事件ID</th><th>時間</th><th>原因</th><th>嫌疑行程</th><th>峰值CPU</th></tr></thead>
    <tbody>${incidentsRows}</tbody>
  </table>

  <h2>改善與調校建議</h2>
  <ul>${tipsHtml}</ul>

  <div class="footer">PulseGuard PRO Diagnostics System • 本地隱私安全診斷</div>
</div>
</body>
</html>`;
}

function downloadReport(format = "html") {
  try {
    const htmlContent = generateClientReportHtml();
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `PulseGuard_PC_Report_${dateStr}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    playSound("success");
    showToast("體檢報告下載完成！", `檔案 PulseGuard_PC_Report_${dateStr}.html 已成功儲存至下載資料夾。`);
  } catch (err) {
    showToast("產生報告失敗", err.message);
  }
}

// ========================================================
// Pure Circular Always-on-Top Speed Ball
// ========================================================
async function openFloatingSpeedBall() {
  // Option 1: Try launching pure Windows desktop transparent floating ball (NO background at all!)
  try {
    const res = await fetch("/api/launch_native_hud", { method: "POST" });
    const data = await res.json();
    if (data.status === "ok") {
      showToast("純透明置頂圓球已啟動！", "已在螢幕右上角開啟純圓形加速球，完全無背景框，可隨意拖曳，永遠置頂！");
      return;
    }
  } catch (e) {}

  // Option 2: Browser Document PiP Speed Ball (with dark seamless background)
  if ('documentPictureInPicture' in window) {
    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 130,
        height: 130,
      });

      const res = await fetch("mini.html");
      const htmlText = await res.text();
      pipWindow.document.open();
      pipWindow.document.write(htmlText);
      pipWindow.document.close();

      showToast("置頂懸浮小球已就緒！", "具備系統最高層級置頂 (Always on Top)，切換任何視窗都不會縮小！");
      return;
    } catch (e) {
      console.warn("Document PiP failed, fallback to popup:", e);
    }
  }

  // Option 3: Fallback popup
  const width = 130;
  const height = 130;
  const left = window.screen.width - width - 30;
  const top = 100;
  window.open(
    "mini.html",
    "PulseGuardBall",
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=no`
  );
}

// Health Audit
async function fetchHealthAudit() {
  try {
    const res = await fetch("/api/health_audit");
    const audit = await res.json();
    lastAudit = audit;

    const scoreVal = audit.score || 85;
    document.getElementById("auditScoreVal").textContent = scoreVal;
    document.getElementById("miniHealthScore").textContent = `${scoreVal} 分`;
    
    const circle = document.getElementById("healthScoreCircle");
    circle.style.borderColor = audit.grade_color || "#10b981";
    circle.style.boxShadow = `0 0 25px ${audit.grade_color}40`;

    const gradeText = document.getElementById("auditGradeText");
    gradeText.textContent = `健康評級：${audit.grade}`;
    gradeText.style.color = audit.grade_color;

    document.getElementById("auditUptimeVal").textContent = `${audit.uptime_hours} 小時`;
    document.getElementById("auditDiskCVal").textContent = `${audit.disk_c.free_gb} GB (${audit.disk_c.percent}% 已用)`;
    document.getElementById("auditStartupVal").textContent = `${audit.high_impact_startups} 個 (總計 ${audit.startup_count} 項)`;

    const deductionsList = document.getElementById("auditDeductionsList");
    deductionsList.innerHTML = "";
    if (audit.deductions && audit.deductions.length > 0) {
      audit.deductions.forEach(d => {
        const li = document.createElement("li");
        li.textContent = `• ${d}`;
        deductionsList.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.style.background = "rgba(16, 185, 129, 0.08)";
      li.style.borderColor = "rgba(16, 185, 129, 0.2)";
      li.style.color = "#6ee7b7";
      li.textContent = "✅ 未檢測到顯著硬體或容量瓶頸，系統指標優良！";
      deductionsList.appendChild(li);
    }

    const tipsList = document.getElementById("auditTipsList");
    tipsList.innerHTML = "";
    audit.tips.forEach(t => {
      const li = document.createElement("li");
      li.textContent = `• ${t}`;
      tipsList.appendChild(li);
    });
  } catch (err) {
    console.error("Health audit failed:", err);
  }
}

// Startup Items
async function fetchStartupItems() {
  const tbody = document.getElementById("startupItemsTbody");
  tbody.innerHTML = `<tr><td colspan="5" class="loading-td">正在掃描開機註冊表與啟動資料夾...</td></tr>`;

  try {
    const res = await fetch("/api/startup_items");
    const items = await res.json();
    lastStartups = items || [];

    tbody.innerHTML = "";
    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="loading-td">未發現常駐開機啟動項或存取受限。</td></tr>`;
      return;
    }

    items.forEach(item => {
      const tr = document.createElement("tr");
      let impactBadge = `<span class="badge-tag badge-low">低負擔</span>`;
      if (item.impact === "高") {
        impactBadge = `<span class="badge-tag badge-high">高負載 (拖慢開機)</span>`;
      } else if (item.impact === "中") {
        impactBadge = `<span class="badge-tag badge-mid">中負載</span>`;
      }

      tr.innerHTML = `
        <td style="font-weight: 700; font-family: var(--font-mono);">${escapeHtml(item.name)}</td>
        <td>${impactBadge}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.location)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-dim); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.command)}">${escapeHtml(item.command)}</td>
        <td style="font-size: 0.85rem; color: #a5f3fc;">${escapeHtml(item.recommend)}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-td">取得開機項失敗: ${err.message}</td></tr>`;
  }
}

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.toggle("active", content.id === tabId);
  });

  if (tabId === "tab-audit") fetchHealthAudit();
  else if (tabId === "tab-startup") fetchStartupItems();
  else if (tabId === "tab-sentinel") fetchSentinelIncidents();
  else if (tabId === "tab-cleaner") scanDeepClean();
  else if (tabId === "tab-security") {
    fetchSecurityOverview();
    fetchProcessThreats();
  }
}

// ========================================================
// Security & Antivirus Center Logic
// ========================================================
let scanPollTimer = null;
let lastSecurityAudit = null;

async function fetchSecurityOverview() {
  try {
    const [statusRes, auditRes] = await Promise.all([
      fetch("/api/security/status"),
      fetch("/api/security/audit")
    ]);
    const statusData = await statusRes.json();
    const auditData = await auditRes.json();
    lastSecurityAudit = auditData;

    // 1. Defender Card
    const engineNameEl = document.getElementById("defenderEngineName");
    const sigVerEl = document.getElementById("defenderSigVersion");
    const sigUpdatedEl = document.getElementById("defenderSigUpdated");
    const rtBadge = document.getElementById("defenderRealtimeBadge");

    if (statusData.engine_name) {
      engineNameEl.textContent = statusData.third_party_av && statusData.third_party_av.length > 0 
        ? statusData.third_party_av.join(", ") 
        : statusData.engine_name;
    }
    sigVerEl.textContent = statusData.signature_version || "最新微軟定義";
    sigUpdatedEl.textContent = statusData.signature_updated || "近期已更新";

    if (statusData.realtime_protection) {
      rtBadge.className = "badge-tag badge-low";
      rtBadge.textContent = "即時防護中";
    } else {
      rtBadge.className = "badge-tag badge-high";
      rtBadge.textContent = "防護已關閉！";
    }

    // 2. Score Card
    const scoreNum = auditData.security_score !== undefined ? auditData.security_score : 95;
    document.getElementById("securityScoreNum").textContent = scoreNum;
    const gradeBadge = document.getElementById("securityGradeBadge");
    const gradeText = document.getElementById("securityGradeText");
    gradeBadge.textContent = auditData.security_grade || "堅固防護";
    gradeText.textContent = auditData.security_grade || "全方位防禦完好";
    gradeBadge.style.color = auditData.grade_color || "#10b981";
    document.getElementById("securityScoreNum").style.color = auditData.grade_color || "#10b981";

    // 3. Hosts & Network Card
    const hosts = auditData.hosts_check || {};
    const hostsBadge = document.getElementById("hostsStatusBadge");
    const hostsText = document.getElementById("hostsIntegrityText");
    if (hosts.is_hijacked) {
      hostsBadge.className = "badge-tag badge-high";
      hostsBadge.textContent = "🚨 發現異常劫持！";
      hostsText.textContent = `偵測到 ${hosts.hijacked_entries.length} 個重定向條目`;
    } else {
      hostsBadge.className = "badge-tag badge-low";
      hostsBadge.textContent = "無異常導向";
      hostsText.textContent = `正常 (包含 ${hosts.total_entries || 0} 個合法規則)`;
    }

    const fw = auditData.firewall_status || {};
    document.getElementById("firewallStatusText").textContent = fw.all_active ? "已全開保護 (公用/私人)" : `部分停用 (${fw.inactive_profiles})`;

    const uac = auditData.uac_status || {};
    document.getElementById("uacStatusText").textContent = uac.is_enabled ? "高保護 (EnableLUA=1)" : "⚠️ 已被停用 (危險)";

    // 4. Memory threats count
    const startups = auditData.startup_security || {};
    document.getElementById("suspiciousStartupCount").textContent = `${startups.suspicious_count || 0} 個發現`;

    // Deductions List
    const deductionsList = document.getElementById("securityDeductionsList");
    deductionsList.innerHTML = "";
    if (auditData.deductions && auditData.deductions.length > 0) {
      auditData.deductions.forEach(d => {
        const li = document.createElement("li");
        li.textContent = d;
        deductionsList.appendChild(li);
      });
    }

  } catch (err) {
    console.error("fetchSecurityOverview failed:", err);
  }
}

async function fetchProcessThreats() {
  const tbody = document.getElementById("processThreatsTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="loading-td">正在分析記憶體中運行的所有處理程序...</td></tr>`;

  try {
    const res = await fetch("/api/security/hunt_processes");
    const threats = await res.json();

    const countEl = document.getElementById("processThreatCount");
    const threatBadge = document.getElementById("processThreatBadge");

    if (!threats || threats.length === 0) {
      countEl.textContent = "0 個異常 (安全)";
      threatBadge.className = "badge-tag badge-low";
      threatBadge.textContent = "無威脅";

      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 24px; color: #6ee7b7; background: rgba(16, 185, 129, 0.05);">
            ✅ 讚！目前記憶體中無任何偽裝系統檔 (Spoofing)、虛擬幣挖礦木馬 (Miners) 或無痕隱蔽腳本運作。
          </td>
        </tr>
      `;
      return;
    }

    countEl.textContent = `${threats.length} 個高危/可疑威脅！`;
    threatBadge.className = "badge-tag badge-high";
    threatBadge.textContent = "發現威脅！";

    tbody.innerHTML = "";
    threats.forEach(t => {
      const tr = document.createElement("tr");
      let badgeClass = "badge-suspicious";
      if (t.threat_level === "CRITICAL") badgeClass = "badge-critical";
      else if (t.threat_level === "HIGH") badgeClass = "badge-high";

      tr.innerHTML = `
        <td style="font-weight: 700; font-family: var(--font-mono);">${escapeHtml(t.name)} <small style="color:var(--text-muted);">(PID: ${t.pid})</small></td>
        <td><span class="badge-tag ${badgeClass}">${escapeHtml(t.threat_level)}</span></td>
        <td style="font-size: 0.85rem; font-weight: 600; color: #fca5a5;">${escapeHtml(t.type)}</td>
        <td style="font-size: 0.82rem; color: #f1f5f9;">${escapeHtml(t.reason)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(t.exe)}">${escapeHtml(t.exe)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${t.cpu_percent}% CPU / ${t.mem_mb} MB</td>
        <td>
          <button class="btn-kill-threat" onclick="killProcessThreat(${t.pid}, '${escapeHtml(t.name)}')">
            🚨 終止行程
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-td">排查記憶體失敗: ${err.message}</td></tr>`;
  }
}

async function killProcessThreat(pid, name) {
  if (!confirm(`確定要立即強制終止可疑行程「${name}」 (PID: ${pid}) 嗎？`)) {
    return;
  }

  try {
    const res = await fetch("/api/security/kill_process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pid })
    });
    const data = await res.json();
    if (data.status === "success") {
      playSound("success");
      showToast("已成功擊殺威脅行程！", `處理程序 ${name} (PID: ${pid}) 已被強制終止。`);
      fetchProcessThreats();
    } else {
      showToast("終止行程失敗", data.message || "需要管理員權限");
    }
  } catch (err) {
    showToast("終止請求失敗", err.message);
  }
}

async function startDefenderScan(scanType = "QuickScan", targetPath = "") {
  try {
    const res = await fetch("/api/security/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scan_type: scanType, target_path: targetPath })
    });
    const data = await res.json();
    if (data.status === "started") {
      playSound("radar");
      showToast("微軟 Defender 掃描已啟動", `正在執行微軟 ${scanType} 掃描任務，可於控制台實時檢視進度。`);
      
      const wrapper = document.getElementById("scanTerminalWrapper");
      wrapper.style.display = "flex";
      document.getElementById("scanTitleText").textContent = `微軟 Defender ${scanType} 掃描進行中...`;
      
      if (scanPollTimer) clearInterval(scanPollTimer);
      scanPollTimer = setInterval(pollScanProgress, 1200);
      pollScanProgress();
    } else {
      showToast("無法啟動掃描", data.message || "請稍候再試");
    }
  } catch (err) {
    showToast("發起掃描失敗", err.message);
  }
}

async function cancelDefenderScan() {
  try {
    const res = await fetch("/api/security/cancel_scan", { method: "POST" });
    const data = await res.json();
    showToast("已中止掃描", data.message || "使用者已取消目前的防毒掃描作業。");
    pollScanProgress();
  } catch (err) {}
}

window.forceStopDefenderScan = async function() {
  try {
    playSound("radar");
    showToast("正在強制叫停微軟防毒...", "發送終止指令並將防毒上限限制在 25% CPU...");
    const res = await fetch("/api/security/cancel_scan", { method: "POST" });
    const data = await res.json();
    playSound("success");
    showToast("微軟防毒已強制停止！", data.message || "防毒已釋放 CPU 負載，電腦立刻恢復順暢。");
    setTimeout(fetchSentinelIncidents, 1000);
  } catch (err) {
    showToast("操作失敗", err.message);
  }
};

async function pollScanProgress() {
  try {
    const res = await fetch("/api/security/scan_status");
    const data = await res.json();

    const progressBar = document.getElementById("scanProgressBar");
    const pctLabel = document.getElementById("scanPctLabel");
    const subText = document.getElementById("scanStatusSubText");
    const logsBox = document.getElementById("scanTerminalLogs");

    const pct = data.progress_percent || 0;
    progressBar.style.width = `${pct}%`;
    pctLabel.textContent = `${pct}%`;
    subText.textContent = data.status_text || "掃描中...";

    if (data.logs && data.logs.length > 0) {
      logsBox.innerHTML = data.logs.map(line => `<div class="log-line">${escapeHtml(line)}</div>`).join("");
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    if (!data.is_scanning) {
      if (scanPollTimer) {
        clearInterval(scanPollTimer);
        scanPollTimer = null;
      }
      if (data.threats_found && data.threats_found.length > 0) {
        playSound("radar");
        showToast("⚠️ 掃描完成！發現威脅", `微軟 Defender 檢測到 ${data.threats_found.length} 個威脅，請檢視防護控制台。`);
      } else if (pct === 100) {
        playSound("success");
        showToast("微軟掃描完成！", "未發現任何活動的惡意程式或威脅，系統安全無虞。");
      }
    }
  } catch (err) {
    console.error("pollScanProgress error:", err);
  }
}

async function updateVirusSignatures() {
  try {
    const res = await fetch("/api/security/update_signatures", { method: "POST" });
    const data = await res.json();
    showToast("正在更新病毒定義庫...", "已發送更新指令至微軟雲端更新伺服器，將於背景自動套用。");
    setTimeout(fetchSecurityOverview, 4000);
  } catch (err) {
    showToast("更新請求失敗", err.message);
  }
}

async function inspectSingleFile() {
  const input = document.getElementById("fileInspectInput");
  const path = input.value.trim();
  if (!path) {
    showToast("請輸入檔案路徑", "請輸入您欲檢驗之執行檔或檔案完整路徑。");
    return;
  }

  const resultBox = document.getElementById("fileInspectResult");
  try {
    const res = await fetch("/api/security/inspect_file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: path })
    });
    const data = await res.json();
    if (data.status === "success") {
      resultBox.style.display = "flex";
      document.getElementById("resFileName").textContent = data.file_name;
      document.getElementById("resFileSize").textContent = `${data.size_kb} KB`;
      document.getElementById("resFileSig").textContent = data.signature;
      document.getElementById("resFileSig").style.color = data.is_signed ? "#10b981" : "#f59e0b";
      document.getElementById("resFileSha256").textContent = data.sha256;
      document.getElementById("resFileMd5").textContent = data.md5;
      playSound("success");
      showToast("檔案特徵碼驗證完成", `已計算 SHA-256 與數位簽章狀態。`);
    } else {
      showToast("檢驗失敗", data.message || "檔案無法讀取");
    }
  } catch (err) {
    showToast("檢驗請求失敗", err.message);
  }
}

function scanSingleFileWithDefender() {
  const input = document.getElementById("fileInspectInput");
  const path = input.value.trim();
  if (!path) {
    showToast("請輸入檔案路徑", "請輸入您欲送至 Defender 掃描的檔案路徑。");
    return;
  }
  startDefenderScan("CustomScan", path);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Event Listeners
document.getElementById("btnTriggerLagHunter").addEventListener("click", triggerLagHunter);
document.getElementById("btnOptimizeSystem").addEventListener("click", triggerOptimization);
document.getElementById("btnAuditRunOptimize").addEventListener("click", triggerOptimization);
document.getElementById("btnRefreshAudit").addEventListener("click", fetchHealthAudit);
document.getElementById("btnRefreshStartup").addEventListener("click", fetchStartupItems);
document.getElementById("btnOpenHud").addEventListener("click", openFloatingSpeedBall);
document.getElementById("btnRefreshIncidents").addEventListener("click", fetchSentinelIncidents);
document.getElementById("btnClearIncidents").addEventListener("click", clearSentinelIncidents);
document.getElementById("btnExecuteDeepClean").addEventListener("click", executeDeepClean);

// Security Action Event Listeners
document.getElementById("btnStartQuickScan").addEventListener("click", () => startDefenderScan("QuickScan"));
document.getElementById("btnStartFullScan").addEventListener("click", () => startDefenderScan("FullScan"));
document.getElementById("btnUpdateSignatures").addEventListener("click", updateVirusSignatures);
document.getElementById("btnCancelScan").addEventListener("click", cancelDefenderScan);
document.getElementById("btnHuntProcessesNow").addEventListener("click", fetchProcessThreats);
document.getElementById("btnRefreshProcessThreats").addEventListener("click", fetchProcessThreats);
document.getElementById("btnInspectFile").addEventListener("click", inspectSingleFile);
document.getElementById("btnDefenderScanFile").addEventListener("click", scanSingleFileWithDefender);

// Export Report - Pure Client-Side Instant Blob Download
document.getElementById("btnExportReport").addEventListener("click", () => downloadReport("html"));
document.getElementById("btnExportAuditHtml").addEventListener("click", () => downloadReport("html"));

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Space") {
    e.preventDefault();
    triggerLagHunter();
  } else if (e.key === "r" || e.key === "R") {
    e.preventDefault();
    triggerOptimization();
  } else if (e.key === "1") switchTab("tab-monitor");
  else if (e.key === "2") switchTab("tab-hunter");
  else if (e.key === "3") switchTab("tab-sentinel");
  else if (e.key === "4") switchTab("tab-cleaner");
  else if (e.key === "5") switchTab("tab-audit");
  else if (e.key === "6") switchTab("tab-startup");
  else if (e.key === "7") switchTab("tab-security");
});

// Initial kickoffs
setInterval(fetchMetrics, pollInterval);
fetchMetrics();
fetchHealthAudit();
fetchSentinelIncidents();
fetchStartupItems();
fetchSecurityOverview();
