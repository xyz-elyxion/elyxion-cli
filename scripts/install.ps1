# install.ps1 — Elyxion installer for Windows
#
# Usage (PowerShell):
#   iwr -useb https://raw.githubusercontent.com/<repo>/main/scripts/install.ps1 | iex
#
# Or download and run:
#   .\install.ps1
#
# What it does:
#   1. Detects your architecture
#   2. Downloads the latest Elyxion release from GitHub
#   3. Extracts to %LOCALAPPDATA%\Elyxion\
#   4. Adds elyxion and elyx to your user PATH
#
# Set $env:ELYXION_VERSION to pin a specific release (e.g. v1.0.0).
# Set $env:ELYXION_INSTALL_DIR to change the install directory.

param()

$ErrorActionPreference = "Stop"

# ---- Configuration ------------------------------------------------
$Repo = if ($env:ELYXION_REPO) { $env:ELYXION_REPO } else { "elyxion-js/elyxion" }
$Version = if ($env:ELYXION_VERSION) { $env:ELYXION_VERSION } else { "latest" }
$InstallDir = if ($env:ELYXION_INSTALL_DIR) { $env:ELYXION_INSTALL_DIR } else { "$env:LOCALAPPDATA\Elyxion" }

# ---- Platform detection --------------------------------------------
$Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "ia32" }
$ArchiveName = "elyxion-windows-x64"

Write-Host "[elyxion] Platform: windows/$Arch" -ForegroundColor Cyan
Write-Host "[elyxion] Install directory: $InstallDir" -ForegroundColor Cyan

# ---- Determine release URL -----------------------------------------
$ReleaseUrl = "https://github.com/$Repo/releases"
if ($Version -eq "latest") {
    $DownloadUrl = "$ReleaseUrl/latest/download/$ArchiveName.zip"
} else {
    $DownloadUrl = "$ReleaseUrl/download/$Version/$ArchiveName.zip"
}

# ---- Download & extract --------------------------------------------
$TempDir = Join-Path $env:TEMP "elyxion-install-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
$ZipPath = Join-Path $TempDir "elyxion.zip"

Write-Host "[elyxion] Downloading Elyxion..." -ForegroundColor Cyan

try {
    # Try with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing
} catch {
    Write-Host "[elyxion] Download failed: $_" -ForegroundColor Red
    Write-Host "[elyxion] Check your internet connection or try a specific version:" -ForegroundColor Red
    Write-Host "[elyxion]   `$env:ELYXION_VERSION='v1.0.0'; .\install.ps1" -ForegroundColor Red
    exit 1
}

# Verify the download
$ZipSize = (Get-Item $ZipPath).Length
if ($ZipSize -lt 1024) {
    Write-Host "[elyxion] Downloaded file is too small — it may be a GitHub error page." -ForegroundColor Red
    if ($Version -eq "latest") {
        Write-Host "[elyxion] Try pinning a version: `$env:ELYXION_VERSION='v1.0.0'; .\install.ps1" -ForegroundColor Red
    }
    exit 1
}

# Remove any previous install
if (Test-Path $InstallDir) {
    Write-Host "[elyxion] Removing previous installation at $InstallDir" -ForegroundColor Cyan
    Remove-Item -Recurse -Force $InstallDir
}

Write-Host "[elyxion] Extracting to $InstallDir..." -ForegroundColor Cyan
Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force

# Clean up temp
Remove-Item -Recurse -Force $TempDir

# ---- Setup PATH ----------------------------------------------------
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$BinDir = "$InstallDir\bin"

# Create bin directory and wrapper scripts if needed
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}

# Create elyxion.cmd wrapper
@"
@echo off
setlocal
set "ELYXION_HOME=%ELYXION_HOME%"
if "%ELYXION_HOME%"=="" set "ELYXION_HOME=$InstallDir"
"%ELYXION_HOME%\elyxion.exe" %*
exit /b %ERRORLEVEL%
"@ | Out-File -FilePath "$BinDir\elyxion.cmd" -Encoding ASCII

# Create elyx.cmd wrapper
@"
@echo off
setlocal
set "ELYXION_HOME=%ELYXION_HOME%"
if "%ELYXION_HOME%"=="" set "ELYXION_HOME=$InstallDir"
"%ELYXION_HOME%\elyxion.exe" --package-manager %*
exit /b %ERRORLEVEL%
"@ | Out-File -FilePath "$BinDir\elyx.cmd" -Encoding ASCII

# Add to PATH if not already present
if ($UserPath -notlike "*$BinDir*") {
    Write-Host "[elyxion] Adding $BinDir to your user PATH..." -ForegroundColor Cyan
    [Environment]::SetEnvironmentVariable(
        "PATH",
        "$UserPath;$BinDir",
        "User"
    )

    # Update current session PATH too
    $env:PATH = "$env:PATH;$BinDir"
} else {
    Write-Host "[elyxion] $BinDir is already on your PATH." -ForegroundColor Green
}

# ---- Verify installation -------------------------------------------
$ElyxionExe = "$InstallDir\elyxion.exe"
if (Test-Path $ElyxionExe) {
    $ElyxionVersion = & $ElyxionExe --version 2>&1
    Write-Host ""
    Write-Host "[elyxion] Elyxion $ElyxionVersion installed successfully!" -ForegroundColor Green
} else {
    Write-Host "[elyxion] elyxion.exe not found in $InstallDir" -ForegroundColor Red
    Write-Host "[elyxion] The release archive may have a different structure." -ForegroundColor Red
    exit 1
}

# ---- Done ----------------------------------------------------------
Write-Host ""
Write-Host "  Quick start:" -ForegroundColor White
Write-Host "    elyxion --version" -ForegroundColor White
Write-Host "    elyxion --repl" -ForegroundColor White
Write-Host "    elyx init" -ForegroundColor White
Write-Host "    elyx install <package>" -ForegroundColor White
Write-Host ""
Write-Host "  To uninstall:" -ForegroundColor White
Write-Host "    Remove-Item -Recurse -Force $InstallDir" -ForegroundColor White
Write-Host "    (Then remove $BinDir from your PATH via System Properties)" -ForegroundColor White
Write-Host ""

# Refresh the current terminal's PATH
Write-Host "[elyxion] Restart your terminal or run 'refreshenv' to use elyxion immediately." -ForegroundColor Yellow