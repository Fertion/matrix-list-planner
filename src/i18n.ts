export type Locale = 'en' | 'ru';

const EN = {
	delete: 'Delete',
	rename: 'Rename',
	add: 'Add',
	resizeColumn: 'Resize column',
	value: 'Value',
	cancel: 'Cancel',
	addSubmit: 'Add',
	save: 'Save',
	addItemTitle: 'Add item',
	renameItemTitle: 'Rename item',
	enterValue: 'Enter a value',
	loading: 'Loading…',
	selectListProperties:
		'Select list properties in the Properties menu — they will become matrix columns.',
	file: 'File',
	noFiles: 'No files match the current Bases filter.',
	unassigned: 'Unassigned',
	saveMoveFailed: 'Could not save the move. Refreshing the view.',
	addFailed: 'Could not add the item.',
	deleteFailed: 'Could not delete the item.',
	renameFailed: 'Could not rename the item.',
} as const;

const RU: Record<keyof typeof EN, string> = {
	delete: 'Удалить',
	rename: 'Переименовать',
	add: 'Добавить',
	resizeColumn: 'Изменить ширину',
	value: 'Значение',
	cancel: 'Отмена',
	addSubmit: 'Добавить',
	save: 'Сохранить',
	addItemTitle: 'Добавить элемент',
	renameItemTitle: 'Переименовать элемент',
	enterValue: 'Введите значение',
	loading: 'Загрузка…',
	selectListProperties:
		'Выберите list-свойства в меню Properties — они станут колонками матрицы.',
	file: 'Файл',
	noFiles: 'Нет файлов по текущему фильтру bases.',
	unassigned: 'Нераспределённое',
	saveMoveFailed: 'Не удалось сохранить перемещение. Обновляю вид.',
	addFailed: 'Не удалось добавить элемент.',
	deleteFailed: 'Не удалось удалить элемент.',
	renameFailed: 'Не удалось переименовать элемент.',
};

export type I18nKey = keyof typeof EN;

const STRINGS: Record<Locale, Record<I18nKey, string>> = {
	en: EN,
	ru: RU,
};

function detectLocale(): Locale {
	try {
		const obsidian = window as Window & { moment?: { locale?: () => string } };
		const raw = obsidian.moment?.locale?.() ?? '';
		if (raw.toLowerCase().startsWith('ru')) return 'ru';
	} catch {
		// fall through to default
	}
	return 'en';
}

export function t(key: I18nKey): string {
	return STRINGS[detectLocale()][key];
}
