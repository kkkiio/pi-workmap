import { access, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright-core";

const FONT_FAMILY = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';
const HARNESS = `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f8f8f8}#frame{display:inline-block;padding:16px;background:#f8f8f8}canvas{display:block}</style></head>
<body><div id="frame"><div id="terminal"></div></div><script type="module">
import { init, Terminal } from "/ghostty-web.js";
await init();
window.renderTerminal = async (input) => {
  const terminal = new Terminal({
    cols: input.columns, rows: input.rows, cursorBlink: false, disableStdin: true,
    fontFamily: input.fontFamily, fontSize: 14,
    theme: {
      background: "#f8f8f8", foreground: "#1f2328", cursor: "#6c6c6c", cursorAccent: "#f8f8f8",
      black: "#073642", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2",
      magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5", brightBlack: "#002b36",
      brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83", brightBlue: "#839496",
      brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3"
    }
  });
  terminal.open(document.getElementById("terminal"));
  const metrics = terminal.renderer?.metrics;
  if (metrics) {
    const extraLeading = Math.max(2, Math.round(metrics.height * 0.2));
    metrics.height += extraLeading;
    metrics.baseline += Math.floor(extraLeading / 2);
    terminal.renderer.resize(input.columns, input.rows);
  }
  await new Promise((resolve) => terminal.write(input.ansiText + "\\u001b[?25l", resolve));
};
</script></body></html>`;

export class TerminalRenderer {
	private constructor(
		private readonly server: Server,
		private readonly browser: Browser,
		private readonly origin: string,
	) {}

	static async start(): Promise<TerminalRenderer> {
		const modulePath = fileURLToPath(import.meta.resolve("ghostty-web"));
		const moduleBytes = await readFile(modulePath);
		const server = createServer((request, response) => {
			if (request.url === "/ghostty-web.js") {
				response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
				response.end(moduleBytes);
				return;
			}
			response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			response.end(HARNESS);
		});
		await new Promise<void>((resolvePromise, rejectPromise) => {
			server.once("error", rejectPromise);
			server.listen(0, "127.0.0.1", resolvePromise);
		});
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Screenshot server did not expose a port");
		const candidates = [
			chromium.executablePath(),
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/usr/bin/google-chrome",
			"/usr/bin/chromium",
		];
		let executablePath: string | undefined;
		for (const candidate of candidates) {
			try {
				await access(candidate);
				executablePath = candidate;
				break;
			} catch {
				// Try the next installed browser.
			}
		}
		if (!executablePath) throw new Error("docs:screenshot requires Chrome or Chromium");
		const browser = await chromium.launch({ executablePath, headless: true });
		return new TerminalRenderer(server, browser, `http://127.0.0.1:${address.port}`);
	}

	async screenshot(ansiText: string, columns: number, rows: number, outputPath: string): Promise<void> {
		const page = await this.browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 2 });
		try {
			await page.goto(this.origin);
			await page.waitForFunction(
				() => typeof (window as unknown as { renderTerminal?: unknown }).renderTerminal === "function",
			);
			await page.evaluate(
				async (input) => {
					await (window as unknown as { renderTerminal(value: typeof input): Promise<void> }).renderTerminal(input);
				},
				{
					ansiText: `\u001b[?25l\u001b[H\u001b[2J${ansiText.replace(/\r/g, "").split("\n").join("\r\n")}`,
					columns,
					rows,
					fontFamily: FONT_FAMILY,
				},
			);
			const canvas = page.locator("canvas");
			await canvas.waitFor({ state: "visible" });
			await page.locator("#frame").screenshot({ path: outputPath, animations: "disabled", caret: "hide" });
		} finally {
			await page.close();
		}
	}

	async close(): Promise<void> {
		await this.browser.close();
		await new Promise<void>((resolvePromise, rejectPromise) => {
			this.server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
		});
	}
}
