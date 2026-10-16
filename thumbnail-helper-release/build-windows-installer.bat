@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.10以降が必要です。
  pause
  exit /b 1
)
where ISCC.exe >nul 2>nul
if errorlevel 1 (
  echo Inno Setup 6が必要です: https://jrsoftware.org/isinfo.php
  pause
  exit /b 1
)
py -3 -m pip install --user -r requirements.txt pyinstaller
if errorlevel 1 exit /b 1
py -3 -m PyInstaller --noconfirm --clean --onefile --windowed --name DSBooksThumbnailHelper --paths "." --collect-all fitz --collect-all mutagen --collect-all PIL "dsbooks_thumbnail_gui.pyw"
if errorlevel 1 exit /b 1
ISCC.exe DSBooksThumbnailHelper.iss
if errorlevel 1 exit /b 1
echo.
echo インストーラー: dist-installer\DSBooks-Thumbnail-Helper-Setup-0.3.1.exe
pause
popd
