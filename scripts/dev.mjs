import { spawn } from "node:child_process";

const vite = spawn("npm", ["exec", "vite", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  shell: true,
  stdio: "inherit"
});

const url = "http://127.0.0.1:5173";
let electron;

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error(`Vite did not respond at ${url}`);
}

function shutdown(code = 0) {
  if (electron && !electron.killed) {
    electron.kill();
  }

  if (!vite.killed) {
    vite.kill();
  }

  process.exit(code);
}

vite.on("exit", (code) => {
  if (!electron || !electron.killed) {
    shutdown(code ?? 1);
  }
});

try {
  await waitForServer();

  electron = spawn("npm", ["exec", "electron", "--", "."], {
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: url
    }
  });

  electron.on("exit", (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(error);
  shutdown(1);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
