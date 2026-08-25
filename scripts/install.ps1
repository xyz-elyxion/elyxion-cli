# install.ps1 — Elyxion installer for Windows
#
# Open PowerShell and run:
#   iwr -useb https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.ps1 | iex
#
# Or save the script and run:
#   .\install.ps1
#
# Set $env:ELYXION_VERSION to pin a specific release (e.g. v1.0.0).
# Set $env:ELYXION_INSTALL_DIR to change the install directory.

# Show errors and keep the window open if something fails
$ErrorActionPreference = "Continue"
$host.UI.RawUI.WindowTitle = "Elyxion Installer"

# ---- Configuration ------------------------------------------------
$Repo    = if ($env:ELYXION_REPO)    { $env:ELYXION_REPO }    else { "xyz-elyxion/elyxion-cli" }
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
try { New-Item -ItemType Directory -Force -Path $TempDir | Out-Null } catch {
    Write-Host "[elyxion] Cannot create temp directory: $_" -ForegroundColor Red
    Write-Host "Press any key to exit..." ; $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
$ZipPath = Join-Path $TempDir "elyxion.zip"

Write-Host "[elyxion] Downloading Elyxion..." -ForegroundColor Cyan
Write-Host "[elyxion] $DownloadUrl" -ForegroundColor DarkGray

try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing
} catch {
    Write-Host "[elyxion] Download failed: $_" -ForegroundColor Red
    Write-Host "[elyxion] Check your internet connection or try a specific version:" -ForegroundColor Red
    Write-Host "[elyxion]   `$env:ELYXION_VERSION='v1.0.0'; .\install.ps1" -ForegroundColor Red
    Write-Host "Press any key to exit..." ; $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Verify the download looks valid (not a GitHub HTML page)
$ZipSize = (Get-Item $ZipPath).Length
if ($ZipSize -lt 1024) {
    Write-Host "[elyxion] Downloaded file is too small ($ZipSize bytes) — it may be a GitHub error page." -ForegroundColor Red
    Write-Host "[elyxion] This usually means no releases exist yet, or the version tag is wrong." -ForegroundColor Red
    if ($Version -eq "latest") {
        Write-Host "[elyxion] Try pinning a specific version: `$env:ELYXION_VERSION='v1.0.0'; .\install.ps1" -ForegroundColor Red
    }
    Write-Host "Press any key to exit..." ; $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Remove previous install
if (Test-Path $InstallDir) {
    Write-Host "[elyxion] Removing previous installation at $InstallDir" -ForegroundColor Cyan
    try { Remove-Item -Recurse -Force $InstallDir -ErrorAction Stop } catch {
        Write-Host "[elyxion] Warning: could not fully clean old install (files may be in use)" -ForegroundColor Yellow
    }
}

Write-Host "[elyxion] Extracting to $InstallDir..." -ForegroundColor Cyan
try {
    Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
} catch {
    Write-Host "[elyxion] Extraction failed: $_" -ForegroundColor Red
    Write-Host "Press any key to exit..." ; $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Clean up temp
try { Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue } catch {}

# ---- Locate binary ------------------------------------------------
$BinDir = "$InstallDir\bin"
$ElyxionExe = "$BinDir\elyxion.exe"

if (-not (Test-Path $ElyxionExe)) {
    # Older releases had a flat layout
    $ElyxionExe = "$InstallDir\elyxion.exe"
    $BinDir = $InstallDir
}

if (-not (Test-Path $ElyxionExe)) {
    Write-Host "[elyxion] elyxion.exe not found." -ForegroundColor Red
    Write-Host "[elyxion] Contents of $InstallDir :" -ForegroundColor Yellow
    try { Get-ChildItem -Recurse -Name $InstallDir | ForEach-Object { Write-Host "  $_" } } catch {}
    Write-Host "Press any key to exit..." ; $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# ---- Create convenience wrappers if needed -------------------------
# If the release archive didn't come with .cmd launchers, create them.
if (-not (Test-Path "$BinDir\elyxion.cmd")) {
    @"
@echo off
""%~dp0elyxion.exe"" %*
"@ | Out-File -FilePath "$BinDir\elyxion.cmd" -Encoding ASCII -ErrorAction SilentlyContinue
}

if (-not (Test-Path "$BinDir\elyx.cmd")) {
    @"
@echo off
""%~dp0elyxion.exe"" --package-manager %*
"@ | Out-File -FilePath "$BinDir\elyx.cmd" -Encoding ASCII -ErrorAction SilentlyContinue
}

# ---- Setup PATH ----------------------------------------------------
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")

if ($UserPath -notlike "*$BinDir*") {
    Write-Host "[elyxion] Adding $BinDir to your user PATH..." -ForegroundColor Cyan
    [Environment]::SetEnvironmentVariable(
        "PATH",
        "$UserPath;$BinDir",
        "User"
    )
    $env:PATH = "$env:PATH;$BinDir"
} else {
    Write-Host "[elyxion] $BinDir is already on your PATH." -ForegroundColor Green
}

# ---- Verify ---------------------------------------------------------
try {
    $ElyxionVersion = & $ElyxionExe --version 2>&1
    Write-Host ""
    Write-Host "[elyxion] Elyxion installed successfully!" -ForegroundColor Green
    Write-Host "[elyxion] $ElyxionVersion" -ForegroundColor White
} catch {
    Write-Host "[elyxion] Binary exists but could not run. It may be incompatible with your Windows version." -ForegroundColor Red
    Write-Host "Press any key to exit..." ; $null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
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

Write-Host "[elyxion] Restart your terminal or run 'refreshenv' to use elyxion immediately." -ForegroundColor Yellow