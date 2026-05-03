; Custom NSIS hooks for the TCG Snipers installer.
;
; The desktop app spawns a bundled Node.js child process (api-server) that
; holds open files inside the install dir. NSIS's default "is the app
; running?" check only looks for the main exe — it misses the child, which
; causes the installer to bail out with "TCG Snipers is running" even after
; the user closes the window. Below we forcibly terminate any running
; instance (main exe + bundled node child) before NSIS attempts to write
; files, so installs and updates always proceed cleanly.

!macro customInit
  DetailPrint "Stopping any running TCG Snipers processes..."
  nsExec::Exec 'taskkill /F /IM "TCG Snipers.exe" /T'
  Pop $0
  ; Give Windows a moment to release file handles before we start writing.
  Sleep 800
!macroend

!macro customUnInit
  DetailPrint "Stopping any running TCG Snipers processes..."
  nsExec::Exec 'taskkill /F /IM "TCG Snipers.exe" /T'
  Pop $0
  Sleep 800
!macroend
