import { Component, computed, inject, OnInit, signal } from '@angular/core';
import type { Launcher } from '@sailpoint/api-client/launchers/api';
import { SailpointApiService, SailpointPluginService } from '@core';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { Tag } from 'primeng/tag';

import { buildInteractiveProcessUrl } from './interactive-process-link';
import { LauncherService } from './launcher.service';

type LaunchResult =
  | { launcherId: string; ok: true; url: string | null }
  | { launcherId: string; ok: false; error: string };

/** Lists the Launchers the signed-in user can start, and starts them. */
@Component({
  selector: 'app-launcher-panel',
  imports: [Button, Card, Message, Tag],
  templateUrl: './launcher-panel.html',
  styleUrl: './launcher-panel.scss',
})
export class LauncherPanel implements OnInit {
  private readonly launchers = inject(LauncherService);
  private readonly plugin = inject(SailpointPluginService);
  private readonly api = inject(SailpointApiService);

  protected readonly apiReady = this.api.apiReady;

  protected readonly items = signal<Launcher[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly loaded = signal(false);

  protected readonly launchingId = signal<string | null>(null);
  protected readonly lastLaunch = signal<LaunchResult | null>(null);

  protected readonly isEmpty = computed(
    () => this.loaded() && this.items().length === 0,
  );

  ngOnInit(): void {
    if (this.apiReady()) {
      void this.refresh();
    }
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');

    try {
      this.items.set(await this.launchers.listLaunchers());
      this.loaded.set(true);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async launch(launcher: Launcher): Promise<void> {
    this.launchingId.set(launcher.id);
    this.lastLaunch.set(null);

    try {
      const interactiveProcessId = await this.launchers.startLauncher(
        launcher.id,
      );
      this.lastLaunch.set({
        launcherId: launcher.id,
        ok: true,
        url: buildInteractiveProcessUrl(
          this.plugin.context()?.page.route,
          interactiveProcessId,
        ),
      });
    } catch (err) {
      this.lastLaunch.set({
        launcherId: launcher.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.launchingId.set(null);
    }
  }
}
