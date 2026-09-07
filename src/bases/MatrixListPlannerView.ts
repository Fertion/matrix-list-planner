import {
	BasesView,
	Keymap,
	Notice,
	parsePropertyId,
	type BasesEntry,
	type BasesPropertyId,
	type HoverParent,
	type HoverPopover,
	type QueryController,
} from 'obsidian';
import { VIEW_TYPE } from './constants';
import { buildColumns, buildMatrixSnapshot, displayItemValue } from '../model/listValues';
import { insertItemAt, moveItem, removeItemAt } from '../model/moveItem';
import type {
	DragItem,
	DropTarget,
	MatrixSnapshot,
	MoveOperation,
} from '../model/types';
import { applyMoveOperation, writeListProperty } from '../storage/propertyStorage';
import { readUnassigned, writeUnassigned } from '../storage/unassignedStorage';
import {
	renderAddButton,
	renderFileCell,
	renderListItem,
	wireDropZone,
	type MatrixCallbacks,
} from '../ui/dom';
import { ConfirmModal, PromptModal } from '../ui/modals';

export class MatrixListPlannerView extends BasesView implements HoverParent {
	readonly type = VIEW_TYPE;
	hoverPopover: HoverPopover | null = null;

	private readonly rootEl: HTMLElement;
	private snapshot: MatrixSnapshot | null = null;
	private writeChain: Promise<void> = Promise.resolve();
	private isWriting = false;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.rootEl = parentEl.createDiv({ cls: 'mlp-root' });
	}

	onload(): void {
		this.registerEvent(
			this.app.metadataCache.on('changed', () => {
				if (!this.isWriting) {
					this.refreshFromData();
				}
			}),
		);
	}

	onDataUpdated(): void {
		this.refreshFromData();
	}

	private refreshFromData(): void {
		const order = this.config.getOrder();
		const columns = buildColumns(order, (id) => this.config.getDisplayName(id));
		const unassigned = readUnassigned(this.config);
		const entries = this.data?.data ?? [];

		this.snapshot = buildMatrixSnapshot(
			this.app,
			entries,
			columns,
			unassigned,
			(entry) => this.getEntryDisplayName(entry, order),
		);

		this.render();
	}

	private getEntryDisplayName(entry: BasesEntry, order: BasesPropertyId[]): string {
		const fileNameProp = order.find((id) => {
			const parsed = parsePropertyId(id);
			return parsed.type === 'file' && parsed.name === 'name';
		});
		if (fileNameProp) {
			const value = entry.getValue(fileNameProp);
			if (value?.isTruthy()) {
				return value.toString();
			}
		}
		return entry.file.basename;
	}

	private render(): void {
		const snapshot = this.snapshot;
		this.rootEl.empty();

		if (!snapshot) {
			this.rootEl.createDiv({
				cls: 'mlp-empty',
				text: 'Загрузка…',
			});
			return;
		}

		if (snapshot.columns.length === 0) {
			this.rootEl.createDiv({
				cls: 'mlp-empty',
				text: 'Выберите list-свойства в меню Properties — они станут колонками матрицы.',
			});
			return;
		}

		const callbacks = this.createCallbacks();

		const layout = this.rootEl.createDiv({ cls: 'mlp-layout' });
		const tableWrap = layout.createDiv({ cls: 'mlp-table-wrap' });
		const table = tableWrap.createEl('table', { cls: 'mlp-table' });

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Файл', cls: 'mlp-th-file' });
		for (const col of snapshot.columns) {
			headerRow.createEl('th', {
				text: col.displayName,
				cls: 'mlp-th-prop',
			});
		}

		const tbody = table.createEl('tbody');

		if (snapshot.rows.length === 0) {
			const emptyRow = tbody.createEl('tr');
			const emptyCell = emptyRow.createEl('td', {
				cls: 'mlp-empty-cell',
				attr: { colspan: String(snapshot.columns.length + 1) },
			});
			emptyCell.setText('Нет файлов по текущему фильтру bases.');
		} else {
			for (const row of snapshot.rows) {
				const tr = tbody.createEl('tr', { cls: 'mlp-row' });
				const fileTd = tr.createEl('td', { cls: 'mlp-td-file' });
				renderFileCell(
					fileTd,
					this.app,
					row.filePath,
					row.displayName,
					callbacks,
				);

				for (const col of snapshot.columns) {
					const td = tr.createEl('td', { cls: 'mlp-td-cell' });
					const items = row.cells[col.propertyName] ?? [];
					this.renderCell(
						td,
						items,
						{
							sourceType: 'cell',
							sourceFilePath: row.filePath,
							sourceProperty: col.propertyName,
						},
						callbacks,
					);
				}
			}
		}

		const pool = layout.createDiv({ cls: 'mlp-pool' });
		pool.createDiv({ cls: 'mlp-pool-title', text: 'Нераспределённое' });
		const poolBody = pool.createDiv({ cls: 'mlp-pool-body' });
		this.renderCell(
			poolBody,
			snapshot.unassigned,
			{ sourceType: 'unassigned' },
			callbacks,
			true,
		);
	}

	private renderCell(
		parent: HTMLElement,
		items: unknown[],
		source: Omit<DragItem, 'sourceIndex' | 'value'>,
		callbacks: MatrixCallbacks,
		isPool = false,
	): void {
		const cellEl = parent.createDiv({
			cls: isPool ? 'mlp-cell mlp-cell--pool' : 'mlp-cell',
		});

		const listEl = cellEl.createDiv({ cls: 'mlp-cell-list' });

		if (items.length === 0) {
			listEl.createDiv({
				cls: 'mlp-cell-placeholder',
				text: 'Перетащите сюда',
			});
		} else {
			items.forEach((value, index) => {
				renderListItem(listEl, value, index, source, callbacks);
			});
		}

		wireDropZone(
			cellEl,
			{
				targetType: source.sourceType,
				targetFilePath: source.sourceFilePath,
				targetProperty: source.sourceProperty,
			},
			() => items.length,
			callbacks,
		);

		renderAddButton(cellEl, '+ Добавить', () => {
			callbacks.onAdd({
				targetType: source.sourceType,
				targetFilePath: source.sourceFilePath,
				targetProperty: source.sourceProperty,
				targetIndex: items.length,
			});
		});
	}

	private createCallbacks(): MatrixCallbacks {
		return {
			onDrop: (drag, drop) => {
				void this.handleDrop(drag, drop);
			},
			onAdd: (target) => {
				this.handleAdd(target);
			},
			onDelete: (drag) => {
				this.handleDelete(drag);
			},
			onOpenFile: (filePath, event) => {
				const modEvent = Keymap.isModEvent(event);
				void this.app.workspace.openLinkText(filePath, '', modEvent);
			},
		};
	}

	private enqueueWrite(task: () => Promise<void>): Promise<void> {
		const run = async () => {
			this.isWriting = true;
			try {
				await task();
			} finally {
				this.isWriting = false;
			}
		};
		this.writeChain = this.writeChain.then(run, run);
		return this.writeChain;
	}

	private getCellItems(filePath: string, property: string): unknown[] {
		const row = this.snapshot?.rows.find((r) => r.filePath === filePath);
		return [...(row?.cells[property] ?? [])];
	}

	private getUnassigned(): unknown[] {
		return [...(this.snapshot?.unassigned ?? [])];
	}

	private applyOptimistic(op: MoveOperation): void {
		if (!this.snapshot) return;

		if (op.source) {
			const row = this.snapshot.rows.find((r) => r.filePath === op.source!.filePath);
			if (row) {
				row.cells[op.source.property] = [...op.source.newValue];
			}
		}
		if (op.target) {
			const row = this.snapshot.rows.find((r) => r.filePath === op.target!.filePath);
			if (row) {
				row.cells[op.target.property] = [...op.target.newValue];
			}
		}
		if (op.unassigned) {
			this.snapshot.unassigned = [...op.unassigned];
		}
		this.render();
	}

	private async handleDrop(drag: DragItem, drop: DropTarget): Promise<void> {
		const op = moveItem(
			drag,
			drop,
			(filePath, property) => this.getCellItems(filePath, property),
			() => this.getUnassigned(),
		);
		if (!op) return;

		this.applyOptimistic(op);

		await this.enqueueWrite(async () => {
			try {
				if (op.source || op.target) {
					await applyMoveOperation(this.app, op);
				}
				if (op.unassigned) {
					writeUnassigned(this.config, op.unassigned);
				}
			} catch (error) {
				console.error(error);
				new Notice('Не удалось сохранить перемещение. Обновляю вид.');
				this.refreshFromData();
			}
		});
	}

	private handleAdd(target: DropTarget): void {
		new PromptModal(this.app, 'Добавить элемент', 'Введите значение', (value) => {
			void this.enqueueWrite(async () => {
				try {
					if (target.targetType === 'unassigned') {
						const next = insertItemAt(this.getUnassigned(), target.targetIndex, value);
						writeUnassigned(this.config, next);
						if (this.snapshot) {
							this.snapshot.unassigned = next;
							this.render();
						}
						return;
					}

					if (!target.targetFilePath || !target.targetProperty) return;
					const current = this.getCellItems(
						target.targetFilePath,
						target.targetProperty,
					);
					const next = insertItemAt(current, target.targetIndex, value);
					await writeListProperty(
						this.app,
						target.targetFilePath,
						target.targetProperty,
						next,
					);
					const row = this.snapshot?.rows.find(
						(r) => r.filePath === target.targetFilePath,
					);
					if (row) {
						row.cells[target.targetProperty] = next;
						this.render();
					}
				} catch (error) {
					console.error(error);
					new Notice('Не удалось добавить элемент.');
					this.refreshFromData();
				}
			});
		}).open();
	}

	private handleDelete(drag: DragItem): void {
		const label = displayItemValue(drag.value) || 'этот элемент';
		new ConfirmModal(this.app, `Удалить «${label}»?`, () => {
			void this.enqueueWrite(async () => {
				try {
					if (drag.sourceType === 'unassigned') {
						const next = removeItemAt(this.getUnassigned(), drag.sourceIndex);
						if (!next) return;
						writeUnassigned(this.config, next);
						if (this.snapshot) {
							this.snapshot.unassigned = next;
							this.render();
						}
						return;
					}

					if (!drag.sourceFilePath || !drag.sourceProperty) return;
					const current = this.getCellItems(
						drag.sourceFilePath,
						drag.sourceProperty,
					);
					const next = removeItemAt(current, drag.sourceIndex);
					if (!next) return;
					await writeListProperty(
						this.app,
						drag.sourceFilePath,
						drag.sourceProperty,
						next,
					);
					const row = this.snapshot?.rows.find(
						(r) => r.filePath === drag.sourceFilePath,
					);
					if (row) {
						row.cells[drag.sourceProperty] = next;
						this.render();
					}
				} catch (error) {
					console.error(error);
					new Notice('Не удалось удалить элемент.');
					this.refreshFromData();
				}
			});
		}).open();
	}
}
