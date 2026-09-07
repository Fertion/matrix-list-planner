import type { DragItem, DropTarget, MoveOperation } from './types';

function sameContainer(drag: DragItem, drop: DropTarget): boolean {
	if (drag.sourceType !== drop.targetType) return false;
	if (drag.sourceType === 'unassigned') return true;
	return (
		drag.sourceFilePath === drop.targetFilePath &&
		drag.sourceProperty === drop.targetProperty
	);
}

/**
 * Pure move: remove from source by index, insert at target index.
 * Identifies items by container + index, not by value.
 */
export function moveItem(
	drag: DragItem,
	drop: DropTarget,
	getCellItems: (filePath: string, property: string) => unknown[],
	getUnassigned: () => unknown[],
): MoveOperation | null {
	let sourceItems: unknown[];
	if (drag.sourceType === 'unassigned') {
		sourceItems = [...getUnassigned()];
	} else if (drag.sourceFilePath && drag.sourceProperty) {
		sourceItems = [...getCellItems(drag.sourceFilePath, drag.sourceProperty)];
	} else {
		return null;
	}

	if (drag.sourceIndex < 0 || drag.sourceIndex >= sourceItems.length) {
		return null;
	}

	const same = sameContainer(drag, drop);

	let targetItems: unknown[];
	if (same) {
		targetItems = sourceItems;
	} else if (drop.targetType === 'unassigned') {
		targetItems = [...getUnassigned()];
	} else if (drop.targetFilePath && drop.targetProperty) {
		targetItems = [...getCellItems(drop.targetFilePath, drop.targetProperty)];
	} else {
		return null;
	}

	let insertAt = drop.targetIndex;
	if (insertAt < 0) insertAt = 0;
	if (insertAt > targetItems.length) insertAt = targetItems.length;

	// No-op drop on same slot
	if (same && (insertAt === drag.sourceIndex || insertAt === drag.sourceIndex + 1)) {
		return null;
	}

	const [moved] = sourceItems.splice(drag.sourceIndex, 1);
	if (moved === undefined) return null;

	if (same) {
		if (drag.sourceIndex < insertAt) insertAt -= 1;
		sourceItems.splice(insertAt, 0, moved);
		return buildOperation(drag, drop, sourceItems, sourceItems);
	}

	targetItems.splice(insertAt, 0, moved);
	return buildOperation(drag, drop, sourceItems, targetItems);
}

function buildOperation(
	drag: DragItem,
	drop: DropTarget,
	sourceItems: unknown[],
	targetItems: unknown[],
): MoveOperation {
	const op: MoveOperation = {};
	const touchedCells = new Map<string, { filePath: string; property: string; items: unknown[] }>();

	const touchCell = (filePath: string, property: string, items: unknown[]) => {
		touchedCells.set(`${filePath}::${property}`, { filePath, property, items });
	};

	if (drag.sourceType === 'cell' && drag.sourceFilePath && drag.sourceProperty) {
		touchCell(drag.sourceFilePath, drag.sourceProperty, sourceItems);
	}
	if (drop.targetType === 'cell' && drop.targetFilePath && drop.targetProperty) {
		touchCell(drop.targetFilePath, drop.targetProperty, targetItems);
	}

	const cellUpdates = [...touchedCells.values()];
	if (cellUpdates.length === 1) {
		const only = cellUpdates[0]!;
		op.source = {
			filePath: only.filePath,
			property: only.property,
			newValue: only.items,
		};
	} else if (cellUpdates.length === 2) {
		op.source = {
			filePath: cellUpdates[0]!.filePath,
			property: cellUpdates[0]!.property,
			newValue: cellUpdates[0]!.items,
		};
		op.target = {
			filePath: cellUpdates[1]!.filePath,
			property: cellUpdates[1]!.property,
			newValue: cellUpdates[1]!.items,
		};
	}

	if (drag.sourceType === 'unassigned' || drop.targetType === 'unassigned') {
		if (drag.sourceType === 'unassigned') {
			op.unassigned = sourceItems;
		} else {
			op.unassigned = targetItems;
		}
	}

	return op;
}

export function removeItemAt(items: unknown[], index: number): unknown[] | null {
	if (index < 0 || index >= items.length) return null;
	const next = [...items];
	next.splice(index, 1);
	return next;
}

export function insertItemAt(
	items: unknown[],
	index: number,
	value: unknown,
): unknown[] {
	const next = [...items];
	let at = index;
	if (at < 0) at = 0;
	if (at > next.length) at = next.length;
	next.splice(at, 0, value);
	return next;
}
