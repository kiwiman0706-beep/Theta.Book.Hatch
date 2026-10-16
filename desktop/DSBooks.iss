; DSBooks for Windows installer (Inno Setup 6). Built by .github/workflows/release-desktop.yml.
#define MyAppName "DSBooks"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppExeName "DSBooks.exe"

[Setup]
AppId={{4E0B7C2A-6F51-4D59-9A2E-DB00C1A1D5B1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=DSBooks
DefaultDirName={localappdata}\Programs\DSBooks
DefaultGroupName=DSBooks
DisableProgramGroupPage=yes
OutputDir=dist-installer
OutputBaseFilename=DSBooks-Setup-{#MyAppVersion}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "デスクトップにショートカットを作成"; GroupDescription: "追加アイコン:"
Name: "startup"; Description: "Windowsの起動時にバックグラウンドで起動する（DeskHatchのドロワーで使う場合）"; GroupDescription: "起動:"; Flags: unchecked

[Files]
Source: "dist\DSBooks\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\DSBooks"; Filename: "{app}\{#MyAppExeName}"
Name: "{autoprograms}\DSBooks ライブラリ管理（表紙キャッシュ）"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--library-tools"
Name: "{autodesktop}\DSBooks"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\DSBooks（バックグラウンド）"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--background"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "DSBooksを起動"; Flags: postinstall nowait skipifsilent

; The library, reading positions and downloaded books in %LOCALAPPDATA%\DSBooks are kept on uninstall.
