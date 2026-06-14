$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptPath

# 1. Read manifest.json version
$manifestPath = Join-Path $rootDir "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json not found at $manifestPath"
    exit 1
}

$manifest = Get-Content $manifestPath | ConvertFrom-Json
$version = $manifest.version
Write-Host "Packaging version v$version..."

# 2. Delete existing zip files in the root directory
$oldZips = Get-ChildItem -Path $rootDir -Filter *.zip
foreach ($zip in $oldZips) {
    Remove-Item -Path $zip.FullName -Force
    Write-Host "Deleted old zip file: $($zip.Name)"
}

# 3. Create the new zip file name
$zipName = "Quote_Reply_v$version.zip"
$zipPath = Join-Path $rootDir $zipName
$excludeList = @(".git", ".github", "scripts", ".vscode", ".idea", "node_modules", ".gitignore", $zipName)

# Gather files/folders to zip
$filesToZip = Get-ChildItem -Path $rootDir | Where-Object { $_.Name -notin $excludeList }

Compress-Archive -Path $filesToZip.FullName -DestinationPath $zipPath -Force
Write-Host "Successfully created $zipName"
