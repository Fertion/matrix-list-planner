import type { BasesViewConfig } from 'obsidian';
import { normalizeListValue } from '../model/listValues';

export const UNASSIGNED_CONFIG_KEY = 'unassigned';

export function readUnassigned(config: BasesViewConfig): unknown[] {
	const raw = config.get(UNASSIGNED_CONFIG_KEY);
	return normalizeListValue(raw);
}

export function writeUnassigned(config: BasesViewConfig, items: unknown[]): void {
	config.set(UNASSIGNED_CONFIG_KEY, [...items]);
}
