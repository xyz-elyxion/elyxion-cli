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
#
# All output is saved to an install log. If something goes wrong, read:
#   %LOCALAPPDATA%\Elyxion\install.log

$ErrorActionPreference = "Continue"
$host.UI.RawUI.WindowTitle = "Elyxion Installer"

# ---- Configuration ------------------------------------------------
$Repo    = if ($env:ELYXION_REPO)    { $env:ELYXION_REPO }    else { "xyz-elyxion/elyxion-cli" }
$Version = if ($env:ELYXION_VERSION) { $env:ELYXION_VERSION } else { "latest" }
$InstallDir = if ($env:ELYXION_INSTALL_DIR) { $env:ELYXION_INSTALL_DIR } else { "$env:LOCALAPPDATA\Elyxion" }

# ---- Logging -------------------------------------------------------
# Write logs to TEMP initially so they don't conflict with deleting
# an old install dir (Start-Transcript locks its file).  At the end we
# copy the final log into the install dir.
$LogFile = Join-Path $env:TEMP "elyxion-install.log"
$FinalLogFile = Join-Path $InstallDir "install.log"

# All further output is shown in the console AND appended to the log
function Log {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $($args -join ' ')"
    Write-Host $msg
    try { Add-Content -Path $LogFile -Value $msg -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
}

# Try Start-Transcript too for completeness (captures raw PowerShell output)
$usingTranscript = $false
try {
    $transcriptPath = Join-Path $env:TEMP "elyxion-install-transcript.txt"
    Start-Transcript -Path $transcriptPath -Append -Force -ErrorAction Stop | Out-Null
    $usingTranscript = $true
} catch {
    Log "[elyxion] Transcript not available — using manual logging only."
}

Log ""
Log "=== Elyxion Installer Log ==="
Log "Date:     $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log "User:     $env:USERNAME"
Log "OS:       $($env:OS)"
Log "Arch:     $(if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'ia32' })"
Log "PS:       $($PSVersionTable.PSVersion)"
Log "Repo:     $Repo"
Log "Version:  $Version"
Log "Install:  $InstallDir"
Log "Log:      $LogFile"
Log "PWD:      $(Get-Location)"
Log "=============================="
Log ""

# ---- Platform detection --------------------------------------------
$Arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "ia32" }
$ArchiveName = "elyxion-windows-x64"

Log "[elyxion] Platform: windows/$Arch"
Log "[elyxion] Install directory: $InstallDir"

# ---- Determine release URL -----------------------------------------
$ReleaseUrl = "https://github.com/$Repo/releases"
if ($Version -eq "latest") {
    $DownloadUrl = "$ReleaseUrl/latest/download/$ArchiveName.zip"
} else {
    $DownloadUrl = "$ReleaseUrl/download/$Version/$ArchiveName.zip"
}

Log "[elyxion] Download URL: $DownloadUrl"

# ---- Download & extract --------------------------------------------
$TempDir = Join-Path $env:TEMP "elyxion-install-$(Get-Random)"
try {
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
} catch {
    Log "[elyxion] ERROR: Cannot create temp directory: $_"
    Log "[elyxion] Log saved to: $LogFile"
    Read-Host "Press Enter to exit"
    exit 1
}
$ZipPath = Join-Path $TempDir "elyxion.zip"

Log "[elyxion] Downloading Elyxion..."

try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing -ErrorAction Stop
    Log "[elyxion] Download complete."
} catch {
    Log "[elyxion] ERROR: Download failed."
    Log "[elyxion] Error details: $_"
    Log "[elyxion] Status: $($_.Exception.Response.StatusCode.value__) $($_.Exception.Response.StatusDescription)"
    Log "[elyxion] Check your internet connection or try a specific version:"
    Log "[elyxion]   `$env:ELYXION_VERSION='v1.0.0'; .\install.ps1"
    Log "[elyxion] Log saved to: $LogFile"
    Read-Host "Press Enter to exit"
    exit 1
}

# Verify the download
$ZipSize = (Get-Item $ZipPath).Length
Log "[elyxion] Downloaded: $ZipSize bytes"

if ($ZipSize -lt 1024) {
    Log "[elyxion] ERROR: Downloaded file is too small ($ZipSize bytes)."
    Log "[elyxion] This usually means no releases exist yet, or the version tag is wrong."
    # Show the first few bytes to help debug
    $head = Get-Content -Path $ZipPath -TotalCount 5 -Raw -ErrorAction SilentlyContinue
    Log "[elyxion] File begins with: $head"
    if ($Version -eq "latest") {
        Log "[elyxion] Try pinning a specific version: `$env:ELYXION_VERSION='v1.0.0'; .\install.ps1"
    }
    Log "[elyxion] Log saved to: $LogFile"
    Read-Host "Press Enter to exit"
    exit 1
}

# Remove previous install
if (Test-Path $InstallDir) {
    Log "[elyxion] Removing previous installation at $InstallDir"
    try {
        Remove-Item -Recurse -Force $InstallDir -ErrorAction Stop
    } catch {
        Log "[elyxion] WARNING: Could not fully clean old install: $_"
    }
}

Log "[elyxion] Extracting to $InstallDir..."
try {
    Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force -ErrorAction Stop
    Log "[elyxion] Extraction complete."
} catch {
    Log "[elyxion] ERROR: Extraction failed: $_"
    Log "[elyxion] Log saved to: $LogFile"
    Read-Host "Press Enter to exit"
    exit 1
}

# ---- Flatten nested archive layout -------------------------------
# GitHub's "latest/download" URL may wrap the archive in a folder.
# If the top level of the install dir contains exactly one directory
# and no files (common for nested zips), shift its contents up.
try {
    $topItems = Get-ChildItem $InstallDir
    $topDirs  = @($topItems | Where-Object { $_.PSIsContainer })
    $topFiles = @($topItems | Where-Object { -not $_.PSIsContainer })
    if ($topDirs.Count -eq 1 -and $topFiles.Count -eq 0) {
        $nested = $topDirs[0]
        Log "[elyxion] Archive is nested under '$($nested.Name)' — flattening..."
        $flatTemp = "$InstallDir._flat"
        Remove-Item -Recurse -Force $flatTemp -ErrorAction SilentlyContinue
        Move-Item $nested.FullName $flatTemp
        Remove-Item -Recurse -Force "$InstallDir\*" -ErrorAction SilentlyContinue
        Get-ChildItem $flatTemp | Move-Item -Destination $InstallDir -Force
        Remove-Item $flatTemp -ErrorAction SilentlyContinue
        Log "[elyxion] Flattened."
    }
} catch {
    Log "[elyxion] Warning: could not flatten archive: $_"
}

# Clean up temp
try { Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue } catch {}

# ---- Log extracted files -------------------------------------------
Log "[elyxion] Extracted files:"
try {
    Get-ChildItem -Recurse $InstallDir | ForEach-Object {
        $size = if ($_.PSIsContainer) { "[dir]" } else { "$($_.Length) bytes" }
        Log "  $($_.FullName.Replace($InstallDir, '.')) ($size)"
    }
} catch {
    Log "  (could not enumerate)"
}

# ---- Locate binary ------------------------------------------------
$BinDir = "$InstallDir\bin"
$ElyxionExe = "$BinDir\elyxion.exe"

if (-not (Test-Path $ElyxionExe)) {
    # Older releases had a flat layout
    $ElyxionExe = "$InstallDir\elyxion.exe"
    $BinDir = $InstallDir
    Log "[elyxion] Using flat layout (legacy archive format)"
}

if (-not (Test-Path $ElyxionExe)) {
    Log "[elyxion] ERROR: elyxion.exe not found in $InstallDir"
    Log "[elyxion] Log saved to: $LogFile"
    Read-Host "Press Enter to exit"
    exit 1
}

Log "[elyxion] Binary found: $ElyxionExe"

# ---- Create convenience wrappers -----------------------------------
# If the release archive didn't come with .cmd launchers, create them.
if (-not (Test-Path "$BinDir\elyxion.cmd")) {
    $wrapper = '@echo off' + "`r`n" + '"%~dp0elyxion.exe" %*' + "`r`n"
    $wrapper | Out-File -FilePath "$BinDir\elyxion.cmd" -Encoding ASCII -ErrorAction SilentlyContinue
    Log "[elyxion] Created elyxion.cmd"
} else {
    Log "[elyxion] Using existing elyxion.cmd"
}

if (-not (Test-Path "$BinDir\elyx.cmd")) {
    $wrapper = '@echo off' + "`r`n" + '"%~dp0elyxion.exe" --package-manager %*' + "`r`n"
    $wrapper | Out-File -FilePath "$BinDir\elyx.cmd" -Encoding ASCII -ErrorAction SilentlyContinue
    Log "[elyxion] Created elyx.cmd"
} else {
    Log "[elyxion] Using existing elyx.cmd"
}

# ---- Setup PATH ----------------------------------------------------
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
Log "[elyxion] Current user PATH length: $($UserPath.Length) chars"

if ($UserPath -notlike "*$BinDir*") {
    Log "[elyxion] Adding $BinDir to user PATH..."
    [Environment]::SetEnvironmentVariable(
        "PATH",
        "$UserPath;$BinDir",
        "User"
    )
    $env:PATH = "$env:PATH;$BinDir"
    Log "[elyxion] PATH updated."
} else {
    Log "[elyxion] $BinDir is already on PATH."
}

# ---- Verify ---------------------------------------------------------
Log "[elyxion] Verifying installation..."
try {
    $ElyxionVersion = & $ElyxionExe --version 2>&1 | Out-String
    Log ""
    Log "=============================================="
    Log "[elyxion] SUCCESS — Elyxion installed!"
    Log "[elyxion] $($ElyxionVersion.Trim())"
    Log "=============================================="
} catch {
    Log "[elyxion] ERROR: Binary exists but could not run."
    Log "[elyxion] Error: $_"
    Log "[elyxion] The binary may be incompatible with your Windows version."
    Log "[elyxion] Log saved to: $LogFile"
    Read-Host "Press Enter to exit"
    exit 1
}

# ---- Done ----------------------------------------------------------
Log ""
Log "  Quick start:"
Log "    elyxion --version"
Log "    elyxion --repl"
Log "    elyx init"
Log "    elyx install <package>"
Log ""
Log "  Install log: $LogFile"
Log ""
Log "  To uninstall:"
Log "    Remove-Item -Recurse -Force $InstallDir"
Log "    (Then remove $BinDir from your PATH via System Properties)"
Log ""
Log "[elyxion] Restart your terminal to use elyxion."
Log "=== Install complete at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

# Clean up transcript
if ($usingTranscript) {
    try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch {}
}

# Copy the log and transcript into the install dir for easy access
try {
    New-Item -ItemType Directory -Force -Path $InstallDir -ErrorAction SilentlyContinue | Out-Null
    Copy-Item $LogFile $FinalLogFile -Force -ErrorAction SilentlyContinue
    if ($usingTranscript) {
        Copy-Item $transcriptPath (Join-Path $InstallDir "install-transcript.txt") -Force -ErrorAction SilentlyContinue
    }
} catch {}

# Keep window open
Write-Host ""
Write-Host "Log saved to: $FinalLogFile" -ForegroundColor Cyan