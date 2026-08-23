@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%..\build\Release\elyxion.exe" (
  "%SCRIPT_DIR%..\build\Release\elyxion.exe" %*
) else (
  "%SCRIPT_DIR%elyxion.exe" %*
)
exit /b %ERRORLEVEL%
