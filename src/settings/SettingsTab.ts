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
			.setName("Example setting")
			.setDesc("A placeholder setting to demonstrate the pattern.")
			.addText((text) =>
				text
					.setPlaceholder("Enter a value")
					.setValue(this.plugin.settings.exampleSetting)
					.onChange(async (value) => {
						this.plugin.settings.exampleSetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
