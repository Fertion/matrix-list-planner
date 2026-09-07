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
import { insertItemAt, moveItem, removeItemAt, replaceItemAt } from '../model/moveItem';
import type {
	DragItem,
	DropTarget,
	MatrixSnapshot,
	MoveOperation,
} from '../model/types';
import {
	DEFAULT_FILE_WIDTH,
	DEFAULT_POOL_WIDTH,
	DEFAULT_PROP_WIDTH,
	FILE_COLUMN_KEY,
	getColumnWidth,
	POOL_COLUMN_KEY,
	readColumnWidths,
	writeColumnWidths,
	type ColumnWidths,
} from '../storage/columnWidths';
import { applyMoveOperation, writeListProperty } from '../storage/propertyStorage';
import { readUnassigned, writeUnassigned } from '../storage/unassignedStorage';
import {
	renderAddButton,
	renderFileCell,
	renderListItem,
	wireColumnResize,
	wireDropZone,
	type MatrixCallbacks,
} from '../ui/dom';
import { PromptModal } from '../ui/modals';
import { t } from '../i18n';

export class MatrixListPlannerView extends BasesView implements HoverParent {
	readonly type = VIEW_TYPE;
	hoverPopover: HoverPopover | null = null;

	private readonly rootEl: HTMLElement;
	private snapshot: MatrixSnapshot | null = null;
	private columnWidths: ColumnWidths = {};
	private writeChain: Promise<void> = Promise.resolve();
	private isWriting = false;
	private colEls = new Map<string, HTMLElement>();
	private poolEl: HTMLElement | null = null;
	private tableEl: HTMLTableElement | null = null;

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
		this.columnWidths = readColumnWidths(this.config);
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

	private applyLiveWidth(key: string, width: number): void {
		const col = this.colEls.get(key);
		if (col) {
			col.style.width = `${width}px`;
			col.style.minWidth = `${width}px`;
			col.style.maxWidth = `${width}px`;
			this.syncTableWidth();
		}
		if (key === POOL_COLUMN_KEY && this.poolEl) {
			this.poolEl.style.width = `${width}px`;
			this.poolEl.style.minWidth = `${width}px`;
			this.poolEl.style.maxWidth = `${width}px`;
		}
	}

	private syncTableWidth(): void {
		if (!this.tableEl) return;
		let sum = 0;
		for (const [key, el] of this.colEls) {
			if (key === POOL_COLUMN_KEY) continue;
			const w = Number.parseFloat(el.style.width);
			if (Number.isFinite(w)) sum += w;
		}
		this.tableEl.style.width = `${sum}px`;
	}

	private persistColumnWidth(key: string, width: number): void {
		this.columnWidths = { ...this.columnWidths, [key]: width };
		writeColumnWidths(this.config, this.columnWidths);
		this.applyLiveWidth(key, width);
	}

	private render(): void {
		const snapshot = this.snapshot;
		this.rootEl.empty();
		this.colEls.clear();
		this.poolEl = null;
		this.tableEl = null;

		if (!snapshot) {
			this.rootEl.createDiv({
				cls: 'mlp-empty',
				text: t('loading'),
			});
			return;
		}

		if (snapshot.columns.length === 0) {
			this.rootEl.createDiv({
				cls: 'mlp-empty',
				text: t('selectListProperties'),
			});
			return;
		}

		const callbacks = this.createCallbacks();
		const fileWidth = getColumnWidth(
			this.columnWidths,
			FILE_COLUMN_KEY,
			DEFAULT_FILE_WIDTH,
		);
		const poolWidth = getColumnWidth(
			this.columnWidths,
			POOL_COLUMN_KEY,
			DEFAULT_POOL_WIDTH,
		);

		const layout = this.rootEl.createDiv({ cls: 'mlp-layout' });
		const tableWrap = layout.createDiv({ cls: 'mlp-table-wrap' });
		const table = tableWrap.createEl('table', { cls: 'mlp-table' });
		this.tableEl = table;

		const colgroup = table.createEl('colgroup');
		const fileCol = colgroup.createEl('col');
		fileCol.style.width = `${fileWidth}px`;
		fileCol.style.minWidth = `${fileWidth}px`;
		fileCol.style.maxWidth = `${fileWidth}px`;
		this.colEls.set(FILE_COLUMN_KEY, fileCol);

		for (const col of snapshot.columns) {
			const width = getColumnWidth(
				this.columnWidths,
				col.propertyName,
				DEFAULT_PROP_WIDTH,
			);
			const el = colgroup.createEl('col');
			el.style.width = `${width}px`;
			el.style.minWidth = `${width}px`;
			el.style.maxWidth = `${width}px`;
			this.colEls.set(col.propertyName, el);
		}
		this.syncTableWidth();

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');

		const fileTh = headerRow.createEl('th', {
			text: t('file'),
			cls: 'mlp-th-file',
		});
		wireColumnResize(
			fileTh,
			FILE_COLUMN_KEY,
			(key, width) => this.persistColumnWidth(key, width),
			(width) => this.applyLiveWidth(FILE_COLUMN_KEY, width),
		);

		for (const col of snapshot.columns) {
			const th = headerRow.createEl('th', {
				text: col.displayName,
				cls: 'mlp-th-prop',
			});
			wireColumnResize(
				th,
				col.propertyName,
				(key, width) => this.persistColumnWidth(key, width),
				(width) => this.applyLiveWidth(col.propertyName, width),
			);
		}

		const tbody = table.createEl('tbody');

		if (snapshot.rows.length === 0) {
			const emptyRow = tbody.createEl('tr');
			const emptyCell = emptyRow.createEl('td', {
				cls: 'mlp-empty-cell',
				attr: { colspan: String(snapshot.columns.length + 1) },
			});
			emptyCell.setText(t('noFiles'));
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
		this.poolEl = pool;
		pool.style.width = `${poolWidth}px`;
		pool.style.minWidth = `${poolWidth}px`;
		pool.style.maxWidth = `${poolWidth}px`;

		const poolTitle = pool.createDiv({ cls: 'mlp-pool-title' });
		poolTitle.createSpan({ text: t('unassigned') });
		wireColumnResize(
			poolTitle,
			POOL_COLUMN_KEY,
			(key, width) => this.persistColumnWidth(key, width),
			(width) => this.applyLiveWidth(POOL_COLUMN_KEY, width),
			{
				edge: 'left',
				getStartWidth: () => pool.getBoundingClientRect().width,
			},
		);

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

		items.forEach((value, index) => {
			renderListItem(listEl, value, index, source, callbacks);
		});

		renderAddButton(listEl, () => {
			callbacks.onAdd({
				targetType: source.sourceType,
				targetFilePath: source.sourceFilePath,
				targetProperty: source.sourceProperty,
				targetIndex: items.length,
			});
		});

		wireDropZone(
			isPool ? cellEl : parent,
			{
				targetType: source.sourceType,
				targetFilePath: source.sourceFilePath,
				targetProperty: source.sourceProperty,
			},
			() => items.length,
			callbacks,
		);
	}

	private createCallbacks(): MatrixCallbacks {
		return {
			onDrop: (drag, drop) => {
				void this.handleDrop(drag, drop);
			},
			onAdd: (target) => {
				this.handleAdd(target);
			},
			onRename: (drag) => {
				this.handleRename(drag);
			},
			onDelete: (drag) => {
				void this.handleDelete(drag);
			},
			onOpenFile: (filePath, event) => {
				const modEvent = Keymap.isModEvent(event);
				void this.app.workspace.openLinkText(filePath, '', modEvent);
			},
			onColumnResize: (key, width) => {
				this.persistColumnWidth(key, width);
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
				new Notice(t('saveMoveFailed'));
				this.refreshFromData();
			}
		});
	}

	private handleAdd(target: DropTarget): void {
		new PromptModal(
			this.app,
			{
				title: t('addItemTitle'),
				placeholder: t('enterValue'),
				submitLabel: t('addSubmit'),
			},
			(value) => {
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
						new Notice(t('addFailed'));
						this.refreshFromData();
					}
				});
			},
		).open();
	}

	private handleRename(drag: DragItem): void {
		const currentLabel = displayItemValue(drag.value);
		new PromptModal(
			this.app,
			{
				title: t('renameItemTitle'),
				placeholder: t('enterValue'),
				submitLabel: t('save'),
				initialValue: currentLabel,
			},
			(value) => {
				if (value === currentLabel) return;
				void this.enqueueWrite(async () => {
					try {
						if (drag.sourceType === 'unassigned') {
							const next = replaceItemAt(this.getUnassigned(), drag.sourceIndex, value);
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
						const next = replaceItemAt(current, drag.sourceIndex, value);
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
						new Notice(t('renameFailed'));
						this.refreshFromData();
					}
				});
			},
		).open();
	}

	private async handleDelete(drag: DragItem): Promise<void> {
		await this.enqueueWrite(async () => {
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
				new Notice(t('deleteFailed'));
				this.refreshFromData();
			}
		});
	}
}
