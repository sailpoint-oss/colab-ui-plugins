import { defineConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// The ISC tenant UI origins (tenanturl in ~/.sailpoint/config.yaml) this dev
// server may be dev-linked into: any tenant on a SailPoint UI domain. Matching
// a pattern rather than listing hosts lets one running server serve whichever
// tenant you open the `?spPluginDev=` URL in, with no config edit when
// switching `sail` environments — or when someone else clones this repo.
const TENANT_ORIGIN =
  /^https:\/\/[a-z0-9-]+\.(identitysoon\.com|identitynow-demo\.com|identitynow\.com)$/;

// Chrome treats localhost as the `loopback` address space and blocks a public
// origin (the tenant) from reaching it unless the CORS *preflight* carries
// Access-Control-Allow-Private-Network. Vite's own cors middleware answers
// OPTIONS with a 204 and ends the response before `server.headers` or a
// configureServer middleware can add that header, so CORS is handled here
// instead with `server.cors` disabled.
const allowTenantOrigin: Plugin = {
  name: "allow-tenant-loopback-access",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && TENANT_ORIGIN.test(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Private-Network", "true");
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "*");
          res.statusCode = 204;
          res.end();
          return;
        }
      }
      next();
    });
  },
};

// @sailpoint/ui-plugin-sdk@0.0.2 ships extensionless relative imports in its
// root entry (e.g. `./public/api.error`), which strict ESM resolvers reject.
// Bundling the dep through esbuild (which tolerates missing extensions) sidesteps
// the packaging bug for both the browser build and the test runner.
export default defineConfig({
  base: "./",
  plugins: [basicSsl(), allowTenantOrigin],
  build: { target: "es2022", outDir: "dist" },
  optimizeDeps: { include: ["@sailpoint/ui-plugin-sdk"] },
  server: {
    // ISC loads the plugin from https://localhost:<build.port>, so the dev
    // server must speak HTTPS and must fail rather than drift to another port —
    // `sail ui-plugins link` binds this exact port to your identity.
    port: 5173, // must match build.port in sp-ui-plugin.json
    strictPort: true,
    // Vite's default `localhost` resolves to ::1 only on macOS, so a browser
    // that picks 127.0.0.1 gets connection refused. `true` binds every address
    // — which includes your LAN, not just loopback, so the CORS check above is
    // what keeps other machines on the network out.
    host: true,
    cors: false, // handled by allowTenantOrigin above
    // The `devDocumentHeaders` UMS returns on create/link, so the dev server
    // enforces the same CSP the CDN stamps on uploaded assets. UMS lists only
    // the one host tenant's API in connect-src; this wildcards every SailPoint
    // API domain, which is looser only by other tenants' API hosts — hosts the
    // plugin never calls, since it only ever talks to the tenant it runs in.
    // Re-copy after any push-manifest that changes security fields.
    headers: {
      "Content-Security-Policy":
        // img-src stays 'self': UMS rejects extending it ("CSP directive not
        // allowed"), so profile photos are decoded and painted onto canvases
        // rather than loaded as data: images (see paintPhotos in org-view.ts).
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; " +
        "connect-src 'self' https://*.api.cloud.sailpoint.com " +
        "https://*.api.identitynow-demo.com https://*.api.identitynow.com",
      "Permissions-Policy": "",
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    server: { deps: { inline: [/@sailpoint\/ui-plugin-sdk/] } },
  },
});
