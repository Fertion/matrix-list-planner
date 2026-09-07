import type { BasesViewConfig } from 'obsidian';

export const COLUMN_WIDTHS_KEY = 'columnWidths';

export const FILE_COLUMN_KEY = '__file__';
export const POOL_COLUMN_KEY = '__pool__';

export const DEFAULT_FILE_WIDTH = 180;
export const DEFAULT_PROP_WIDTH = 180;
export const DEFAULT_POOL_WIDTH = 240;

/** Absolute floor so the column doesn't disappear completely. */
export const ABS_MIN_COLUMN_WIDTH = 1;

export type ColumnWidths = Record<string, number>;

export function readColumnWidths(config: BasesViewConfig): ColumnWidths {
	const raw = config.get(COLUMN_WIDTHS_KEY);
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}
	const result: ColumnWidths = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
			result[key] = value;
		}
	}
	return result;
}

export function writeColumnWidths(
	config: BasesViewConfig,
	widths: ColumnWidths,
): void {
	config.set(COLUMN_WIDTHS_KEY, { ...widths });
}

export function getColumnWidth(
	widths: ColumnWidths,
	key: string,
	fallback: number,
): number {
	const stored = widths[key];
	return typeof stored === 'number' && stored >= ABS_MIN_COLUMN_WIDTH
		? stored
		: fallback;
}
