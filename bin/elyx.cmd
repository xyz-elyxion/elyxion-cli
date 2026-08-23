@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%..\build\Release\elyxion.exe" (
  "%SCRIPT_DIR%..\build\Release\elyxion.exe" --package-manager %*
) else (
  "%SCRIPT_DIR%elyxion.exe" --package-manager %*
)
exit /b %ERRORLEVEL%
