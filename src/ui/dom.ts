import { Menu, Platform, setIcon, type App } from 'obsidian';
import { displayItemValue } from '../model/listValues';
import type { DragItem, DropTarget } from '../model/types';
import { DRAG_MIME } from '../model/types';
import { ABS_MIN_COLUMN_WIDTH } from '../storage/columnWidths';

export type MatrixCallbacks = {
	onDrop: (drag: DragItem, drop: DropTarget) => void;
	onAdd: (target: DropTarget) => void;
	onDelete: (drag: DragItem) => void;
	onOpenFile: (filePath: string, event: MouseEvent) => void;
	onColumnResize: (key: string, width: number) => void;
};

type ActiveDrag = {
	item: DragItem;
	sourceEl: HTMLElement;
	ghostEl: HTMLElement | null;
	pointerId: number | null;
};

let activeDrag: ActiveDrag | null = null;

export function getActiveDrag(): DragItem | null {
	return activeDrag?.item ?? null;
}

export function clearActiveDrag(): void {
	if (activeDrag?.ghostEl) {
		activeDrag.ghostEl.remove();
	}
	if (activeDrag?.sourceEl) {
		activeDrag.sourceEl.classList.remove('mlp-item--dragging');
	}
	activeDrag = null;
	document.body.classList.remove('mlp-dragging');
}

function setActiveDrag(
	item: DragItem,
	el: HTMLElement,
	pointerId: number | null = null,
): void {
	clearActiveDrag();
	activeDrag = { item, sourceEl: el, ghostEl: null, pointerId };
	document.body.classList.add('mlp-dragging');
	el.classList.add('mlp-item--dragging');
}

function createGhost(label: string, x: number, y: number): HTMLElement {
	const ghost = document.body.createDiv({ cls: 'mlp-drag-ghost' });
	ghost.setText(label);
	ghost.style.left = `${x + 12}px`;
	ghost.style.top = `${y + 12}px`;
	return ghost;
}

function moveGhost(x: number, y: number): void {
	const ghost = activeDrag?.ghostEl;
	if (!ghost) return;
	ghost.style.left = `${x + 12}px`;
	ghost.style.top = `${y + 12}px`;
}

function resolveDropTarget(
	clientX: number,
	clientY: number,
): DropTarget | null {
	const el = document.elementFromPoint(clientX, clientY);
	if (!(el instanceof Element)) return null;

	const itemEl = el.closest('.mlp-item:not(.mlp-item--add)');
	if (itemEl instanceof HTMLElement && itemEl.dataset.dropIndex != null) {
		const cell = itemEl.closest('.mlp-cell');
		if (!(cell instanceof HTMLElement)) return null;
		return dropTargetFromCell(cell, Number(itemEl.dataset.dropIndex));
	}

	const cell = el.closest('.mlp-cell');
	if (!(cell instanceof HTMLElement)) return null;

	const list = cell.querySelector('.mlp-cell-list');
	const count = list
		? list.querySelectorAll('.mlp-item:not(.mlp-item--add)').length
		: 0;
	return dropTargetFromCell(cell, count);
}

function dropTargetFromCell(cell: HTMLElement, targetIndex: number): DropTarget | null {
	const type = cell.dataset.containerType;
	if (type !== 'cell' && type !== 'unassigned') return null;
	return {
		targetType: type,
		targetFilePath: cell.dataset.filePath || undefined,
		targetProperty: cell.dataset.property || undefined,
		targetIndex,
	};
}

function updateItemDropIndicator(
	itemEl: HTMLElement,
	index: number,
	clientX: number,
): void {
	const rect = itemEl.getBoundingClientRect();
	const before = clientX < rect.left + rect.width / 2;
	clearDropIndicators();
	itemEl.classList.add(before ? 'mlp-drop-before' : 'mlp-drop-after');
	itemEl.dataset.dropIndex = String(before ? index : index + 1);
}

export function renderListItem(
	parent: HTMLElement,
	value: unknown,
	index: number,
	source: Omit<DragItem, 'sourceIndex' | 'value'>,
	callbacks: MatrixCallbacks,
): HTMLElement {
	const itemEl = parent.createDiv({ cls: 'mlp-item' });
	itemEl.setAttr('tabindex', '0');

	const label = displayItemValue(value);
	itemEl.createSpan({ cls: 'mlp-item-label', text: label });

	const deleteBtn = itemEl.createEl('button', {
		cls: 'mlp-item-delete clickable-icon',
		attr: { 'aria-label': 'Удалить', type: 'button' },
	});
	setIcon(deleteBtn, 'x');

	const dragItem: DragItem = {
		...source,
		sourceIndex: index,
		value,
	};

	// Desktop: HTML5 DnD. Mobile: custom pointer drag (no context menu).
	if (!Platform.isMobile) {
		itemEl.setAttr('draggable', 'true');

		itemEl.addEventListener('dragstart', (evt) => {
			setActiveDrag(dragItem, itemEl);
			evt.dataTransfer?.setData(DRAG_MIME, JSON.stringify(dragItem));
			evt.dataTransfer?.setData('text/plain', label);
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = 'move';
			}
		});

		itemEl.addEventListener('dragend', () => {
			clearDropIndicators();
			clearActiveDrag();
		});

		itemEl.addEventListener('contextmenu', (evt) => {
			evt.preventDefault();
			const menu = new Menu();
			menu.addItem((menuItem) => {
				menuItem.setTitle('Удалить').setIcon('trash').onClick(() => {
					callbacks.onDelete(dragItem);
				});
			});
			menu.showAtMouseEvent(evt);
		});
	} else {
		itemEl.setAttr('draggable', 'false');
		wireTouchDrag(itemEl, dragItem, label, callbacks);
	}

	deleteBtn.addEventListener('click', (evt) => {
		evt.stopPropagation();
		callbacks.onDelete(dragItem);
	});

	itemEl.addEventListener('dragover', (evt) => {
		if (!getActiveDrag()) return;
		evt.preventDefault();
		evt.stopPropagation();
		updateItemDropIndicator(itemEl, index, evt.clientX);
	});

	itemEl.addEventListener('dragleave', () => {
		itemEl.classList.remove('mlp-drop-before', 'mlp-drop-after');
	});

	itemEl.addEventListener('drop', (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		const drag = parseDrag(evt) ?? getActiveDrag();
		clearDropIndicators();
		clearActiveDrag();
		if (!drag) return;

		const rect = itemEl.getBoundingClientRect();
		const before = evt.clientX < rect.left + rect.width / 2;
		const targetIndex = before ? index : index + 1;

		callbacks.onDrop(drag, {
			targetType: source.sourceType,
			targetFilePath: source.sourceFilePath,
			targetProperty: source.sourceProperty,
			targetIndex,
		});
	});

	return itemEl;
}

function wireTouchDrag(
	itemEl: HTMLElement,
	dragItem: DragItem,
	label: string,
	callbacks: MatrixCallbacks,
): void {
	const MOVE_THRESHOLD = 8;
	let tracking: {
		pointerId: number;
		startX: number;
		startY: number;
		started: boolean;
	} | null = null;

	const onContextMenu = (evt: Event) => {
		evt.preventDefault();
		evt.stopPropagation();
	};
	itemEl.addEventListener('contextmenu', onContextMenu);
	itemEl.addEventListener('selectstart', onContextMenu);

	itemEl.addEventListener('pointerdown', (evt) => {
		if (evt.button !== 0) return;
		if ((evt.target as HTMLElement).closest('.mlp-item-delete')) return;

		tracking = {
			pointerId: evt.pointerId,
			startX: evt.clientX,
			startY: evt.clientY,
			started: false,
		};
		itemEl.setPointerCapture(evt.pointerId);
	});

	itemEl.addEventListener('pointermove', (evt) => {
		if (!tracking || tracking.pointerId !== evt.pointerId) return;

		const dx = evt.clientX - tracking.startX;
		const dy = evt.clientY - tracking.startY;

		if (!tracking.started) {
			if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
			tracking.started = true;
			setActiveDrag(dragItem, itemEl, evt.pointerId);
			if (activeDrag) {
				activeDrag.ghostEl = createGhost(label, evt.clientX, evt.clientY);
			}
		}

		evt.preventDefault();
		moveGhost(evt.clientX, evt.clientY);

		const under = document.elementFromPoint(evt.clientX, evt.clientY);
		clearDropIndicators();
		if (under instanceof Element) {
			const overItem = under.closest('.mlp-item:not(.mlp-item--add)');
			if (overItem instanceof HTMLElement && overItem !== itemEl) {
				const siblings = overItem.parentElement
					? Array.from(
							overItem.parentElement.querySelectorAll(
								'.mlp-item:not(.mlp-item--add)',
							),
						)
					: [];
				const overIndex = siblings.indexOf(overItem);
				if (overIndex >= 0) {
					updateItemDropIndicator(overItem, overIndex, evt.clientX);
				}
			} else {
				const cell = under.closest('.mlp-cell');
				if (cell instanceof HTMLElement) {
					cell.classList.add('mlp-drop-target');
				}
			}
		}
	});

	const finishPointer = (evt: PointerEvent) => {
		if (!tracking || tracking.pointerId !== evt.pointerId) return;
		const wasDragging = tracking.started;
		tracking = null;

		try {
			itemEl.releasePointerCapture(evt.pointerId);
		} catch {
			// already released
		}

		if (!wasDragging) {
			clearActiveDrag();
			return;
		}

		const drag = getActiveDrag();
		const drop = resolveDropTarget(evt.clientX, evt.clientY);
		clearDropIndicators();
		clearActiveDrag();

		if (drag && drop) {
			callbacks.onDrop(drag, drop);
		}
	};

	itemEl.addEventListener('pointerup', finishPointer);
	itemEl.addEventListener('pointercancel', finishPointer);
}

export function wireDropZone(
	el: HTMLElement,
	targetBase: Omit<DropTarget, 'targetIndex'>,
	getAppendIndex: () => number,
	callbacks: MatrixCallbacks,
): void {
	el.dataset.containerType = targetBase.targetType;
	if (targetBase.targetFilePath) {
		el.dataset.filePath = targetBase.targetFilePath;
	}
	if (targetBase.targetProperty) {
		el.dataset.property = targetBase.targetProperty;
	}

	el.addEventListener('dragover', (evt) => {
		if (!getActiveDrag()) return;
		evt.preventDefault();
		el.classList.add('mlp-drop-target');
		if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
	});

	el.addEventListener('dragleave', (evt) => {
		if (!el.contains(evt.relatedTarget as Node)) {
			el.classList.remove('mlp-drop-target');
		}
	});

	el.addEventListener('drop', (evt) => {
		evt.preventDefault();
		el.classList.remove('mlp-drop-target');
		const drag = parseDrag(evt) ?? getActiveDrag();
		clearDropIndicators();
		clearActiveDrag();
		if (!drag) return;

		const target = evt.target;
		const itemEl =
			target instanceof HTMLElement
				? target.closest('.mlp-item:not(.mlp-item--add)')
				: null;
		let targetIndex = getAppendIndex();
		if (itemEl instanceof HTMLElement && itemEl.dataset.dropIndex != null) {
			targetIndex = Number(itemEl.dataset.dropIndex);
		}

		callbacks.onDrop(drag, { ...targetBase, targetIndex });
	});
}

export function renderAddButton(
	parent: HTMLElement,
	onClick: () => void,
): void {
	const btn = parent.createEl('button', {
		cls: 'mlp-item mlp-item--add',
		attr: {
			type: 'button',
			'aria-label': 'Добавить',
			title: 'Добавить',
		},
	});
	setIcon(btn, 'plus');
	btn.addEventListener('click', (evt) => {
		evt.stopPropagation();
		onClick();
	});
}

export function renderFileCell(
	parent: HTMLElement,
	app: App,
	filePath: string,
	displayName: string,
	callbacks: MatrixCallbacks,
): void {
	const cell = parent.createDiv({ cls: 'mlp-file-cell' });
	const link = cell.createEl('a', {
		cls: 'mlp-file-link internal-link',
		text: displayName,
		attr: { href: filePath },
	});

	link.addEventListener('click', (evt) => {
		evt.preventDefault();
		callbacks.onOpenFile(filePath, evt);
	});

	link.addEventListener('mouseover', (evt) => {
		app.workspace.trigger('hover-link', {
			event: evt,
			source: 'matrix-list-planner',
			hoverParent: parent,
			targetEl: link,
			linktext: filePath,
		});
	});
}

export function wireColumnResize(
	headerEl: HTMLElement,
	columnKey: string,
	onResize: (key: string, width: number) => void,
	applyWidth: (width: number) => void,
	options?: { edge?: 'left' | 'right'; getStartWidth?: () => number },
): void {
	const edge = options?.edge ?? 'right';
	const handle = headerEl.createDiv({
		cls:
			edge === 'left'
				? 'mlp-col-resize mlp-col-resize--left'
				: 'mlp-col-resize',
		attr: { title: 'Изменить ширину' },
	});

	handle.addEventListener('pointerdown', (evt) => {
		if (evt.button !== 0) return;
		evt.preventDefault();
		evt.stopPropagation();

		const startX = evt.clientX;
		const startWidth =
			options?.getStartWidth?.() ?? headerEl.getBoundingClientRect().width;
		document.body.classList.add('mlp-resizing');
		handle.setPointerCapture(evt.pointerId);

		const onMove = (moveEvt: PointerEvent) => {
			if (moveEvt.pointerId !== evt.pointerId) return;
			const delta =
				edge === 'left'
					? startX - moveEvt.clientX
					: moveEvt.clientX - startX;
			const next = Math.max(
				ABS_MIN_COLUMN_WIDTH,
				Math.round(startWidth + delta),
			);
			applyWidth(next);
		};

		const onUp = (upEvt: PointerEvent) => {
			if (upEvt.pointerId !== evt.pointerId) return;
			handle.removeEventListener('pointermove', onMove);
			handle.removeEventListener('pointerup', onUp);
			handle.removeEventListener('pointercancel', onUp);
			document.body.classList.remove('mlp-resizing');
			const delta =
				edge === 'left' ? startX - upEvt.clientX : upEvt.clientX - startX;
			const next = Math.max(
				ABS_MIN_COLUMN_WIDTH,
				Math.round(startWidth + delta),
			);
			onResize(columnKey, next);
		};

		handle.addEventListener('pointermove', onMove);
		handle.addEventListener('pointerup', onUp);
		handle.addEventListener('pointercancel', onUp);
	});
}

function parseDrag(evt: DragEvent): DragItem | null {
	const raw = evt.dataTransfer?.getData(DRAG_MIME);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as DragItem;
	} catch {
		return null;
	}
}

function clearDropIndicators(): void {
	document
		.querySelectorAll('.mlp-drop-before, .mlp-drop-after, .mlp-drop-target')
		.forEach((el) => {
			el.classList.remove(
				'mlp-drop-before',
				'mlp-drop-after',
				'mlp-drop-target',
			);
		});
}
