$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\DSBooksThumbnailHelper'
$LinkPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DSBooks 表紙キャッシュ.lnk'
Remove-Item $LinkPath -Force -ErrorAction SilentlyContinue
Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'DSBooks 表紙キャッシュをアンインストールしました。NAS上の _DSBooksCache は削除していません。' -ForegroundColor Green
Read-Host 'Enterで終了'
