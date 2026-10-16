#define MyAppName "DSBooks 表紙キャッシュ"
#define MyAppVersion "0.3.1"
#define MyAppPublisher "DSBooks"
#define MyAppExeName "DSBooksThumbnailHelper.exe"

[Setup]
AppId={{C515A540-9538-43FC-A7C2-623B4D7A1001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\DSBooksThumbnailHelper
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist-installer
OutputBaseFilename=DSBooks-Thumbnail-Helper-Setup-{#MyAppVersion}
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "デスクトップにショートカットを作成"; GroupDescription: "追加アイコン:"; Flags: unchecked

[Files]
Source: "dist\DSBooksThumbnailHelper.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\DSBooks 表紙キャッシュ"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\DSBooks 表紙キャッシュ"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "DSBooks 表紙キャッシュを起動"; Flags: postinstall nowait skipifsilent
