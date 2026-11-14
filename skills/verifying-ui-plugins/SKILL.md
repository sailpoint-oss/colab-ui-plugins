---
name: verifying-ui-plugins
description: Use when testing or checking a SailPoint UI plugin before or after upload, including unit tests, type-checking, and checks inside a real tenant. Use it after any code change, when tests fail with translation or provider errors, and before calling a plugin done or ready to share.
---

# Verifying SailPoint UI plugins

A plugin can pass its unit tests and still fail in the tenant: a lazy page that doesn't compile, a scope that isn't declared, a theme that only works in one mode. Run all three layers below.

## Unit tests

- Run the suite once, not in watch mode.
- Stub the SDK, or your wrapper around it, in specs so they never create a real SDK or attempt a handshake.

Angular starter notes:

- Run once with `npm test -- --watch=false`.
- Components render through the `translate` pipe, and specs assert real labels. Use the starter's helpers in `src/app/testing/i18n.testing.ts`: add `provideTranslateTesting()` to the TestBed providers, then call `activateTranslations()` after `compileComponents()`. Without them, specs fail with `NG0201: No provider found for TranslateService`.
- PrimeNG components with a translated input, such as `<p-button [label]="'key' | translate">`, have no `label` attribute in the DOM. Assert the rendered `textContent` instead.
- Stub `SailpointPluginService` in specs.

## Type-checking

- Run the production build before every upload. In the Angular starter, `npm test` only compiles what the specs import, so lazy route components can be broken while the suite passes.
- Angular starter: it uses strict TypeScript, including `noPropertyAccessFromIndexSignature`. For constant lookup tables, write `const MAP = { ... } satisfies Record<string, T>` so dot access compiles.

## In the tenant

1. The handshake reaches `ready`, which means the host issued a scoped token.
2. The plugin document's `Content-Security-Policy` is `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' https://{org}.api.cloud.sailpoint.com`, plus any additions you declared. `create` and `link` print the same values as `devDocumentHeaders`.
3. Every API call succeeds. A failure that also happens on localhost through the developer URL usually means a missing `apiScopes` entry.
4. The plugin reads correctly in both ISC light and dark modes.
5. Empty and sparse states make sense, for example a user with no manager, no requests, or no assigned launchers.
6. `sail ui-plugins list --json` shows the audience you intend: `restrictToUsers` stays set until the author approves sharing.
