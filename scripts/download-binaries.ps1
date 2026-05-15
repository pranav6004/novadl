$BinDir = "$PSScriptRoot\..\bin"
if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

Write-Host "Downloading yt-dlp..."
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile "$BinDir\yt-dlp.exe"

Write-Host "Downloading ffmpeg..."
$ZipPath = "$BinDir\ffmpeg.zip"
Invoke-WebRequest -Uri "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" -OutFile $ZipPath

Write-Host "Extracting ffmpeg..."
Expand-Archive -Path $ZipPath -DestinationPath "$BinDir\ffmpeg_ext" -Force
Move-Item -Path "$BinDir\ffmpeg_ext\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe" -Destination "$BinDir\ffmpeg.exe" -Force
Move-Item -Path "$BinDir\ffmpeg_ext\ffmpeg-master-latest-win64-gpl\bin\ffprobe.exe" -Destination "$BinDir\ffprobe.exe" -Force

Write-Host "Cleaning up..."
Remove-Item -Path $ZipPath -Force
Remove-Item -Path "$BinDir\ffmpeg_ext" -Recurse -Force

Write-Host "Done!"
