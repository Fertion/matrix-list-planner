import type { App, TFile } from 'obsidian';
import type { CellUpdate, MoveOperation } from '../model/types';
import { readListFromFrontmatter } from '../model/listValues';

/**
 * Apply frontmatter list updates with best-effort rollback on multi-file moves.
 */
export async function applyMoveOperation(
	app: App,
	operation: MoveOperation,
): Promise<void> {
	const cellUpdates = [operation.source, operation.target].filter(
		(u): u is CellUpdate => u != null,
	);

	if (cellUpdates.length === 0) {
		return;
	}

	// Same file: one atomic frontmatter write for all properties on that file
	const byFile = new Map<string, CellUpdate[]>();
	for (const update of cellUpdates) {
		const list = byFile.get(update.filePath) ?? [];
		list.push(update);
		byFile.set(update.filePath, list);
	}

	const files = [...byFile.keys()];
	const backups = new Map<string, Record<string, unknown[]>>();

	for (const filePath of files) {
		const file = app.vault.getFileByPath(filePath);
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		const updates = byFile.get(filePath)!;
		const backup: Record<string, unknown[]> = {};
		for (const u of updates) {
			backup[u.property] = readListFromFrontmatter(app, file, u.property);
		}
		backups.set(filePath, backup);
	}

	const applied: string[] = [];
	try {
		for (const filePath of files) {
			const file = app.vault.getFileByPath(filePath);
			if (!file) throw new Error(`File not found: ${filePath}`);
			const updates = byFile.get(filePath)!;
			await writeCellUpdates(app, file, updates);
			applied.push(filePath);
		}
	} catch (error) {
		for (const filePath of applied.reverse()) {
			const file = app.vault.getFileByPath(filePath);
			const backup = backups.get(filePath);
			if (!file || !backup) continue;
			try {
				await restoreBackup(app, file, backup);
			} catch {
				// Best-effort rollback
			}
		}
		throw error;
	}
}

function setFrontmatterList(
	frontmatter: Record<string, unknown>,
	property: string,
	value: unknown[],
): void {
	frontmatter[property] = [...value];
}

async function writeCellUpdates(
	app: App,
	file: TFile,
	updates: CellUpdate[],
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		const fm = frontmatter as Record<string, unknown>;
		for (const update of updates) {
			setFrontmatterList(fm, update.property, update.newValue);
		}
	});
}

async function restoreBackup(
	app: App,
	file: TFile,
	backup: Record<string, unknown[]>,
): Promise<void> {
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		const fm = frontmatter as Record<string, unknown>;
		for (const [property, value] of Object.entries(backup)) {
			setFrontmatterList(fm, property, value);
		}
	});
}

export async function writeListProperty(
	app: App,
	filePath: string,
	property: string,
	newValue: unknown[],
): Promise<void> {
	const file = app.vault.getFileByPath(filePath);
	if (!file) throw new Error(`File not found: ${filePath}`);
	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		setFrontmatterList(frontmatter as Record<string, unknown>, property, newValue);
	});
}
