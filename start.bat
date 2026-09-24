@chcp 65001 >nul
@echo off
title PulseGuard PRO - PC Lag Diagnostics
echo ========================================================
echo   PulseGuard PRO 電腦頓挫黑盒子與效能診斷系統
echo ========================================================
echo.

REM Check and terminate old process holding port 8899
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8899 ^| findstr LISTENING') do (
    echo [提示] 偵測到連接埠 8899 被佔用 (PID: %%a)，正在釋放...
    taskkill /f /pid %%a >nul 2>&1
)

echo 正在檢查 Python 執行環境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 找不到 Python！請確認已安裝 Python 並將其加入系統 PATH。
    pause
    exit /b
)

echo 正在啟動 PulseGuard PRO 診斷與防毒伺服器...
python app.py
pause
