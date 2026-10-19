# Windows: start FastAPI (:8000) and Next.js (:3000) in two windows.
# First run:  .\start.ps1 -Install
param([switch]$Install)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$py = "backend\.venv\Scripts\python.exe"
if ($Install -or -not (Test-Path $py)) {
    python -m venv backend\.venv
    & $py -m pip install -r backend\requirements.txt
}
if ($Install -or -not (Test-Path "frontend\node_modules")) {
    Push-Location frontend; npm install; Pop-Location
}
if (-not (Test-Path "frontend\.env.local")) {
    # WriteAllText avoids the BOM that PowerShell 5.1's Out-File adds, which breaks the first env key
    [IO.File]::WriteAllText("$PSScriptRoot\frontend\.env.local", "NEXT_PUBLIC_API_URL=http://localhost:8000`n")
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$PSScriptRoot\$py' -m uvicorn app.main:app --app-dir '$PSScriptRoot\backend' --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\frontend'; npm run dev"

Write-Host "Backend  -> http://localhost:8000/docs"
Write-Host "Frontend -> http://localhost:3000"
