---
name: finding-isc-apis
description: Use before writing any code that calls a SailPoint Identity Security Cloud (ISC) API, especially from a UI plugin. Finds the endpoint in the public API docs and OpenAPI specs, reads its request and response schemas, picks a version, and works out the scopes for `apiScopes` in `sp-ui-plugin.json`. Use it whenever a plugin needs ISC data or an action, a call returns 403, or you are about to guess a path or scope, even if the request only names a feature like "show my pending requests".
---

# Finding ISC APIs

Look up the endpoint and its scopes before you write the call. Don't guess either one.

## Find the operation

1. Browse https://developer.sailpoint.com/docs/api. Operations are grouped by service. Each operation page shows the path, the request and response details, and an Authorization dropdown with the scopes.
2. To search the specs directly, clone [sailpoint-oss/api-specs](https://github.com/sailpoint-oss/api-specs) sparsely. The full repo is about 600 MB.

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/sailpoint-oss/api-specs.git
   cd api-specs && git sparse-checkout set idn/apis
   rg -n '^  /' idn/apis/*/openapi.yaml | rg launchers   # list a service's paths
   rg -l -i 'submit access request' idn/apis/*/paths     # find an operation by summary
   ```

3. `idn/apis/<service>/openapi.yaml` lists the service's paths. Each path has a file under `idn/apis/<service>/paths/` that holds its operations. `idn/sailpoint-api.yaml` bundles every operation into one file.
4. Read the operation's `parameters`, `requestBody`, and `responses`. Follow each `$ref` into the service's `schemas/` or `idn/apis/shared/` for field names and required fields. Read the `description` too. It carries limits and side effects, such as the cap of 25 entitlements per access request.

## Pick the version

SailPoint versions each service on its own, as `/<service>/v<n>/...`, for example `/access-requests/v1`. See https://developer.sailpoint.com/docs/api/api-versioning-strategy.

- Prefer the per-service path when the spec has one.
- Skip operations marked `deprecated: true`. `x-deprecated-description` names the replacement.
- Skip operations that require an `X-SailPoint-Experimental` header. Experimental APIs can change with little or no notice.
- `/v3`, `/beta`, and the yearly paths such as `/v2025` are legacy. SailPoint supports them until Q2 2028, and they stop working in Q1 2029. Their spec folders (`idn/v3`, `idn/beta`, `idn/v2025`, and so on) are frozen. When only a legacy path fits, prefer `/v3` or a yearly version over `/beta`. The beta spec says its APIs are subject to change.

## Work out the scopes

- Read the scopes under `security` > `userAuth`. A plugin calls as the signed-in user. `applicationAuth` is the client-credentials flow.
- A token needs only one of the listed scopes. Pick the least privileged one that fits. Scopes ending in `read` only retrieve data. Scopes ending in `manage` can also modify and delete.
- Some descriptions open with a Security note that maps scopes to user levels. For access requests, `idn:access-request-self:manage` is for USER and `idn:access-request:manage` is for ORG_ADMIN.
- `x-sailpoint-userLevels` lists the user levels that may call the operation. The caller needs one of them in addition to the scope, so check that it covers the people who will open the plugin.

## Declare it and call it

- Add each scope to `apiScopes` in `sp-ui-plugin.json`, up to 20. After `sail ui-plugins create`, apply changes with `sail ui-plugins push-manifest`.
- The Angular starter and the plugin guide default to `"apiScopes": ["sp:scopes:all"]`, which grants every right the user's level allows. Replace it with the specific scopes. Keep `sp:scopes:all` only for an operation that has no granular scope yet.
- Call the API with the path only, exactly as the spec lists it. The SDK adds the tenant API base URL and the scoped token.

  ```ts
  // After the SDK handshake. Pass a path, never a full URL.
  const tenant = await sdk.api.get('/tenant/v1');
  const statuses = await sdk.api.get('/v3/access-request-status?limit=250&sorters=-created');
  ```

  `sdk.api.post(path, body)` sends a body. The Angular starter wraps both as `plugin.get` and `plugin.post`.
