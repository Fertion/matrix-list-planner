export type ContainerType = 'cell' | 'unassigned';

export type DragItem = {
	sourceType: ContainerType;
	sourceFilePath?: string;
	sourceProperty?: string;
	sourceIndex: number;
	value: unknown;
};

export type DropTarget = {
	targetType: ContainerType;
	targetFilePath?: string;
	targetProperty?: string;
	targetIndex: number;
};

export type CellUpdate = {
	filePath: string;
	property: string;
	newValue: unknown[];
};

export type MoveOperation = {
	source?: CellUpdate;
	target?: CellUpdate;
	unassigned?: unknown[];
};

export type MatrixColumn = {
	propertyId: string;
	propertyName: string;
	displayName: string;
};

export type MatrixRow = {
	filePath: string;
	fileName: string;
	displayName: string;
	cells: Record<string, unknown[]>;
};

export type MatrixSnapshot = {
	columns: MatrixColumn[];
	rows: MatrixRow[];
	unassigned: unknown[];
};

export const DRAG_MIME = 'application/x-matrix-list-planner';
