import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SailpointPluginService } from '@core';

import { LauncherPanel } from './launchers/launcher-panel';

@Component({
  selector: 'app-root',
  imports: [LauncherPanel, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly plugin = inject(SailpointPluginService);

  protected readonly title = signal('Workflow Launcher Demo');

  protected readonly status = this.plugin.status;
}
