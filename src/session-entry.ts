/**
 * Session-entry persistence protocol for the workmap.
 *
 * This module owns the wire format of persisted snapshots and the conversation
 * with the Pi session file — nothing else. Semantic validation of node content
 * (types, titles, capacity, the goal anchor) lives in state.ts; this module
 * only
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
 * design (situation awareness, not storage). The newest snapshot that passes
 * the caller's semantic validation wins; older or invalid ones are skipped.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { WorkmapRoot } from "./types.js";

export const WORKMAP_ENTRY_TYPE = "pi-workmap-state";

/**
 * Snapshot version 5: node type `heading` renamed to `goal`. Version 4
 * snapshots migrate by remapping the type on read (ablation branch of
 * ADR 0008's rename channel).
 */
export const WORKMAP_SNAPSHOT_VERSION = 5;

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
 * Nodes of the newest snapshot that passes `isValid`, or undefined when the
 * session carries none (including sessions that only carry older versions or
 * snapshots the validator rejects). The fallback to older entries makes a
 * corrupted or hand-edited newest snapshot degrade to the previous state
 * instead of wiping the map.
 */
export function readLatestSnapshot(
	sessionManager: Pick<ExtensionContext["sessionManager"], "getEntries">,
	isValid: (nodes: WorkmapRoot[]) => boolean,
): WorkmapRoot[] | undefined {
	const entries = sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== WORKMAP_ENTRY_TYPE) continue;
		const data = entry.data as Partial<WorkmapSnapshot> | undefined;
		if (!Array.isArray(data?.nodes)) continue;
		const version = data?.version as number | undefined;
		if (version !== WORKMAP_SNAPSHOT_VERSION && version !== 4) continue;
		// Guard before trusting the array: a malformed node (e.g. null) must skip
		// the snapshot, not crash session start.
		if (data.nodes.some((node) => !node || typeof node !== "object")) continue;
		const nodes = version === 4 ? migrateV4Nodes(data.nodes as WorkmapRoot[]) : (data.nodes as WorkmapRoot[]);
		if (!isValid(nodes)) continue;
		return nodes;
	}
	return undefined;
}

/** Version 4 → 5: the `heading` node type was renamed to `goal` (ADR 0008 channel). */
export function migrateV4Nodes(nodes: WorkmapRoot[]): WorkmapRoot[] {
	const remap = (node: WorkmapRoot): WorkmapRoot => ({
		...node,
		type: (node.type as string) === "heading" ? "goal" : node.type,
		// Migration runs before semantic validation: malformed children pass
		// through untouched so validate() rejects the snapshot instead of this
		// function crashing session start.
		...(Array.isArray(node.children)
			? { children: node.children.map((child) => (child && typeof child === "object" ? remap(child) : child)) }
			: {}),
	});
	return nodes.map(remap);
}
