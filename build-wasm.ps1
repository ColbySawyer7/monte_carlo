# Build script for native Rust addons (N-API) - Windows PowerShell version
# Builds both DES and Monte Carlo engines

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$RUST_DIR = Join-Path $SCRIPT_DIR "sim-native"
$OUTPUT_DIR = Join-Path $SCRIPT_DIR "backend\wasm\pkg"

Write-Host "Building native Rust addons..." -ForegroundColor Cyan

# Ensure output directory exists
if (-not (Test-Path $OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $OUTPUT_DIR -Force | Out-Null
}

# Check if napi is available
$NAPI_CMD = $null

# Check for global napi
$globalNapi = Get-Command napi -ErrorAction SilentlyContinue
if ($globalNapi) {
    $NAPI_CMD = "napi"
}
# Check for local napi in backend/node_modules
elseif (Test-Path (Join-Path $SCRIPT_DIR "backend\node_modules\.bin\napi.cmd")) {
    $NAPI_CMD = Join-Path $SCRIPT_DIR "backend\node_modules\.bin\napi.cmd"
}
elseif (Test-Path (Join-Path $SCRIPT_DIR "backend\node_modules\.bin\napi")) {
    $NAPI_CMD = Join-Path $SCRIPT_DIR "backend\node_modules\.bin\napi"
}
else {
    Write-Host "Error: napi CLI not found. Please install @napi-rs/cli:" -ForegroundColor Red
    Write-Host "  cd backend && npm install" -ForegroundColor Yellow
    exit 1
}

# Build DES engine
Write-Host "Building DES engine..." -ForegroundColor Yellow
Push-Location (Join-Path $RUST_DIR "des")
try {
    & $NAPI_CMD build --release
    if ($LASTEXITCODE -ne 0) {
        throw "napi build failed with exit code $LASTEXITCODE"
    }
    
    # Copy output to target directory
    $desOutputDir = Join-Path $OUTPUT_DIR "des"
    if (-not (Test-Path $desOutputDir)) {
        New-Item -ItemType Directory -Path $desOutputDir -Force | Out-Null
    }
    
    $desNodeFile = $null
    if (Test-Path "index.node") {
        $desNodeFile = "index.node"
    }
    elseif (Test-Path "sim-native-des.node") {
        $desNodeFile = "sim-native-des.node"
    }
    
    if ($desNodeFile) {
        Copy-Item -Path $desNodeFile -Destination (Join-Path $desOutputDir "index.node") -Force
        if (Test-Path "index.d.ts") {
            Copy-Item -Path "index.d.ts" -Destination (Join-Path $desOutputDir "index.d.ts") -Force
        }
        if (Test-Path "package.json") {
            Copy-Item -Path "package.json" -Destination (Join-Path $desOutputDir "package.json") -Force
        }
        
        # Create index.js wrapper if it doesn't exist
        $desIndexJs = Join-Path $desOutputDir "index.js"
        if (-not (Test-Path $desIndexJs)) {
            "module.exports = require('./index.node');" | Out-File -FilePath $desIndexJs -Encoding utf8
        }
        
        Write-Host "  [OK] DES engine built successfully (.node file generated)" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] DES engine build failed - .node file not found" -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

# Build Monte Carlo engine
Write-Host "Building Monte Carlo engine..." -ForegroundColor Yellow
Push-Location (Join-Path $RUST_DIR "monte")
try {
    & $NAPI_CMD build --release
    if ($LASTEXITCODE -ne 0) {
        throw "napi build failed with exit code $LASTEXITCODE"
    }
    
    # Copy output to target directory
    $monteOutputDir = Join-Path $OUTPUT_DIR "monte"
    if (-not (Test-Path $monteOutputDir)) {
        New-Item -ItemType Directory -Path $monteOutputDir -Force | Out-Null
    }
    
    $monteNodeFile = $null
    if (Test-Path "index.node") {
        $monteNodeFile = "index.node"
    }
    elseif (Test-Path "sim-native-monte.node") {
        $monteNodeFile = "sim-native-monte.node"
    }
    
    if ($monteNodeFile) {
        Copy-Item -Path $monteNodeFile -Destination (Join-Path $monteOutputDir "index.node") -Force
        if (Test-Path "index.d.ts") {
            Copy-Item -Path "index.d.ts" -Destination (Join-Path $monteOutputDir "index.d.ts") -Force
        }
        if (Test-Path "package.json") {
            Copy-Item -Path "package.json" -Destination (Join-Path $monteOutputDir "package.json") -Force
        }
        
        # Create index.js wrapper if it doesn't exist
        $monteIndexJs = Join-Path $monteOutputDir "index.js"
        if (-not (Test-Path $monteIndexJs)) {
            "module.exports = require('./index.node');" | Out-File -FilePath $monteIndexJs -Encoding utf8
        }
        
        Write-Host "  [OK] Monte Carlo engine built successfully (.node file generated)" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] Monte Carlo engine build failed - .node file not found" -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

Write-Host "Native addon build complete!" -ForegroundColor Green
Write-Host "Output: $OUTPUT_DIR" -ForegroundColor Cyan

