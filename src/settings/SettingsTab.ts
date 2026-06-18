import type MyPlugin from "main";
import { type App, PluginSettingTab, Setting } from "obsidian";

import { HeaderSection } from "./HeaderSection";

export class SettingsTab extends PluginSettingTab {
	plugin: MyPlugin;
	private readonly header: HeaderSection;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.header = new HeaderSection({ plugin });
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("orbit-settings");

		const headerEl = containerEl.createDiv({ cls: "orbit-settings-header" });
		this.header.render(headerEl);

		new Setting(containerEl)
			.setName("New note folder")
			.setDesc("Folder for new notes created from dangling links. Leave empty to use Obsidian's default.")
			.addText((text) =>
				text
					.setPlaceholder("E.g. Notes/")
					.setValue(this.plugin.settings.newNoteFolder)
					.onChange(async (value) => {
						this.plugin.settings.newNoteFolder = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
