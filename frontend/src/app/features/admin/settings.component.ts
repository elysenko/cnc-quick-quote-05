import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { toAppError } from '../../core/errors';
import { SettingEntry } from '../../core/models';

@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly api = inject(AdminApi);

  readonly settings = signal<SettingEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly savingKey = signal<string | null>(null);

  readonly drafts = signal<Record<string, string>>({});
  readonly savedKey = signal<string | null>(null);

  readonly services = computed(() => this.settings().filter((s) => s.kind === 'service'));
  readonly integrations = computed(() => this.settings().filter((s) => s.kind === 'integration'));

  readonly unconfigured = computed(() => this.settings().filter((s) => !s.configured));

  readonly bannerText = computed(() => {
    const names = this.unconfigured().map((s) => s.label);
    return names.length === 0 ? '' : `The following need credentials to activate: ${names.join(', ')}.`;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.settings.set(await firstValueFrom(this.api.settings()));
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  value(key: string): string {
    return this.drafts()[key] ?? '';
  }

  setValue(key: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [key]: value }));
    this.savedKey.set(null);
  }

  async save(entry: SettingEntry): Promise<void> {
    const value = this.value(entry.key).trim();
    if (!value) return;
    this.savingKey.set(entry.key);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(this.api.saveSettings([{ key: entry.key, value }]));
      this.settings.set(updated);
      this.drafts.update((d) => ({ ...d, [entry.key]: '' }));
      this.savedKey.set(entry.key);
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.savingKey.set(null);
    }
  }
}
