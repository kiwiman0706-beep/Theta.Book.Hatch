$ErrorActionPreference = 'Stop'
$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\DSBooksThumbnailHelper'
$PythonExe = $null
if (Get-Command py -ErrorAction SilentlyContinue) { $PythonExe = (& py -3 -c "import sys; print(sys.executable)" 2>$null) }
if (-not $PythonExe -and (Get-Command python -ErrorAction SilentlyContinue)) { $PythonExe = (& python -c "import sys; print(sys.executable)" 2>$null) }
if (-not $PythonExe -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    $installPython = Read-Host 'Python 3.10以降が見つかりません。wingetでPython 3.12をインストールしますか？ (Y/N)'
    if ($installPython -match '^[Yy]') {
        & winget install --id Python.Python.3.12 -e --scope user --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw 'Pythonのインストールに失敗しました。' }
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
        if (Get-Command py -ErrorAction SilentlyContinue) { $PythonExe = (& py -3 -c "import sys; print(sys.executable)" 2>$null) }
        if (-not $PythonExe) {
            $PythonInstall = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python*') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
            if ($PythonInstall) { $PythonExe = Join-Path $PythonInstall.FullName 'python.exe' }
        }
    }
}
if (-not $PythonExe) {
    Write-Host 'Python 3.10以降をインストールしてから、もう一度setup.batを実行してください。' -ForegroundColor Yellow
    Read-Host 'Enterで終了'
    exit 1
}
$PythonExe = $PythonExe.Trim()
$PythonVersion = & $PythonExe -c "import sys; print('%d.%d' % sys.version_info[:2])"
if ([version]$PythonVersion -lt [version]'3.10') {
    Write-Host 'Python 3.10以降が必要です。Pythonを更新してから再実行してください。' -ForegroundColor Yellow
    Read-Host 'Enterで終了'
    exit 1
}
$Pythonw = Join-Path (Split-Path $PythonExe) 'pythonw.exe'

Write-Host '必要な画像処理部品を準備しています…'
& $PythonExe -m pip install --user -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw '必要な部品のインストールに失敗しました。ネット接続を確認して再実行してください。' }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'dsbooks_thumbnail_gui.pyw') $InstallDir -Force
Copy-Item (Join-Path $PSScriptRoot 'dsbooks_thumbnails.py') $InstallDir -Force
Copy-Item (Join-Path $PSScriptRoot 'dsbooks_metadata.py') $InstallDir -Force
$Programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$LinkPath = Join-Path $Programs 'DSBooks 表紙キャッシュ.lnk'
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($LinkPath)
$Shortcut.TargetPath = $Pythonw
$Shortcut.Arguments = '"' + (Join-Path $InstallDir 'dsbooks_thumbnail_gui.pyw') + '"'
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Description = 'DSBooks用のNAS表紙キャッシュを作成'
$Shortcut.Save()
Write-Host 'インストールしました。スタートメニューの「DSBooks 表紙キャッシュ」から起動できます。' -ForegroundColor Green
Read-Host 'Enterで終了'
