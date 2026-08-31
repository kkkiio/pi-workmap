import { spawn } from "node:child_process";
import { join } from "node:path";

export class FreezeRenderer {
	constructor(private readonly root: string) {}

	async screenshot(ansiText: string, outputPath: string): Promise<void> {
		const executable = process.env.FREEZE_BIN || "freeze";
		const child = spawn(
			executable,
			["--config", join(this.root, "test/visual/freeze.json"), "--language", "ansi", "--output", outputPath, "-"],
			{ stdio: ["pipe", "ignore", "pipe"] },
		);
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.stdin.end(`${ansiText}\n`);
		await new Promise<void>((resolvePromise, rejectPromise) => {
			child.once("error", (error) => {
				const detail =
					(error as NodeJS.ErrnoException).code === "ENOENT"
						? " Install it with: brew install charmbracelet/tap/freeze"
						: "";
				rejectPromise(new Error(`Could not start Charmbracelet Freeze.${detail}`, { cause: error }));
			});
			child.once("close", (code) => {
				if (code === 0) resolvePromise();
				else rejectPromise(new Error(`Freeze exited with code ${code}: ${stderr.trim()}`));
			});
		});
	}
}
