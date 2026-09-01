import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { FreezeRenderer } from "./freeze-renderer.js";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sessionName = `pi-workmap-capture-${process.pid}`;
const columns = 100;
const rows = 32;

const temporary = await mkdtemp(join(tmpdir(), "pi-workmap-capture-"));
const demoCwd = join(temporary, "demo");
const agentDirectory = join(temporary, "agent");
const sessionFile = join(temporary, "session.jsonl");
await mkdir(demoCwd, { recursive: true });
await mkdir(agentDirectory, { recursive: true });
await copyFile(join(root, "test/visual/fixtures/workmap-session.jsonl"), sessionFile);
const sessionText = await readFile(sessionFile, "utf8");
await writeFile(sessionFile, sessionText.replace("/tmp/pi-workmap-demo", demoCwd));
await writeFile(join(agentDirectory, "settings.json"), `${JSON.stringify({ quietStartup: true })}\n`);

try {
	const command = [
		`tmux set-option -t ${sessionName} extended-keys on &&`,
		`tmux set-option -t ${sessionName} extended-keys-format csi-u &&`,
		`env PI_CODING_AGENT_DIR=${agentDirectory}`,
		"pi",
		`--session ${sessionFile}`,
		"--no-extensions",
		`--extension ${join(root, "src/index.ts")}`,
		"--no-context-files --no-skills --no-prompt-templates --no-themes --use-theme light --offline --approve",
	].join(" ");
	await exec("tmux", [
		"new-session",
		"-d",
		"-s",
		sessionName,
		"-x",
		String(columns),
		"-y",
		String(rows),
		"-c",
		demoCwd,
		command,
	]);
	for (let attempt = 0; attempt < 80; attempt += 1) {
		const { stdout } = await exec("tmux", ["capture-pane", "-p", "-t", `${sessionName}:0.0`]);
		if (stdout.includes("Workmap · 9 signals")) break;
		if (attempt === 79) throw new Error("Timed out waiting for the workmap widget");
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
	}
	await exec("tmux", [
		"send-keys",
		"-t",
		`${sessionName}:0.0`,
		"-l",
		"Compare server and client trade-offs before changing code",
	]);
	await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
	await mkdir(join(root, "docs/assets"), { recursive: true });
	const renderer = new FreezeRenderer(root);
	// Single rendering mode (ADR 0013): there is no compact/expanded toggle anymore.
	await capture(renderer, "workmap-session.png");
} finally {
	await exec("tmux", ["kill-session", "-t", sessionName]).catch(() => undefined);
	await rm(temporary, { recursive: true, force: true });
}

async function capture(renderer: FreezeRenderer, outputName: string): Promise<void> {
	const { stdout: ansi } = await exec("tmux", ["capture-pane", "-p", "-e", "-t", `${sessionName}:0.0`], {
		maxBuffer: 1024 * 1024,
	});
	const captured = ansi.replace(/\r/g, "").split("\n");
	const plain = captured.map((line) => line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, ""));
	const start = plain.findIndex((line) => line.includes("Workmap · 9 signals"));
	if (start < 0) throw new Error(`Workmap widget was not present in the captured terminal for ${outputName}`);
	const border = plain.findIndex((line, index) => index > start && line.startsWith("─"));
	if (border < 0) throw new Error("Could not locate the editor boundary below the workmap");
	const lastContentRow = plain.findLastIndex((line) => line.trim().length > 0);
	const content = captured
		.slice(0, lastContentRow + 1)
		.join("\n")
		.replaceAll(demoCwd, "~/projects/auth-service");
	await renderer.screenshot(content, join(root, "docs/assets", outputName));
}
