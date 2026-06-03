@echo off
setlocal enabledelayedexpansion

:: Canvas CLI Installation Script for Windows (Command Prompt)
:: Simple local installation with verification

:: Configuration
set "REPO=canvas-ui/canvas-cli"
set "INSTALL_DIR=%USERPROFILE%\.local\bin"
set "BINARY_NAME=canvas.exe"

:: Colors (using echo with color codes)
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

:: Logging functions
:log
echo %BLUE%[INFO]%NC% %~1
goto :eof

:success
echo %GREEN%[SUCCESS]%NC% %~1
goto :eof

:warning
echo %YELLOW%[WARNING]%NC% %~1
goto :eof

:error
echo %RED%[ERROR]%NC% %~1
pause
exit /b 1

:: Show help
:show_help
echo Canvas CLI Installation Script for Windows
echo.
echo USAGE:
echo     %~nx0 [OPTIONS]
echo.
echo OPTIONS:
echo     /h, /help          Show this help message
echo.
echo EXAMPLES:
echo     # Install Canvas CLI locally
echo     %~nx0
echo.
echo     # Install via curl
echo     curl -sSL https://raw.githubusercontent.com/canvas-ui/canvas-cli/main/scripts/install.bat ^| cmd
echo.
goto :eof

:: Parse command line arguments
:parse_args
if "%~1"=="/h" goto show_help
if "%~1"=="/help" goto show_help
if "%~1"=="" goto main
echo Unknown option: %~1
goto show_help

:: Detect platform and architecture
:detect_platform
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set "PLATFORM=windows-x64"
) else if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set "PLATFORM=windows-arm64"
) else (
    set "PLATFORM=windows-x86"
)
goto :eof

:: Get latest release info from GitHub API
:get_latest_release
set "API_URL=https://api.github.com/repos/%REPO%/releases/latest"
set "TEMP_FILE=%TEMP%\canvas_release.json"

:: Download release info
powershell -Command "try { Invoke-RestMethod -Uri '%API_URL%' -OutFile '%TEMP_FILE%' } catch { exit 1 }"
if !errorlevel! neq 0 (
    call :error "Failed to get latest release information from GitHub"
    goto :eof
)

:: Extract tag_name using PowerShell
for /f "delims=" %%i in ('powershell -Command "(Get-Content '%TEMP_FILE%' ^| ConvertFrom-Json).tag_name"') do set "VERSION=%%i"

:: Cleanup temp file
if exist "%TEMP_FILE%" del "%TEMP_FILE%"

if "!VERSION!"=="" (
    call :error "Failed to extract version from GitHub API response"
    goto :eof
)
goto :eof

:: Check dependencies
:check_dependencies
set "MISSING_DEPS="

:: Check for PowerShell (for web requests)
powershell -Command "exit 0" >nul 2>&1
if !errorlevel! neq 0 (
    set "MISSING_DEPS=PowerShell"
)

:: Check for .NET Framework (for web requests)
powershell -Command "[System.Net.WebRequest]::Create('https://github.com')" >nul 2>&1
if !errorlevel! neq 0 (
    if defined MISSING_DEPS (
        set "MISSING_DEPS=!MISSING_DEPS!, .NET Framework"
    ) else (
        set "MISSING_DEPS=.NET Framework"
    )
)

if defined MISSING_DEPS (
    call :error "Missing required dependencies: !MISSING_DEPS!"
    goto :eof
)
goto :eof

:: Download and install binary
:install_canvas
call :detect_platform
call :get_latest_release

set "EXTENSION=zip"
set "FILENAME=canvas-!VERSION:v=!-!PLATFORM!.!EXTENSION!"
set "DOWNLOAD_URL=https://github.com/%REPO%/releases/download/!VERSION!/!FILENAME!"
set "TEMP_DIR=%TEMP%\canvas-install-%RANDOM%"

call :log "Detected platform: !PLATFORM!"
call :log "Latest version: !VERSION!"
call :log "Installing to: %INSTALL_DIR%"

:: Create install and temp directories
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" 2>nul
if !errorlevel! neq 0 (
    call :error "Failed to create directory: %INSTALL_DIR%"
    goto :eof
)

if not exist "!TEMP_DIR!" mkdir "!TEMP_DIR!" 2>nul
if !errorlevel! neq 0 (
    call :error "Failed to create temp directory: !TEMP_DIR!"
    goto :eof
)

:: Download
call :log "Downloading Canvas CLI..."
cd /d "!TEMP_DIR!"

powershell -Command "try { Invoke-WebRequest -Uri '!DOWNLOAD_URL!' -OutFile '!FILENAME!' -UseBasicParsing } catch { exit 1 }"
if !errorlevel! neq 0 (
    call :error "Download failed from: !DOWNLOAD_URL!"
    goto :eof
)

:: Verify download
if not exist "!FILENAME!" (
    call :error "Downloaded file is missing: !FILENAME!"
    goto :eof
)

for %%A in ("!FILENAME!") do if %%~zA==0 (
    call :error "Downloaded file is empty: !FILENAME!"
    goto :eof
)

:: Extract
call :log "Extracting binary..."
powershell -Command "try { Expand-Archive -Path '!FILENAME!' -DestinationPath '.' -Force } catch { exit 1 }"
if !errorlevel! neq 0 (
    call :error "Failed to extract: !FILENAME!"
    goto :eof
)

:: Find the binary (handle different naming patterns)
set "BINARY_PATH="
for %%f in (canvas-windows-x64.exe canvas-windows-arm64.exe canvas-windows.exe canvas.exe) do (
    if exist "%%f" (
        set "BINARY_PATH=%%f"
        goto :found_binary
    )
)

:found_binary
if not defined BINARY_PATH (
    call :error "Binary not found after extraction. Expected one of: canvas-windows-x64.exe, canvas-windows-arm64.exe, canvas-windows.exe, canvas.exe"
    goto :eof
)

:: Test the binary
call :log "Testing binary..."
"!BINARY_PATH!" --version >nul 2>&1
if !errorlevel! neq 0 (
    call :error "Binary test failed - the downloaded binary is not working"
    goto :eof
)

:: Install
call :log "Installing binary..."
move /y "!BINARY_PATH!" "%INSTALL_DIR%\%BINARY_NAME%" >nul 2>&1
if !errorlevel! neq 0 (
    call :error "Failed to install binary to: %INSTALL_DIR%\%BINARY_NAME%"
    goto :eof
)

:: Verify installation
if not exist "%INSTALL_DIR%\%BINARY_NAME%" (
    call :error "Installation verification failed - binary not found at: %INSTALL_DIR%\%BINARY_NAME%"
    goto :eof
)

:: Cleanup temp directory safely
if exist "!TEMP_DIR!" (
    rmdir /s /q "!TEMP_DIR!" 2>nul
    call :log "Cleaned up temporary files"
)

:: Final test
call :log "Verifying installation..."
"%INSTALL_DIR%\%BINARY_NAME%" --version >nul 2>&1
if !errorlevel! equ 0 (
    for /f "delims=" %%i in ('"%INSTALL_DIR%\%BINARY_NAME%" --version 2^>nul') do set "INSTALLED_VERSION=%%i"
    call :success "Canvas CLI installed successfully!"
    call :log "Installed version: !INSTALLED_VERSION!"
) else (
    call :error "Installation verification failed - cannot run installed binary"
)
goto :eof

:: Main execution
:main
echo 🎨 Canvas CLI Installation Script for Windows
echo =============================================
echo.
call :log "Repository: https://github.com/%REPO%"
call :log "Installing to: %INSTALL_DIR%"

:: Check system requirements
call :check_dependencies

:: Install Canvas CLI
call :install_canvas

:: Show PATH setup information if needed
echo.
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "CURRENT_PATH=%%b"

echo !CURRENT_PATH! | findstr /C:"%INSTALL_DIR%" >nul
if !errorlevel! neq 0 (
    call :warning "%INSTALL_DIR% is not in your PATH"
    call :log "Add this to your PATH in System Environment Variables:"
    echo   %INSTALL_DIR%
    call :log ""
    call :log "Or run this command to add it automatically:"
    echo   setx PATH "!CURRENT_PATH!;%INSTALL_DIR%"
    call :log ""
    call :log "For now, you can run canvas with the full path:"
    echo   "%INSTALL_DIR%\%BINARY_NAME%" --version
) else (
    call :log "Canvas CLI is ready to use!"
)

echo.
call :log "Quick start:"
echo   canvas --version
echo   canvas --help
echo   canvas config show
echo.

pause
