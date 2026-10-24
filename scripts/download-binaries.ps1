$ErrorActionPreference = "Stop"
$BinDir = "$PSScriptRoot\..\bin"
if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

Write-Host "Downloading yt-dlp..."
$YtDlpPath = "$BinDir\yt-dlp.exe"
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile $YtDlpPath

if ((Get-Item $YtDlpPath).Length -lt 1000000) {
    throw "yt-dlp download failed or file size is invalid."
}

Write-Host "Downloading ffmpeg..."
$ZipPath = "$BinDir\ffmpeg.zip"
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" -OutFile $ZipPath

if ((Get-Item $ZipPath).Length -lt 10000000) {
    throw "ffmpeg download failed or file size is invalid."
}

Write-Host "Extracting ffmpeg..."
$ExtDir = "$BinDir\ffmpeg_ext"
if (Test-Path $ExtDir) { Remove-Item -Path $ExtDir -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $ExtDir -Force

$FfmpegExe = Get-ChildItem -Path $ExtDir -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
$FfprobeExe = Get-ChildItem -Path $ExtDir -Filter "ffprobe.exe" -Recurse | Select-Object -First 1

if (-not $FfmpegExe -or -not $FfprobeExe) {
    throw "Could not locate ffmpeg.exe or ffprobe.exe in extracted archive."
}

Move-Item -Path $FfmpegExe.FullName -Destination "$BinDir\ffmpeg.exe" -Force
Move-Item -Path $FfprobeExe.FullName -Destination "$BinDir\ffprobe.exe" -Force

Write-Host "Cleaning up..."
Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ExtDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Binaries verified and installed successfully in $BinDir"
