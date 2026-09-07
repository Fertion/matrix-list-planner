import { Modal, Setting, type App } from 'obsidian';
import { t } from '../i18n';

export type PromptModalOptions = {
	title: string;
	placeholder: string;
	submitLabel: string;
	initialValue?: string;
};

export class PromptModal extends Modal {
	private readonly titleText: string;
	private readonly placeholder: string;
	private readonly submitLabel: string;
	private readonly onSubmit: (value: string) => void;
	private value: string;

	constructor(
		app: App,
		options: PromptModalOptions,
		onSubmit: (value: string) => void,
	) {
		super(app);
		this.titleText = options.title;
		this.placeholder = options.placeholder;
		this.submitLabel = options.submitLabel;
		this.value = options.initialValue ?? '';
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.titleText });

		new Setting(contentEl).setName(t('value')).addText((text) => {
			text.setPlaceholder(this.placeholder).setValue(this.value).onChange((value) => {
				this.value = value;
			});
			text.inputEl.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') {
					evt.preventDefault();
					this.submit();
				}
			});
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
		});

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText(t('cancel')).onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText(this.submitLabel)
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
