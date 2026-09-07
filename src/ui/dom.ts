import { Menu, setIcon, type App } from 'obsidian';
import { displayItemValue } from '../model/listValues';
import type { DragItem, DropTarget } from '../model/types';
import { DRAG_MIME } from '../model/types';

export type MatrixCallbacks = {
	onDrop: (drag: DragItem, drop: DropTarget) => void;
	onAdd: (target: DropTarget) => void;
	onDelete: (drag: DragItem) => void;
	onOpenFile: (filePath: string, event: MouseEvent) => void;
};

type ActiveDrag = {
	item: DragItem;
	ghostEl: HTMLElement | null;
};

let activeDrag: ActiveDrag | null = null;

export function getActiveDrag(): DragItem | null {
	return activeDrag?.item ?? null;
}

export function clearActiveDrag(): void {
	activeDrag?.ghostEl?.remove();
	activeDrag = null;
	document.body.classList.remove('mlp-dragging');
}

function setActiveDrag(item: DragItem, el: HTMLElement): void {
	clearActiveDrag();
	activeDrag = { item, ghostEl: null };
	document.body.classList.add('mlp-dragging');
	el.classList.add('mlp-item--dragging');
}

export function renderListItem(
	parent: HTMLElement,
	value: unknown,
	index: number,
	source: Omit<DragItem, 'sourceIndex' | 'value'>,
	callbacks: MatrixCallbacks,
): HTMLElement {
	const itemEl = parent.createDiv({ cls: 'mlp-item' });
	itemEl.setAttr('draggable', 'true');
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

	itemEl.addEventListener('dragstart', (evt) => {
		setActiveDrag(dragItem, itemEl);
		evt.dataTransfer?.setData(DRAG_MIME, JSON.stringify(dragItem));
		evt.dataTransfer?.setData('text/plain', label);
		if (evt.dataTransfer) {
			evt.dataTransfer.effectAllowed = 'move';
		}
	});

	itemEl.addEventListener('dragend', () => {
		itemEl.classList.remove('mlp-item--dragging');
		clearDropIndicators();
		clearActiveDrag();
	});

	deleteBtn.addEventListener('click', (evt) => {
		evt.stopPropagation();
		callbacks.onDelete(dragItem);
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

	// Drop between items: top half = before, bottom half = after
	itemEl.addEventListener('dragover', (evt) => {
		if (!getActiveDrag()) return;
		evt.preventDefault();
		evt.stopPropagation();
		const rect = itemEl.getBoundingClientRect();
		const before = evt.clientY < rect.top + rect.height / 2;
		clearDropIndicators();
		itemEl.classList.add(before ? 'mlp-drop-before' : 'mlp-drop-after');
		itemEl.dataset.dropIndex = String(before ? index : index + 1);
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
		const before = evt.clientY < rect.top + rect.height / 2;
		const targetIndex = before ? index : index + 1;

		const drop: DropTarget = {
			targetType: source.sourceType,
			targetFilePath: source.sourceFilePath,
			targetProperty: source.sourceProperty,
			targetIndex,
		};
		callbacks.onDrop(drag, drop);
	});

	return itemEl;
}

export function wireDropZone(
	el: HTMLElement,
	targetBase: Omit<DropTarget, 'targetIndex'>,
	getAppendIndex: () => number,
	callbacks: MatrixCallbacks,
): void {
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
			target instanceof HTMLElement ? target.closest('.mlp-item') : null;
		let targetIndex = getAppendIndex();
		if (itemEl instanceof HTMLElement && itemEl.dataset.dropIndex != null) {
			targetIndex = Number(itemEl.dataset.dropIndex);
		}

		callbacks.onDrop(drag, { ...targetBase, targetIndex });
	});
}

export function renderAddButton(
	parent: HTMLElement,
	label: string,
	onClick: () => void,
): void {
	const btn = parent.createEl('button', {
		cls: 'mlp-add-btn',
		text: label,
		attr: { type: 'button' },
	});
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
	document.querySelectorAll('.mlp-drop-before, .mlp-drop-after, .mlp-drop-target').forEach((el) => {
		el.classList.remove('mlp-drop-before', 'mlp-drop-after', 'mlp-drop-target');
	});
}
