# build-v8.ps1
# Builds V8 monolithic library for Windows standalone builds.
# Caches the checkout and build output for fast CI runs.
#
# Usage: .\scripts\build-v8.ps1 -Version "11.4.183" -OutDir "C:\v8"
#
# First run: ~2-3 hours (clone + build)
# Cached run: ~5-10 minutes

param(
    [string]$Version = "12.2.281.28",
    [string]$OutDir = "$PSScriptRoot\..\build\v8",
    [string]$CacheDir = "$env:USERPROFILE\.v8-cache"
)

$ErrorActionPreference = "Stop"

Write-Host "=== V8 Build for Elyxion (Windows) ===" -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "Output:  $OutDir"
Write-Host ""

# ---- Helper: Check cache ----
$cacheKey = "v8-$Version-windows-x64-nosandbox-nopointercompression-clean"
$cachedBuild = Join-Path $CacheDir $cacheKey

if (Test-Path "$cachedBuild\include\v8.h" -PathType Leaf) {
    Write-Host "[CACHE HIT] Using cached V8 from $cachedBuild" -ForegroundColor Green
    Copy-Item -Recurse -Force "$cachedBuild\*" "$OutDir\"
    Write-Host "[DONE] V8 is ready at $OutDir"
    exit 0
}

Write-Host "[CACHE MISS] Building V8 $Version from source..." -ForegroundColor Yellow

# ---- Install depot_tools ----
$depotToolsDir = Join-Path $CacheDir "depot_tools"
if (-not (Test-Path "$depotToolsDir\gclient.bat")) {
    Write-Host "Installing depot_tools..."
    git clone --depth=1 https://chromium.googlesource.com/chromium/tools/depot_tools.git $depotToolsDir
}

$env:PATH = "$depotToolsDir;$env:PATH"
$env:DEPOT_TOOLS_WIN_TOOLCHAIN = "0"

# ---- Clone V8 and configure dependencies ----
$v8Src = Join-Path $CacheDir "v8-src"
$v8Root = Join-Path $v8Src "v8"
if (-not (Test-Path "$v8Src\.gclient")) {
    Write-Host "Cloning V8 from https://chromium.googlesource.com/v8/v8 (this takes a while)..."
    Remove-Item -Recurse -Force $v8Src -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $v8Src | Out-Null
    Push-Location $v8Src
    git clone https://chromium.googlesource.com/v8/v8 v8
    gclient config https://chromium.googlesource.com/v8/v8
    Pop-Location
}

Push-Location $v8Root

# ---- Checkout version ----
Write-Host "Checking out V8 $Version..."
git fetch --tags
git checkout "tags/$Version" -B "elyxion-$Version" 2>$null
if ($LASTEXITCODE -ne 0) {
    # Try branch head format
    git checkout "branch-heads/$Version" -B "elyxion-$Version" 2>$null
}
Pop-Location

# ---- Patch vpython spec (Apple Silicon workaround) ----
# V8's .vpython3 pins numpy (resolves to 1.21.1+supported.1), which has no
# cp38 macOS arm64 wheel in the Chrome artifact registry, so the vpython3
# install hook fails on Apple Silicon runners. The vpython venv is only used
# by V8's test tooling - the SDK build does not need it - so drop the numpy
# wheel from the spec before syncing.
$vpythonSpec = Join-Path $v8Root ".vpython3"
$lines = Get-Content $vpythonSpec
$out = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq 'wheel: <') {
        $j = $i + 1
        while ($j -lt $lines.Count -and $lines[$j].Trim() -ne '>') { $j++ }
        $j++ # include the closing '>' line
        $last = [Math]::Min($j - 1, $lines.Count - 1)
        $block = $lines[$i..$last]
        if (($block -join "`n") -match 'numpy') {
            $i = $j - 1
            continue
        }
    }
    $out.Add($lines[$i])
}
Set-Content -Path $vpythonSpec -Value $out

# ---- Sync dependencies for the selected revision ----
Push-Location $v8Src
Write-Host "Syncing dependencies..."
gclient sync -D 2>&1 | Select-Object -Last 5
Pop-Location

# ---- Patch VS/SDK detection for Visual Studio 2026 ----
# The windows-2025-vs2026 runner ships Visual Studio 2026 (version 18.x)
# installed under "...\Visual Studio\18\Enterprise". V8 12.2's vs_toolchain.py
# only knows VS 2017/2019/2022 and locates the install via the vs2022_install
# environment variable, so point that at the VS 2026 install. The Windows SDK
# version pinned by V8 12.2 (10.0.22621.0) may not be installed on the runner,
# so switch to the newest SDK actually present.
$vsInstall = "C:\Program Files\Microsoft Visual Studio\18\Enterprise"
if (Test-Path $vsInstall) {
    $env:vs2022_install = $vsInstall
    Write-Host "Using Visual Studio 2026 at $vsInstall"
} else {
    Write-Host "WARNING: Visual Studio 2026 not found at $vsInstall; VS detection unchanged"
}

$sdkIncludeRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\Include"
$newestSdk = Get-ChildItem $sdkIncludeRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^10\.0\.\d+\.\d+$' } |
    Sort-Object Name -Descending | Select-Object -First 1
if ($newestSdk -and $newestSdk.Name -ne '10.0.22621.0') {
    foreach ($file in @(
            (Join-Path $v8Root "build\vs_toolchain.py"),
            (Join-Path $v8Root "build\toolchain\win\setup_toolchain.py")
        )) {
        $content = Get-Content $file -Raw
        if ($content -match "SDK_VERSION = '10\.0\.22621\.0'") {
            $content = $content -replace "SDK_VERSION = '10\.0\.22621\.0'", "SDK_VERSION = '$($newestSdk.Name)'"
            Set-Content -Path $file -Value $content -Encoding utf8
            Write-Host "Patched $file to use Windows SDK $($newestSdk.Name)"
        }
    }
}

Push-Location $v8Root

# ---- Generate build ----
$gnArgs = @(
    'is_debug = false',
    'target_cpu = "x64"',
    'is_clang = false',
    'use_custom_libcxx = false',
    'v8_monolithic = true',
    'v8_enable_sandbox = false',
    'v8_enable_pointer_compression = false',
    'v8_use_external_startup_data = false',
    'v8_enable_i18n_support = false',
    'treat_warnings_as_errors = false',
    'symbol_level = 0',
    'use_lld = false'
)

$buildDir = "out\x64.release"

Write-Host "Generating build files..."
# GN argument changes are ABI-sensitive; do not mix objects from profiles.
# Write the args to args.gn instead of passing --args on the command line:
# Windows argv parsing strips the quotes around string values like "x64",
# which makes `gn gen` fail with "Undefined identifier".
Remove-Item -Recurse -Force $buildDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
$gnArgs | Set-Content -Path (Join-Path $buildDir "args.gn") -Encoding utf8
& gn gen $buildDir

# ---- Build ----
Write-Host "Building V8 (this takes 30-90 minutes)..."
& ninja -C $buildDir v8_monolith

# ---- Collect output ----
Write-Host "Collecting build artifacts..."
$includeDir = Join-Path $OutDir "include"
Remove-Item -Recurse -Force $OutDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $includeDir | Out-Null

# Copy headers
Copy-Item -Recurse "$v8Root\include\*" "$includeDir\" -Force

# Copy the monolithic library. GN may place it directly in the build
# directory or under obj/, depending on the V8 revision/toolchain.
$library = Get-ChildItem -Path $buildDir -Recurse -File -Filter "v8_monolith*.lib" |
    Select-Object -First 1
if (-not $library) {
    throw "V8 monolithic library was not found under $buildDir"
}
Copy-Item $library.FullName (Join-Path $OutDir "v8_monolith.lib") -Force

# Copy DLLs if any
$dlls = @(
    "$buildDir\v8_monolith.dll",
    "$buildDir\icudtl.dat",
    "$buildDir\snapshot_blob.bin"
)
foreach ($dll in $dlls) {
    if (Test-Path $dll) {
        Copy-Item $dll $OutDir -Force
    }
}

# ---- Save to cache ----
Write-Host "Saving to cache..."
Remove-Item -Recurse -Force $cachedBuild -ErrorAction SilentlyContinue
Copy-Item -Recurse $OutDir $cachedBuild -Force

Pop-Location

Write-Host "[DONE] V8 built and cached at $OutDir" -ForegroundColor Green