import { Plugin } from "obsidian";
import { SettingsTab } from "settings/SettingsTab";
import { DEFAULT_SETTINGS, type OrbitSettings } from "types/index";

export default class OrbitPlugin extends Plugin {
	settings: OrbitSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));

		console.debug(`${this.manifest.name} loaded (v${this.manifest.version})`);
	}

	onunload(): void {
		console.debug(`${this.manifest.name} unloaded`);
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<OrbitSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
