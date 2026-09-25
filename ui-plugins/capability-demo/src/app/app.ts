import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SailpointPluginService } from '@core';

import { CapabilityCard } from './capability/capability-card';
import { CAPABILITY_CATALOG } from './capability/capability-catalog';
import { buildMySailPointUrl } from './capability/host-url';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CapabilityCard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly plugin = inject(SailpointPluginService);

  protected readonly context = this.plugin.context;
  protected readonly capabilities = CAPABILITY_CATALOG;
  protected readonly hostUrl = computed(() => buildMySailPointUrl(this.context()?.page.route));
}
