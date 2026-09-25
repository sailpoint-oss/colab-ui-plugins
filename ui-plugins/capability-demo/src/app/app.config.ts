import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { provideSailPoint } from '@sailpoint/angular-sdk';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';

import { routes } from './app.routes';
import { SailpointPluginService } from '@core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Prod iframe URL is …/index.html?parentOrigin=…; initial
    // navigation would try to match the "index.html" segment against
    // our empty route table (NG04002). With no routes yet skip
    // syncing the router to the browser URL on bootstrap.
    provideRouter(routes, withDisabledInitialNavigation()),
    provideSailPoint(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: false,
        },
      },
    }),

    provideAppInitializer(async () => {
      try {
        await inject(SailpointPluginService).whenReady();
      } catch (err) {
        console.warn('[plugin] App Shell handshake did not complete during startup.', err);
      }
    })
  ]
};
