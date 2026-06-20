import type OrbitPlugin from "main";
import { type App, PluginSettingTab, Setting } from "obsidian";
import type { DanglingGrouping, DanglingScope, TabId } from "types/index";

import { HeaderSection } from "./HeaderSection";

export class SettingsTab extends PluginSettingTab {
	plugin: OrbitPlugin;
	private readonly header: HeaderSection;

	constructor(app: App, plugin: OrbitPlugin) {
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

		this.renderGeneralSection(containerEl);
		this.renderGraphSection(containerEl);
		this.renderDanglingSection(containerEl);
		this.renderDisplaySection(containerEl);
		this.renderAdvancedSection(containerEl);
	}

	// -------------------------------------------------------------------------
	// Private — section renderers
	// -------------------------------------------------------------------------

	private renderGeneralSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Behaviour").setHeading();

		new Setting(containerEl)
			.setName("Recent notes list length")
			.setDesc("Number of recently visited notes to show.")
			.addText((text) =>
				text
					.setPlaceholder("20")
					.setValue(String(this.plugin.settings.recentListLength))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.recentListLength = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("New note folder")
			.setDesc("Folder for new notes created from dangling links. Leave empty to use the default location.")
			.addText((text) =>
				text
					.setPlaceholder("E.g. Notes/")
					.setValue(this.plugin.settings.newNoteFolder)
					.onChange(async (value) => {
						this.plugin.settings.newNoteFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default tab")
			.setDesc("Which tab to show when the orbit pane opens.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("relations", "Relations")
					.addOption("dangling", "Dangling links")
					.addOption("recent", "Recent notes")
					.setValue(this.plugin.settings.defaultTab)
					.onChange(async (value) => {
						this.plugin.settings.defaultTab = value as TabId;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderGraphSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Graph").setHeading();

		new Setting(containerEl)
			.setName("Refresh debounce (ms)")
			.setDesc("Delay in milliseconds before relations refresh after a file change.")
			.addText((text) =>
				text
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.refreshDebounceMs))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 0) {
							this.plugin.settings.refreshDebounceMs = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Second-hop links")
			.setDesc("Show links that are two hops away from the active note.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.secondHopEnabled)
					.onChange(async (value) => {
						this.plugin.settings.secondHopEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Second-hop cap")
			.setDesc("Maximum number of second-hop links to display.")
			.addText((text) =>
				text
					.setPlaceholder("50")
					.setValue(String(this.plugin.settings.secondHopCap))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.secondHopCap = n;
							await this.plugin.saveSettings();
						}
					}),
			);
	}

	private renderDanglingSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Dangling links").setHeading();

		new Setting(containerEl)
			.setName("Default scope")
			.setDesc("Whether to show dangling links for the whole vault or just the current folder.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("vault", "Vault")
					.addOption("folder", "Folder")
					.setValue(this.plugin.settings.danglingDefaultScope)
					.onChange(async (value) => {
						this.plugin.settings.danglingDefaultScope = value as DanglingScope;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Grouping")
			.setDesc("Group dangling links by their target (missing note) or by their source file.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("target", "Target")
					.addOption("source", "Source")
					.setValue(this.plugin.settings.danglingGrouping)
					.onChange(async (value) => {
						this.plugin.settings.danglingGrouping = value as DanglingGrouping;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderDisplaySection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Display").setHeading();

		new Setting(containerEl)
			.setName("Show counts")
			.setDesc("Display item counts on each tab label.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCounts)
					.onChange(async (value) => {
						this.plugin.settings.showCounts = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show unlinked mentions")
			.setDesc("Add an 'unlinked mentions' section to the relations tab. Scans note contents on demand when expanded.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.unlinkedMentionsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.unlinkedMentionsEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open unlinked mentions in new tab")
			.setDesc("Open the note in a new tab when clicking an unlinked mention. Mod-click always opens a new tab.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.unlinkedOpenInNewTab)
					.onChange(async (value) => {
						this.plugin.settings.unlinkedOpenInNewTab = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude path patterns")
			.setDesc("File path patterns to exclude (one per line, plain text or regex).")
			.addTextArea((textarea) =>
				textarea
					.setPlaceholder("Templates/\ndaily/")
					.setValue(this.plugin.settings.excludePathPatterns.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludePathPatterns = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Exclude tag patterns")
			.setDesc("Tag patterns to exclude (one per line, plain text or regex).")
			.addTextArea((textarea) =>
				textarea
					.setPlaceholder("#Daily\n#archive")
					.setValue(this.plugin.settings.excludeTagPatterns.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludeTagPatterns = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Emit verbose diagnostic traces to the developer console for troubleshooting.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugLogging)
					.onChange(async (value) => {
						this.plugin.settings.debugLogging = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
