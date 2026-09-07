import { Plugin } from 'obsidian';
import { VIEW_ICON, VIEW_NAME, VIEW_TYPE } from './bases/constants';
import { MatrixListPlannerView } from './bases/MatrixListPlannerView';

export default class MatrixListPlannerPlugin extends Plugin {
	async onload(): Promise<void> {
		const registered = this.registerBasesView(VIEW_TYPE, {
			name: VIEW_NAME,
			icon: VIEW_ICON,
			factory: (controller, containerEl) =>
				new MatrixListPlannerView(controller, containerEl),
		});

		if (!registered) {
			console.warn(
				'Matrix List Planner: Bases is not enabled in this vault. Enable Bases to use this view.',
			);
		}
	}

	onunload(): void {}
}
