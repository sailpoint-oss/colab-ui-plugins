import { describe, it, expect, vi } from "vitest";
import { createSDK } from "@sailpoint/ui-plugin-sdk";
import { mockSdkContext } from "@sailpoint/ui-plugin-sdk/testing";

// These run fully offline: the mock App Shell stands in for ISC, so no iframe,
// no network, and no real tenant are needed.
describe("ISC Org Chart plugin", () => {
  it("resolves the plugin context from the App Shell handshake", async () => {
    const shell = mockSdkContext();
    const sdk = createSDK({ targetOrigin: shell.targetOrigin });

    const context = await sdk.getContext();

    expect(context).toEqual(shell.context);
    // The default mock user is least-privileged: every capability is false.
    expect(Object.values(context.user.capabilities).some(Boolean)).toBe(false);
    shell.restore();
  });

  it("surfaces the tenant a demo overrides into the context", async () => {
    const base = mockSdkContext().context;
    const shell = mockSdkContext({
      context: {
        ...base,
        tenant: { ...base.tenant, name: "Acme", org: "acme", region: "us-east-1" },
        user: {
          ...base.user,
          displayName: "Ada Admin",
          capabilities: { ...base.user.capabilities, isOrgAdmin: true },
        },
      },
    });
    const sdk = createSDK({ targetOrigin: shell.targetOrigin });

    const context = await sdk.getContext();

    expect(context.tenant.name).toBe("Acme");
    expect(context.user.displayName).toBe("Ada Admin");
    expect(context.user.capabilities.isOrgAdmin).toBe(true);
    shell.restore();
  });

  it("delivers host viewport events to the plugin", async () => {
    const shell = mockSdkContext();
    const sdk = createSDK({ targetOrigin: shell.targetOrigin });
    await sdk.getContext();

    const onResize = vi.fn();
    sdk.events.onViewportChange(onResize);
    shell.emitViewportChange({ width: 1280, height: 720 });

    expect(onResize).toHaveBeenCalledWith({ width: 1280, height: 720 });
    shell.restore();
  });
});
