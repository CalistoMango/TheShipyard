# AGENTS.md - Development Guidelines

## Farcaster Link Handling

When creating links to Farcaster content (casts, channels, profiles), **always use the Farcaster Mini App SDK actions** instead of `openUrl()`. This ensures links open within the Farcaster app rather than opening a new browser tab.

### SDK Actions to Use

```typescript
import sdk from "@farcaster/miniapp-sdk";

// For channels - use viewChannel()
await sdk.actions.viewChannel({ channelId: "someone-build" });

// For casts - use viewCast()
await sdk.actions.viewCast({ hash: castHash });

// For profiles - use viewProfile()
await sdk.actions.viewProfile({ fid: userFid });

// For composing casts
sdk.actions.composeCast({
  text: "Your message",
  embeds: ["https://example.com"],
});
```

### Fallback Pattern

Always wrap SDK actions in try/catch with a fallback to `openUrl()` for environments where the action might not be available:

```typescript
try {
  await sdk.actions.viewChannel({ channelId: "someone-build" });
} catch {
  // Fallback to openUrl if viewChannel is not available
  sdk.actions.openUrl("https://warpcast.com/~/channel/someone-build");
}
```

### Reference Implementation

See `src/components/ui/CastLink.tsx` for the canonical implementation of Farcaster link handling.

### Common Mistakes to Avoid

- **DON'T** use `sdk.actions.openUrl()` for Farcaster content - it opens a new browser tab
- **DON'T** use `window.open()` or `<a href>` for Farcaster URLs
- **DO** use the specific SDK action for the content type (viewChannel, viewCast, viewProfile)
- **DO** always include a fallback for graceful degradation
