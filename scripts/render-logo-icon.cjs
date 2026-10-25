const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 512,
      height: 512,
      show: false,
      useContentSize: true,
      transparent: true,
      frame: false,
      webPreferences: {
        offscreen: true
      }
    });

    const svgPath = path.join(__dirname, "..", "public", "icon.svg");
    const svgContent = fs.readFileSync(svgPath, "utf8");
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 512px; height: 512px; background: transparent; overflow: hidden; }
  svg { width: 512px; height: 512px; display: block; }
</style>
</head>
<body>
${svgContent}
</body>
</html>`;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    const pngBuffer = image.toPNG();
    const outPngPath = path.join(__dirname, "..", "public", "icon.png");
    fs.writeFileSync(outPngPath, pngBuffer);
    console.log(`Rendered PNG: ${outPngPath} (${pngBuffer.length} bytes, 512x512)`);

    // Generate Windows ICO via ffmpeg
    const ffmpegPath = path.join(__dirname, "..", "bin", "ffmpeg.exe");
    const outIcoPath = path.join(__dirname, "..", "public", "icon.ico");
    if (fs.existsSync(ffmpegPath)) {
      execFileSync(ffmpegPath, ["-y", "-i", outPngPath, "-vf", "scale=256:256", outIcoPath]);
      console.log(`Generated ICO: ${outIcoPath}`);
    }
  } catch (err) {
    console.error("Failed to render icon:", err);
  } finally {
    app.quit();
  }
});
