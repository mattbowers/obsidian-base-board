import { App, PluginSettingTab, Setting } from "obsidian";
import type BaseBoardPlugin from "./main";

export class BaseBoardSettingTab extends PluginSettingTab {
  private readonly plugin: BaseBoardPlugin;

  constructor(app: App, plugin: BaseBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Task folder")
      .setDesc(
        "Where task notes are created — both from a board's add-card button and " +
          "from promoted checkbox tasks. A path segment that is a moment.js date " +
          "format (e.g. Tasks/YYYY/MM) is filled in with the current date; wrap a " +
          "literal segment in [brackets]. Leave blank to use Bases' default location.",
      )
      .addText((text) =>
        text.setValue(this.plugin.data_.taskFolder).onChange(async (value) => {
          this.plugin.data_.taskFolder = value;
          await this.plugin.savePluginData();
        }),
      );
  }
}
