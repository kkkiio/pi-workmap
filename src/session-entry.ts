import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkmapChild, WorkmapGoal, WorkmapRoot } from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";

/**
 * This module owns the wire format of persisted snapshots and the conversation
 * with the Pi session file — nothing else. Semantic validation of node content
 * (types, titles, the ≤10 backstop) lives in state.ts; this module only
 * guarantees that what it hands over is a structurally plausible snapshot of
 * the current version.
 *
 * Session-entry persistence protocol:
 * - Snapshots are appended, never updated, so reading the newest one means
 *   `/tree` branch navigation can never roll the workmap back;
 * - `resume` restores the latest snapshot; an interactive fork inherits it and
 *   then evolves independently; a new session starts from an empty map.
 *
 * Versioning: snapshots predating the current version are migrated on read
 * (ADR 0017/0018): `heading` remaps to `goal` first (v4 lineage), goal roots
 * are lifted out of the node list into the `goal` header (first goal wins,
 * the rest drop — they were task restatements), and the `status` field
 * renames to `label`. The newest snapshot that passes the caller's semantic
 * validation wins; older or invalid ones are skipped.
 */
export const WORKMAP_SNAPSHOT_VERSION = 7;

export interface WorkmapSnapshot {
	version: typeof WORKMAP_SNAPSHOT_VERSION;
	goal?: WorkmapGoal;
	nodes: WorkmapRoot[];
}

export function persistSnapshot(
	pi: Pick<ExtensionAPI, "appendEntry">,
	nodes: readonly WorkmapRoot[],
	goal?: WorkmapGoal,
): void {
	pi.appendEntry<WorkmapSnapshot>(WORKMAP_ENTRY_TYPE, {
		version: WORKMAP_SNAPSHOT_VERSION,
		...(goal ? { goal } : {}),
		nodes: nodes.map((node) => ({ ...node })),
	});
}

export interface RestoredSnapshot {
	goal?: WorkmapGoal;
	nodes: WorkmapRoot[];
}

/**
 * The newest snapshot (migrated to the current version) that passes `isValid`,
 * or undefined when the session carries none. The fallback to older entries
 * makes a corrupted or hand-edited newest snapshot degrade to the previous
 * state instead of wiping the map.
 */
export function readLatestSnapshot(
	sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">,
	isValid: (nodes: WorkmapRoot[]) => boolean,
): RestoredSnapshot | undefined {
	const entries = sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== WORKMAP_ENTRY_TYPE) continue;
		const data = entry.data as (Partial<WorkmapSnapshot> & { version?: number }) | undefined;
		if (!Array.isArray(data?.nodes)) continue;
		const version = data?.version as number | undefined;
		if (version !== WORKMAP_SNAPSHOT_VERSION && version !== 6 && version !== 5 && version !== 4) continue;
		// Guard before trusting the array: a malformed node (e.g. null) must skip
		// the snapshot, not crash session start.
		if (data.nodes.some((node) => !node || typeof node !== "object")) continue;
		const migrated = migrateToV7(data.nodes as WorkmapRoot[], version, data.goal);
		if (!isValid(migrated.nodes)) continue;
		return migrated;
	}
	return undefined;
}

/**
 * Migrate v4–v6 node arrays to the v7 shape (ADR 0017/0018): `heading`
 * remaps to `goal` first (v4 lineage), the first goal root lifts out of the
 * node list into the `goal` header (the rest drop — they were task
 * restatements), and `status` renames to `label`. Migration runs before
 * semantic validation: malformed nodes pass through untouched so validate()
 * rejects the snapshot instead of this function crashing session start.
 */
function migrateToV7(nodes: WorkmapRoot[], version: number, goal?: WorkmapGoal): RestoredSnapshot {
	const rename = (node: WorkmapChild & { status?: string }): WorkmapChild => {
		const { status, ...rest } = node;
		return { ...rest, ...(rest.label || !status ? {} : { label: status }) };
	};
	let header: WorkmapGoal | undefined = goal;
	const next: WorkmapRoot[] = [];
	for (const raw of nodes) {
		const legacy = raw as WorkmapRoot & { status?: string };
		const type = version === 4 && (legacy.type as string) === "heading" ? "goal" : legacy.type;
		if (type === "goal") {
			if (header === undefined) {
				header = { title: String(legacy.title ?? ""), ...(legacy.status ? { label: legacy.status } : {}) };
			}
			continue;
		}
		next.push({
			...rename(legacy),
			type: legacy.type,
			title: legacy.title,
			...(legacy.children ? { children: legacy.children.map((child) => rename(child)) } : {}),
		});
	}
	return { ...(header ? { goal: header } : {}), nodes: next };
}
