import { describe, it, expect, vi } from "vitest";
import { createSDK, ApiError } from "@sailpoint/ui-plugin-sdk";
import { mockSdkContext } from "@sailpoint/ui-plugin-sdk/testing";
import { buildIndex } from "../src/org-nav";
import { DEMO_IDENTITIES } from "../src/demo-data";

// The mock App Shell delivers the auth token, but api.get/api.post still call
// fetch() against the tenant's real API URL. To exercise ISC API calls fully
// offline, inject `fetchApi` — a stub fetch that returns canned responses.
describe("ISC API calls under the mock", () => {
  it("api.get resolves against an injected fetch stub (no network)", async () => {
    const shell = mockSdkContext({ token: "test-token" });

    const fetchApi = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      // Prove the App Shell token was attached to the outbound request.
      const auth = new Headers(init?.headers).get("authorization");
      expect(auth).toBe("Bearer test-token");
      return new Response(JSON.stringify({ id: "acct-1", name: "Ada" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const sdk = createSDK({ targetOrigin: shell.targetOrigin, fetchApi: fetchApi as unknown as typeof fetch });
    const account = await sdk.api.get<{ id: string; name: string }>("/v3/accounts/acct-1");

    expect(account).toEqual({ id: "acct-1", name: "Ada" });
    expect(fetchApi).toHaveBeenCalledTimes(1);
    shell.restore();
  });

  it("non-OK responses throw ApiError with status + body", async () => {
    const shell = mockSdkContext({ token: "test-token" });
    const fetchApi = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ text: "not found" }] }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      }),
    );

    const sdk = createSDK({ targetOrigin: shell.targetOrigin, fetchApi: fetchApi as unknown as typeof fetch });

    await expect(sdk.api.get("/v3/accounts/missing")).rejects.toMatchObject({
      constructor: ApiError,
      status: 404,
      body: { messages: [{ text: "not found" }] },
    });
    shell.restore();
  });

  it("api.post('/v3/search') feeds the org navigator index end to end", async () => {
    const shell = mockSdkContext({ token: "test-token" });
    const fetchApi = vi.fn(async () =>
      new Response(JSON.stringify(DEMO_IDENTITIES), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const sdk = createSDK({ targetOrigin: shell.targetOrigin, fetchApi: fetchApi as unknown as typeof fetch });

    const identities = await sdk.api.post<typeof DEMO_IDENTITIES>("/v3/search", { query: { query: "*" } });
    const index = buildIndex(identities);

    expect(fetchApi).toHaveBeenCalledTimes(1);
    expect(index.byId.get(index.rootId())!.name).toBe("Avery Lane");
    expect(index.reportsOf("6").length).toBe(7); // Sasha Bright's directs
    shell.restore();
  });
});
