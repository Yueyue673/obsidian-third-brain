import { App, FileSystemAdapter, ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, SecretComponent, Setting, WorkspaceLeaf } from 'obsidian';
import type { ModelPort } from './core/types';
import { ThirdBrainController } from './controller';
import { SourceEvidenceUnavailableError } from './core/source-diagnostics';
import { generatedFileError } from './core/generated-diagnostics';
import { messages } from './i18n';
import { presentFailure } from './presentation';
import { OwnedStore } from './runtime/store';
import { createModelPort } from './runtime/transport';
import { contextPrivacy, FileSources } from './sources';
import { defaults, isDue, loadSettings, type Settings } from './settings';
import { CurrentNoteTooLongError, SourceLocationUnavailableError, mountPanel, type PanelPort } from './ui';
const VIEW = 'third-brain-activation';
export default class ThirdBrainPlugin extends Plugin {
  settings: Settings = { ...defaults };
  controller!: ThirdBrainController;
  private configuredFolder = '';
  private store!: OwnedStore;
  private destroyed = false;
  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    if (!(this.app.vault.adapter instanceof FileSystemAdapter)) { new Notice('Third Brain requires a desktop filesystem vault.'); return; }
    this.registerView(VIEW, leaf => new ActivationView(leaf, this));
    this.addRibbonIcon('brain', 'Third Brain', () => { void this.openPanel(); });
    const t = messages(this.settings.locale);
    this.addCommand({ id: 'open-activation', name: t.find, callback: () => { void this.openPanel(); } });
    this.addCommand({ id: 'refresh-derived-layer', name: t.index, callback: () => { void this.controller?.refresh().catch(() => new Notice(presentFailure(this.controller.status(), this.settings.locale))); } });
    this.addSettingTab(new ThirdBrainSettings(this.app, this));
    await this.configure();
    this.app.workspace.onLayoutReady(() => { void this.runScheduled(); });
    this.registerInterval(window.setInterval(() => { void this.runScheduled(); }, 60000));
  }
  private model(settings: Readonly<Settings>): ModelPort | undefined {
    if (settings.mode === 'local-excerpts') return undefined;
    const secret = settings.secretId ? this.app.secretStorage.getSecret(settings.secretId) ?? undefined : undefined;
    return createModelPort({ mode: settings.mode, endpoint: settings.endpoint, model: settings.model, secret, cloudConsent: settings.cloudConsent });
  }
  private async configure(): Promise<void> {
    if (this.configuredFolder === this.settings.outputFolder && this.controller) return;
    this.controller?.dispose();
    const root = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    const store = this.store = new OwnedStore(root, this.settings.outputFolder);
    const sources = new FileSources(root, () => this.settings, () => store.managedSourcePaths(), async () => this.app.vault.getFiles().map(f => f.path));
    this.controller = new ThirdBrainController(sources, store, () => this.settings, settings => this.model(settings), async when => { this.settings.lastIndexedAt = when; await this.saveData(this.settings); });
    this.configuredFolder = this.settings.outputFolder;
    try { await this.controller.initialize(); } catch { new Notice(presentFailure(this.controller.status(), this.settings.locale)); }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) (leaf.view as ActivationView).redraw();
  }
  async persistSettings(): Promise<void> {
    this.controller?.cancel();
    this.settings = loadSettings(this.settings); await this.saveData(this.settings); await this.configure();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) (leaf.view as ActivationView).redraw();
  }
  async openPanel(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (!leaf) { const right = this.app.workspace.getRightLeaf(false); if (!right) return; leaf = right; await leaf.setViewState({ type: VIEW, active: true }); }
    void this.app.workspace.revealLeaf(leaf);
  }
  private async runScheduled(): Promise<void> {
    if (this.destroyed || !this.controller || !['idle', 'cancelled'].includes(this.controller.status().phase) || !isDue(this.settings)) return;
    try { await this.controller.refresh(); } catch { /* Visible in the panel; no repeated popup or source-body logs. */ }
  }
  panelPort(): PanelPort {
    return {
      status: () => this.controller.status(), subscribe: cb => this.controller.subscribe(cb),
      refresh: () => this.controller.refresh(), find: (q, b, p, s) => s === undefined ? this.controller.find(q, b, p) : this.controller.find(q, b, p, s), cancel: () => this.controller.cancel(),
      current: async () => {
        const file = this.app.workspace.getActiveFile(); if (!file || file.extension !== 'md') return null;
        const leaf = this.app.workspace.getLeavesOfType('markdown').find(l => l.view instanceof MarkdownView && l.view.file?.path === file.path);
        const view = leaf?.view as MarkdownView | undefined;
        const fullDraft = view ? view.editor.getValue() : await this.app.vault.read(file);
        const text = view?.editor.getSelection() || fullDraft;
        if (text.length > 20000) throw new CurrentNoteTooLongError();
        const original = await this.controller.snapshot(file.path); if (!original) throw new Error('Current-note source is no longer available.');
        return { text, privacy: contextPrivacy(original, fullDraft) };
      },
      openFragment: async id => {
        const target = await this.store.fragmentPath(id);
        const file = this.app.vault.getFileByPath(target); if (!file) throw generatedFileError('unavailable');
        await this.app.workspace.getLeaf(false).openFile(file);
      },
      open: async evidence => {
        await this.controller.verifyOpen(evidence);
        const file = this.app.vault.getFileByPath(evidence.relativePath); if (!file) throw new SourceEvidenceUnavailableError();
        const leaf = this.app.workspace.getLeaf(false);
        // Canvas evidence can refer to decoded JSON, not a Markdown span.
        if (file.extension?.toLowerCase() !== 'md') { await leaf.openFile(file); return; }
        const source = await this.controller.snapshot(evidence.relativePath);
        if (!source || source.format !== 'markdown' || source.path !== evidence.relativePath
          || source.id !== evidence.sourceId || source.hash !== evidence.sourceHash
          || source.text.slice(evidence.start, evidence.end) !== evidence.quote) throw new SourceEvidenceUnavailableError();
        const normalize = (text: string): string => text.replace(/\r\n?/g, '\n');
        const position = (offset: number): { line: number; ch: number } => {
          const lines = normalize(source.text.slice(0, offset)).split('\n');
          return { line: lines.length - 1, ch: lines[lines.length - 1].length };
        };
        const from = position(evidence.start), to = position(evidence.end);
        await leaf.openFile(file, { state: { mode: 'source' } });
        const view = leaf.view;
        // No quote-text search: repeated passages have different owned offsets.
        // Never select a disk position in a different/unsaved editor revision.
        if (!(view instanceof MarkdownView) || view.file?.path !== file.path || view.getMode() !== 'source'
          || normalize(view.editor.getValue()) !== normalize(source.text)) throw new SourceLocationUnavailableError();
        view.editor.setSelection(from, to);
        view.editor.scrollIntoView({ from, to }, true);
      },
    };
  }
  onunload(): void { this.destroyed = true; this.controller?.dispose(); }
}
class ActivationView extends ItemView {
  private cleanup?: () => void;
  constructor(leaf: WorkspaceLeaf, private readonly plugin: ThirdBrainPlugin) { super(leaf); }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return messages(this.plugin.settings.locale).title; }
  getIcon(): string { return 'brain'; }
  async onOpen(): Promise<void> { this.redraw(); }
  redraw(): void { this.cleanup?.(); if (this.plugin.controller) this.cleanup = mountPanel(this.contentEl, this.plugin.panelPort(), this.plugin.settings.locale); }
  async onClose(): Promise<void> { this.cleanup?.(); this.cleanup = undefined; }
}
class ThirdBrainSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ThirdBrainPlugin) { super(app, plugin); }
  display(): void {
    const { containerEl: el } = this; el.empty(); const zh = messages(this.plugin.settings.locale).title === '第三大脑';
    const name = (en: string, cn: string): string => zh ? cn : en;
    const persist = (): void => { void this.plugin.persistSettings().catch(() => new Notice(name('Settings could not be saved. Check the generated folder.', '设置未保存，请检查提炼层路径。'))); };
    new Setting(el).setName(name('Processing mode', '处理方式')).setDesc(name('Local excerpts make no AI requests. Model modes use only the endpoint you configure.', '本地摘录不调用 AI；模型模式只连接你配置的接口。')).addDropdown(c => c.addOptions({ 'local-excerpts': name('Local excerpts', '本地摘录'), 'local-model': name('Local model', '本机模型'), 'cloud-model': name('Cloud model', '云端模型') }).setValue(this.plugin.settings.mode).onChange(value => { this.plugin.settings.mode = value as Settings['mode']; persist(); }));
    new Setting(el).setName(name('Refresh schedule', '更新频率')).setDesc(name('Runs only while Obsidian is open. An overdue refresh is caught up once.', '仅在 Obsidian 打开时运行；重新打开后补一次到期更新。')).addDropdown(c => c.addOptions({ manual: name('Manual', '手动'), daily: name('Daily', '每天'), weekly: name('Weekly', '每周') }).setValue(this.plugin.settings.schedule).onChange(value => { this.plugin.settings.schedule = value as Settings['schedule']; persist(); }));
    new Setting(el).setName(name('Language', '语言')).addDropdown(c => c.addOptions({ auto: name('System', '跟随系统'), en: 'English', zh: '中文' }).setValue(this.plugin.settings.locale).onChange(value => { this.plugin.settings.locale = value as Settings['locale']; persist(); }));
    new Setting(el).setName(name('Generated layer', '提炼层位置')).setDesc(name('Only owned generated files can change. Existing user files are protected.', '只更新已认领的生成文件，已有用户文件始终受保护。')).addText(c => { c.setValue(this.plugin.settings.outputFolder); c.inputEl.addEventListener('blur', () => { try { const next = loadSettings({ ...this.plugin.settings, outputFolder: c.getValue() }); if (next.outputFolder !== this.plugin.settings.outputFolder) { this.plugin.settings.outputFolder = next.outputFolder; persist(); } } catch { new Notice(name('Invalid generated folder. The previous folder is unchanged.', '提炼层路径无效，原位置保持不变。')); } }); });
    new Setting(el).setName(name('Source exclusions', '排除的原始文件夹')).setDesc(name('One vault-relative folder per line. No search syntax required.', '每行一个库内文件夹路径，不需要搜索语法。')).addTextArea(c => c.setValue(this.plugin.settings.excludes.join('\n')).onChange(value => { this.plugin.settings.excludes = value.split('\n').map(x => x.trim()).filter(Boolean); persist(); }));
    new Setting(el).setName(name('Model endpoint', '模型接口')).setDesc(name('OpenAI-compatible /v1 base URL. Local mode allows loopback only; cloud requires HTTPS. Redirects are rejected.', 'OpenAI 兼容的 /v1 基础地址。本机模式只允许回环地址，云端需 HTTPS，不跟随重定向。')).addText(c => c.setPlaceholder('http://127.0.0.1:11434/v1').setValue(this.plugin.settings.endpoint).onChange(value => { this.plugin.settings.endpoint = value.trim(); persist(); }));
    new Setting(el).setName(name('Model name', '模型名称')).addText(c => c.setValue(this.plugin.settings.model).onChange(value => { this.plugin.settings.model = value.trim(); persist(); }));
    new Setting(el).setName(name('API key', 'API 密钥')).setDesc(name('Select a host-managed secret. Plugin settings keep only its identifier.', '选择 Obsidian 管理的密钥；插件设置只保存标识，不保存密钥正文。')).addComponent(host => new SecretComponent(this.app, host).setValue(this.plugin.settings.secretId).onChange(value => { this.plugin.settings.secretId = value ?? ''; persist(); }));
    new Setting(el).setName(name('Allow cloud processing', '允许云端处理')).setDesc(name('Opt-in: ordinary note text and your query may be sent to the configured cloud service. local/private notes are excluded. Redaction is not a comprehensive privacy guarantee.', '明确同意后，普通笔记正文及查询可能发送到你配置的云端。local/private 笔记不发送，脱敏不能保证识别全部隐私。')).addToggle(c => c.setValue(this.plugin.settings.cloudConsent).onChange(value => { this.plugin.settings.cloudConsent = value; persist(); }));
    new Setting(el).setName(name('No tracking', '不采集行为')).setDesc(name('No click history, dwell time, keystroke stream, telemetry or mastery profile. Models do not have tools to modify originals.', '不收集点击、停留、逐键输入、遥测或掌握程度画像。模型没有修改原稿的工具。'));
  }
}
