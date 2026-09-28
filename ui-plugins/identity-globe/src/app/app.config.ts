import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';

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

    // Resolve the COIP handshake + plugin context once, before the app renders,
    // so components and SDK api.get/post calls never race the handshake.
    provideAppInitializer(async () => {
      try {
        await inject(SailpointPluginService).whenReady();
      } catch (err) {
        // Standalone dev (no App Shell parent / unresolvable origin) or a handshake
        // failure — let bootstrap proceed so UI iteration isn't blocked.
        console.warn('[plugin] App Shell handshake did not complete during startup.', err);
      }
    })
  ]
};
