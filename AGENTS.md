# AGENTS.md - Development Guidelines

## Farcaster Link Handling

When creating links to Farcaster content, use the appropriate Farcaster Mini App SDK actions.

### SDK Actions Available

```typescript
import sdk from "@farcaster/miniapp-sdk";

// For casts - use viewCast()
await sdk.actions.viewCast({ hash: castHash });

// For composing casts
sdk.actions.composeCast({
  text: "Your message",
  embeds: ["https://example.com"],
});

// For channels and other URLs - use openUrl()
sdk.actions.openUrl("https://warpcast.com/~/channel/someone-build");
```

### Fallback Pattern for viewCast

Wrap `viewCast` in try/catch with a fallback:

```typescript
try {
  await sdk.actions.viewCast({ hash: castHash });
} catch {
  sdk.actions.openUrl(`https://warpcast.com/~/conversations/${castHash}`);
}
```

### Reference Implementation

See `src/components/ui/CastLink.tsx` for the canonical implementation of cast link handling.

### Notes

- `viewCast` opens casts within the Farcaster app
- `openUrl` is used for channels, profiles, and other external URLs
- Always use `openUrl` instead of `window.open()` or `<a href>` for Warpcast URLs

## Funding Split

When an idea is completed and the pool is distributed:
- **85%** goes to the builder
- **5%** goes to the idea submitter
- **10%** goes to the platform
