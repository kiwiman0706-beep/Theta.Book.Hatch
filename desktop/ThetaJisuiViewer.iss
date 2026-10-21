; Theta.Jisui.Viewer for Windows (Inno Setup 6): the DSBooks viewer without NAS, opening .jisui (jisui-1) by double-click.
; Built by .github/workflows/release-jisui-viewer.yml. FullOCR bundles this installer and may run it silently:
;   ThetaJisuiViewer-Setup-<ver>.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
#define MyAppName "Theta.Jisui.Viewer"
#ifndef MyAppVersion
  #define MyAppVersion "0.2.4"
#endif
#define MyAppExeName "ThetaJisuiViewer.exe"

[Setup]
AppId={{9C3D5E1B-2A47-4F6C-8B1E-7A54C0D3E9F2}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Theta Corp
DefaultDirName={localappdata}\Programs\ThetaJisuiViewer
DefaultGroupName=Theta.Jisui.Viewer
DisableProgramGroupPage=yes
OutputDir=dist-installer
OutputBaseFilename=ThetaJisuiViewer-Setup-{#MyAppVersion}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
ChangesAssociations=yes

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "デスクトップにショートカットを作成"; GroupDescription: "追加アイコン:"; Flags: unchecked

[Files]
Source: "dist\ThetaJisuiViewer\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; .jisui -> this viewer (per user, HKCU\Software\Classes). Removed again on uninstall.
Root: HKA; Subkey: "Software\Classes\.jisui"; ValueType: string; ValueName: ""; ValueData: "Theta.Jisui"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.jisui"; ValueType: string; ValueName: "Content Type"; ValueData: "application/x-jisui"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\Theta.Jisui"; ValueType: string; ValueName: ""; ValueData: "自炊本（.jisui）"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Theta.Jisui\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName},0"
Root: HKA; Subkey: "Software\Classes\Theta.Jisui\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Icons]
Name: "{autoprograms}\Theta.Jisui.Viewer"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Theta.Jisui.Viewer"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Theta.Jisui.Viewer を起動"; Flags: postinstall nowait skipifsilent
; Reading positions and notes in %LOCALAPPDATA%\Theta\JisuiViewer are kept on uninstall. .jisui files are never changed.
