/**
 * Session-entry persistence protocol for the workmap.
 *
 * This module owns the wire format of persisted snapshots and the conversation
 * with the Pi session file — nothing else. Semantic validation of node content
 * (types, titles, capacity, double heading) lives in state.ts; this module only
 * guarantees that what it hands over is a structurally plausible snapshot of
 * the current version.
 *
 * Session semantics that fall out of the protocol:
 * - Snapshots are appended, never updated, so reading the newest one means
 *   `/tree` branch navigation can never roll the workmap back;
 * - `resume` restores the latest snapshot; an interactive fork inherits it and
 *   then evolves independently; a new session starts from an empty map.
 *
 * Versioning: snapshots predating the current version are skipped without
 * migration — the package is unpublished and workmap state is ephemeral by
 * design (situation awareness, not storage). The newest current-version
 * snapshot wins; older versions are simply not found.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkmapRoot } from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";

/**
 * Snapshot version 4: id-less two-layer roots. Tree age (`updatedAt`) is gone —
 * the map is fully rewritten every user prompt, so per-tree age has no meaning
 * to track (ADR 0015).
 */
export const WORKMAP_SNAPSHOT_VERSION = 4;

export interface WorkmapSnapshot {
	version: typeof WORKMAP_SNAPSHOT_VERSION;
	nodes: WorkmapRoot[];
}

export function persistSnapshot(pi: Pick<ExtensionAPI, "appendEntry">, nodes: readonly WorkmapRoot[]): void {
	pi.appendEntry<WorkmapSnapshot>(WORKMAP_ENTRY_TYPE, {
		version: WORKMAP_SNAPSHOT_VERSION,
		nodes: nodes.map((node) => ({ ...node })),
	});
}

/**
 * Nodes of the newest current-version snapshot, or undefined when the session
 * carries none (including sessions that only carry older versions).
 */
export function readLatestSnapshot(
	sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">,
): WorkmapRoot[] | undefined {
	const entries = sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== WORKMAP_ENTRY_TYPE) continue;
		const data = entry.data as Partial<WorkmapSnapshot> | undefined;
		if (data?.version !== WORKMAP_SNAPSHOT_VERSION || !Array.isArray(data.nodes)) continue;
		// Guard before trusting the array: a malformed node (e.g. null) must skip
		// the snapshot, not crash session start.
		if (data.nodes.some((node) => !node || typeof node !== "object")) continue;
		return data.nodes as WorkmapRoot[];
	}
	return undefined;
}
