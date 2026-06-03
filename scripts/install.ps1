# Canvas CLI Installation Script for Windows
# PowerShell script to install Canvas CLI on Windows

param(
    [switch]$Force,
    [switch]$Help,
    [string]$InstallPath = $null
)

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Cyan = "Cyan"
$White = "White"

# Logging functions
function Write-Log { param($Message) Write-Host "[INFO] $Message" -ForegroundColor $Cyan }
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor $Green }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor $Yellow }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor $Red; exit 1 }

# Configuration
$Repo = "canvas-ui/canvas-cli"
$DefaultInstallDir = "$env:USERPROFILE\.local\bin"
$BinaryName = "canvas.exe"

# Show help
function Show-Help {
    Write-Host @"
Canvas CLI Installation Script for Windows

USAGE:
    .\install.ps1 [OPTIONS]

OPTIONS:
    -Force              Force reinstall if already installed
    -Help               Show this help message
    -InstallPath        Custom installation directory

EXAMPLES:
    # Install Canvas CLI locally
    .\install.ps1

    # Install to custom location
    .\install.ps1 -InstallPath "C:\Tools\Canvas"

    # Force reinstall
    .\install.ps1 -Force

"@ -ForegroundColor $White
}

# Parse command line arguments
if ($Help) {
    Show-Help
    exit 0
}

# Detect platform and architecture
function Get-Platform {
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    return "windows-$arch"
}

# Get latest release info from GitHub API
function Get-LatestRelease {
    $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"

    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Get
        return $response.tag_name
    }
    catch {
        Write-Error "Failed to get latest release information from GitHub: $($_.Exception.Message)"
    }
}

# Check dependencies
function Test-Dependencies {
    $missingDeps = @()

    # Check for PowerShell 5.1+ (for Invoke-RestMethod)
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        $missingDeps += "PowerShell 5.1 or higher"
    }

    # Check for .NET Framework (for web requests)
    try {
        [System.Net.WebRequest]::Create("https://github.com") | Out-Null
    }
    catch {
        $missingDeps += ".NET Framework"
    }

    if ($missingDeps.Count -gt 0) {
        Write-Error "Missing required dependencies: $($missingDeps -join ', ')"
    }
}

# Download and install binary
function Install-Canvas {
    $platform = Get-Platform
    $version = Get-LatestRelease
    $extension = "zip"
    $filename = "canvas-$($version.TrimStart('v'))-$platform.$extension"
    $downloadUrl = "https://github.com/$Repo/releases/download/$version/$filename"
    $tempDir = "$env:TEMP\canvas-install-$(Get-Random)"
    $installDir = if ($InstallPath) { $InstallPath } else { $DefaultInstallDir }

    Write-Log "Detected platform: $platform"
    Write-Log "Latest version: $version"
    Write-Log "Installing to: $installDir"

    # Create install and temp directories
    try {
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }
    catch {
        Write-Error "Failed to create directories: $($_.Exception.Message)"
    }

    # Download
    Write-Log "Downloading Canvas CLI..."
    $downloadPath = Join-Path $tempDir $filename

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath -UseBasicParsing
    }
    catch {
        Write-Error "Download failed from: $downloadUrl`nError: $($_.Exception.Message)"
    }

    # Verify download
    if (-not (Test-Path $downloadPath) -or (Get-Item $downloadPath).Length -eq 0) {
        Write-Error "Downloaded file is missing or empty: $filename"
    }

    # Extract
    Write-Log "Extracting binary..."
    try {
        Expand-Archive -Path $downloadPath -DestinationPath $tempDir -Force
    }
    catch {
        Write-Error "Failed to extract: $filename`nError: $($_.Exception.Message)"
    }

    # Find the binary (handle different naming patterns)
    $binaryPath = $null
    $candidates = @(
        "canvas-$($platform.Split('-')[0])-$($platform.Split('-')[1])",
        "canvas-$platform",
        "canvas"
    )

    foreach ($candidate in $candidates) {
        $candidatePath = Join-Path $tempDir "$candidate.exe"
        if (Test-Path $candidatePath) {
            $binaryPath = $candidatePath
            break
        }
    }

    if (-not $binaryPath -or -not (Test-Path $binaryPath)) {
        Write-Error "Binary not found after extraction. Expected one of: $($candidates -join ', ')"
    }

    # Test the binary
    Write-Log "Testing binary..."
    try {
        $testResult = & $binaryPath --version 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Binary test failed - the downloaded binary is not working"
        }
    }
    catch {
        Write-Error "Binary test failed: $($_.Exception.Message)"
    }

    # Install
    Write-Log "Installing binary..."
    $targetPath = Join-Path $installDir $BinaryName

    try {
        Move-Item -Path $binaryPath -Destination $targetPath -Force
    }
    catch {
        Write-Error "Failed to install binary to: $targetPath`nError: $($_.Exception.Message)"
    }

    # Verify installation
    if (-not (Test-Path $targetPath)) {
        Write-Error "Installation verification failed - binary not found at: $targetPath"
    }

    # Cleanup temp directory
    try {
        Remove-Item -Path $tempDir -Recurse -Force
        Write-Log "Cleaned up temporary files"
    }
    catch {
        Write-Warning "Failed to cleanup temp directory: $tempDir"
    }

    # Final test
    Write-Log "Verifying installation..."
    try {
        $installedVersion = & $targetPath --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Canvas CLI installed successfully!"
            Write-Log "Installed version: $installedVersion"
        } else {
            Write-Error "Installation verification failed - cannot run installed binary"
        }
    }
    catch {
        Write-Error "Installation verification failed: $($_.Exception.Message)"
    }

    return $installDir
}

# Main execution
Write-Host "🎨 Canvas CLI Installation Script for Windows" -ForegroundColor $Cyan
Write-Host "=============================================" -ForegroundColor $Cyan
Write-Host ""
Write-Log "Repository: https://github.com/$Repo"

# Check system requirements
Test-Dependencies

# Install Canvas CLI
$installDir = Install-Canvas

# Show PATH setup information if needed
Write-Host ""
$currentPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)

if ($currentPath -split ';' -notcontains $installDir) {
    Write-Warning "$installDir is not in your PATH"
    Write-Log "Add this to your PATH in System Environment Variables:"
    Write-Host "  $installDir" -ForegroundColor $White
    Write-Log ""
    Write-Log "Or run this command to add it automatically:"
    Write-Host "  [Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH', 'User') + ';$installDir', 'User')" -ForegroundColor $White
    Write-Log ""
    Write-Log "For now, you can run canvas with the full path:"
    Write-Host "  $installDir\$BinaryName --version" -ForegroundColor $White
} else {
    Write-Log "Canvas CLI is ready to use!"
}

Write-Host ""
Write-Log "Quick start:"
Write-Host "  canvas --version" -ForegroundColor $White
Write-Host "  canvas --help" -ForegroundColor $White
Write-Host "  canvas config show" -ForegroundColor $White
Write-Host ""
