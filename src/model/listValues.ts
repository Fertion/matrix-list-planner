import type { App, TFile } from 'obsidian';
import { ListValue, parsePropertyId, type BasesEntry, type BasesPropertyId } from 'obsidian';
import type { MatrixColumn, MatrixRow, MatrixSnapshot } from './types';

export function normalizeListValue(raw: unknown): unknown[] {
	if (raw == null) return [];
	if (Array.isArray(raw)) return raw.map((item) => item as unknown);
	return [raw];
}

export function displayItemValue(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') {
		return value.toString();
	}
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value);
		} catch {
			return '[object]';
		}
	}
	return '[unknown]';
}

/**
 * Read list property from vault metadata (source of truth for edits).
 */
export function readListFromFrontmatter(
	app: App,
	file: TFile,
	propertyName: string,
): unknown[] {
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	if (!frontmatter || !(propertyName in frontmatter)) {
		return [];
	}
	return normalizeListValue(frontmatter[propertyName]);
}

export function listFromBasesValue(value: unknown): unknown[] | null {
	if (value == null) return null;
	if (value instanceof ListValue) {
		const items: unknown[] = [];
		for (let i = 0; i < value.length(); i++) {
			const item = value.get(i);
			items.push(item?.toString() ?? '');
		}
		return items;
	}
	return null;
}

export function isNoteListColumn(propertyId: BasesPropertyId): boolean {
	const { type } = parsePropertyId(propertyId);
	return type === 'note';
}

export function buildColumns(
	order: BasesPropertyId[],
	getDisplayName: (id: BasesPropertyId) => string,
): MatrixColumn[] {
	const columns: MatrixColumn[] = [];
	for (const propertyId of order) {
		if (!isNoteListColumn(propertyId)) continue;
		const { name } = parsePropertyId(propertyId);
		columns.push({
			propertyId,
			propertyName: name,
			displayName: getDisplayName(propertyId),
		});
	}
	return columns;
}

export function buildMatrixSnapshot(
	app: App,
	entries: BasesEntry[],
	columns: MatrixColumn[],
	unassigned: unknown[],
	getDisplayName: (entry: BasesEntry) => string,
): MatrixSnapshot {
	const rows: MatrixRow[] = entries.map((entry) => {
		const cells: Record<string, unknown[]> = {};
		for (const col of columns) {
			cells[col.propertyName] = readListFromFrontmatter(
				app,
				entry.file,
				col.propertyName,
			);
		}
		return {
			filePath: entry.file.path,
			fileName: entry.file.name,
			displayName: getDisplayName(entry),
			cells,
		};
	});

	return {
		columns,
		rows,
		unassigned: [...unassigned],
	};
}
