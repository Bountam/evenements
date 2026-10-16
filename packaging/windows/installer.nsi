; Installeur Windows d'Insertech Événements : installation par utilisateur, sans droits d'administrateur.
;   makensis -DVERSION=1.2.3 -DEXE=<chemin absolu de InsertechEvenements.exe> -DOUTFILE=<chemin absolu de sortie> packaging/windows/installer.nsi
; makensis se place dans le dossier de ce script : les chemins relatifs partent d'ici.
Unicode true
SetCompressor /SOLID lzma

!ifndef VERSION
  !error "Passer -DVERSION=X.Y.Z"
!endif
!ifndef EXE
  !error "Passer -DEXE=chemin vers InsertechEvenements.exe"
!endif
!ifndef OUTFILE
  !define OUTFILE "InsertechEvenements-Setup-${VERSION}.exe"
!endif

!define APP_NAME "Insertech Événements"
!define APP_ID "InsertechEvenements"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
Icon "../../app.ico"
UninstallIcon "../../app.ico"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${APP_ID}"
InstallDirRegKey HKCU "Software\${APP_ID}" "InstallDir"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "Insertech Angus"
VIAddVersionKey "FileDescription" "Installeur ${APP_NAME}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright © 2026 Insertech"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!define MUI_ICON "../../app.ico"
!define MUI_UNICON "../../app.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\InsertechEvenements.exe"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "French"

Section "Installer"
  ; Le lanceur reste ouvert depuis la v1.2.6 : attendre sa fermeture ou l'arrêter avant de remplacer l'exécutable
  IfSilent 0 +2
    Sleep 600
  nsExec::Exec 'taskkill /F /IM InsertechEvenements.exe'
  Pop $0
  Sleep 300

  SetOutPath "$INSTDIR"
  File "/oname=InsertechEvenements.exe" "${EXE}"
  WriteUninstaller "$INSTDIR\Desinstaller.exe"

  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\InsertechEvenements.exe"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\InsertechEvenements.exe"

  WriteRegStr HKCU "Software\${APP_ID}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Insertech Angus"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\InsertechEvenements.exe"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Desinstaller.exe"'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1

  ; En mise à jour silencieuse (/S /RELANCER), relancer l'application une fois le nouvel exécutable en place
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RELANCER" $R1
  IfErrors pas_de_relance 0
    Exec '"$INSTDIR\InsertechEvenements.exe" --maj-terminee=${VERSION}'
  pas_de_relance:
SectionEnd

; Les données (événements, participants, tirages) restent dans %LOCALAPPDATA%\InsertechEvenements :
; la désinstallation ne les efface pas.
Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM InsertechEvenements.exe'
  Pop $0
  Sleep 200
  Delete "$INSTDIR\InsertechEvenements.exe"
  Delete "$INSTDIR\Desinstaller.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "Software\${APP_ID}"
SectionEnd
