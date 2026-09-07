import { Modal, Setting, type App } from 'obsidian';

export class PromptModal extends Modal {
	private readonly titleText: string;
	private readonly placeholder: string;
	private readonly onSubmit: (value: string) => void;
	private value = '';

	constructor(
		app: App,
		titleText: string,
		placeholder: string,
		onSubmit: (value: string) => void,
	) {
		super(app);
		this.titleText = titleText;
		this.placeholder = placeholder;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.titleText });

		new Setting(contentEl)
			.setName('Значение')
			.addText((text) => {
				text.setPlaceholder(this.placeholder).onChange((value) => {
					this.value = value;
				});
				text.inputEl.addEventListener('keydown', (evt) => {
					if (evt.key === 'Enter') {
						evt.preventDefault();
						this.submit();
					}
				});
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Отмена').onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Добавить')
					.setCta()
					.onClick(() => this.submit()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const trimmed = this.value.trim();
		if (!trimmed) return;
		this.close();
		this.onSubmit(trimmed);
	}
}

export class ConfirmModal extends Modal {
	private readonly message: string;
	private readonly onConfirm: () => void;

	constructor(app: App, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Отмена').onClick(() => this.close()),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Удалить')
					.setWarning()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
