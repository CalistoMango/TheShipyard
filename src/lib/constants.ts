import { type AccountAssociation } from '@farcaster/miniapp-core/src/manifest';

/**
 * Application constants and configuration values.
 *
 * This file contains all the configuration constants used throughout the mini app.
 * These values are either sourced from environment variables or hardcoded and provide
 * configuration for the app's appearance, behavior, and integration settings.
 *
 * NOTE: This file is automatically updated by the init script.
 * Manual changes may be overwritten during project initialization.
 */

// --- Fee Configuration ---
/**
 * Fee share percentages for the platform (as whole numbers).
 * These values determine how the bounty pool is split when a build is approved.
 */
export const BUILDER_FEE_PERCENT = 85; // 85% goes to the builder
export const SUBMITTER_FEE_PERCENT = 5; // 5% goes to the idea submitter
export const PLATFORM_FEE_PERCENT = 10; // 10% goes to the platform

// --- Refund Configuration ---
/**
 * Number of days before a refund becomes available for unfulfilled ideas.
 * Set SKIP_REFUND_DELAY=true in env to allow immediate refunds for testing.
 */
export const REFUND_DELAY_DAYS = process.env.SKIP_REFUND_DELAY === "true" ? 0 : 30;

// --- Time Window Configuration ---
/**
 * Voting window duration in milliseconds (48 hours).
 * This is the time allowed for the community to vote on builds.
 */
export const VOTING_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Rejection cooldown duration in milliseconds (24 hours).
 * After a build is rejected, the builder must wait this long before resubmitting.
 */
export const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Tolerance for on-chain amount verification in USDC.
 * Allows for small rounding differences between DB and on-chain amounts.
 */
export const AMOUNT_TOLERANCE_USDC = 0.01;

// --- Admin Configuration ---
/**
 * Admin API key for protected endpoints.
 * Used for admin-only operations like reviewing reports.
 * SECURITY: No default - must be set in environment.
 */
export const ADMIN_API_KEY: string | undefined = process.env.ADMIN_API_KEY;

// --- App Configuration ---
/**
 * The base URL of the application.
 * Used for generating absolute URLs for assets and API endpoints.
 */
export const APP_URL: string = (process.env.NEXT_PUBLIC_URL || '').replace(/\/$/, '');

/**
 * The name of the mini app as displayed to users.
 * Used in titles, headers, and app store listings.
 */
export const APP_NAME: string = 'The Shipyard';

/**
 * The Farcaster FID for the platform account (@theshipyard).
 * Used for viewing the platform profile via SDK.
 */
export const PLATFORM_FID: number = 2005449;

/**
 * A brief description of the mini app's functionality.
 * Used in app store listings and metadata.
 */
export const APP_DESCRIPTION: string = 'Crowdfunded pools for Farcaster mini app ideas.';

/**
 * The primary category for the mini app.
 * Used for app store categorization and discovery.
 */
export const APP_PRIMARY_CATEGORY: string = 'social';

/**
 * Tags associated with the mini app.
 * Used for search and discovery in app stores.
 */
export const APP_TAGS: string[] = ['builders', 'crowdfunding', 'ideas', 'miniapps', 'shipping', 'community'];

// --- Asset URLs ---
/**
 * URL for the app's icon image.
 * Used in app store listings and UI elements.
 */
export const APP_ICON_URL: string = `${APP_URL}/logo-white.png`;

/**
 * URL for the app's Open Graph image.
 * Used for social media sharing and previews.
 */
export const APP_OG_IMAGE_URL: string = `${APP_URL}/api/opengraph-image`;

/**
 * URL for the app's splash screen image.
 * Displayed during app loading.
 */
export const APP_SPLASH_URL: string = `${APP_URL}/splash.png`;

/**
 * Background color for the splash screen.
 * Used as fallback when splash image is loading.
 */
export const APP_SPLASH_BACKGROUND_COLOR: string = '#030712';

/**
 * Account association for the mini app.
 * Used to associate the mini app with a Farcaster account.
 * If not provided, the mini app will be unsigned and have limited capabilities.
 */
export const APP_ACCOUNT_ASSOCIATION: AccountAssociation | undefined = {
  header: "eyJmaWQiOjQ4NzQ2MCwidHlwZSI6ImF1dGgiLCJrZXkiOiIweDkzQUM2MTY2ODg0ZGU3ZDUxMTc5ODcyMWYyMTQwNWQxZTIxOTNCRTAifQ",
  payload: "eyJkb21haW4iOiJodHRwczovL3RoZS1zaGlweWFyZC52ZXJjZWwuYXBwLyJ9",
  signature: "tCkIPKfWDVQVfq7RBzNjnDeCMdjhnfOcvpXx0o7NawpehItWb4H7lNmfZMxgTNttKybTG+bSvNJa7GDEYIBu+xw=",
};

// --- UI Configuration ---
/**
 * Text displayed on the main action button.
 * Used for the primary call-to-action in the mini app.
 */
export const APP_BUTTON_TEXT: string = 'Enter The Shipyard';

// --- Integration Configuration ---
/**
 * Webhook URL for receiving events from Neynar.
 *
 * If Neynar API key and client ID are configured, uses the official
 * Neynar webhook endpoint. Otherwise, falls back to a local webhook
 * endpoint for development and testing.
 */
export const APP_WEBHOOK_URL: string =
  process.env.NEYNAR_API_KEY && process.env.NEYNAR_CLIENT_ID
    ? `https://api.neynar.com/f/app/${process.env.NEYNAR_CLIENT_ID}/event`
    : `${APP_URL}/api/webhook`;

/**
 * Flag to enable/disable wallet functionality.
 *
 * When true, wallet-related components and features are rendered.
 * When false, wallet functionality is completely hidden from the UI.
 * Useful for mini apps that don't require wallet integration.
 */
export const USE_WALLET: boolean = true;

/**
 * Flag to enable/disable analytics tracking.
 *
 * When true, usage analytics are collected and sent to Neynar.
 * When false, analytics collection is disabled.
 * Useful for privacy-conscious users or development environments.
 */
export const ANALYTICS_ENABLED: boolean = false;

/**
 * Required chains for the mini app.
 *
 * Contains an array of CAIP-2 identifiers for blockchains that the mini app requires.
 * If the host does not support all chains listed here, it will not render the mini app.
 * If empty or undefined, the mini app will be rendered regardless of chain support.
 *
 * Supported chains: eip155:1, eip155:137, eip155:42161, eip155:10, eip155:8453,
 * solana:mainnet, solana:devnet
 */
export const APP_REQUIRED_CHAINS: string[] = [];

/**
 * Return URL for the mini app.
 *
 * If provided, the mini app will be rendered with a return URL to be rendered if the
 * back button is pressed from the home page.
 */
export const RETURN_URL: string | undefined = undefined;

/**
 * Cast hash for the launch announcement post.
 * Used to direct users to like/recast for engagement modal.
 */
export const LAUNCH_CAST_HASH: string = "0xa16d6dc1c63a0771bd13583c2fe240a624566a09";

// PLEASE DO NOT UPDATE THIS
export const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
  name: 'Farcaster SignedKeyRequestValidator',
  version: '1',
  chainId: 10,
  verifyingContract:
    '0x00000000fc700472606ed4fa22623acf62c60553' as `0x${string}`,
};

// PLEASE DO NOT UPDATE THIS
export const SIGNED_KEY_REQUEST_TYPE = [
  { name: 'requestFid', type: 'uint256' },
  { name: 'key', type: 'bytes' },
  { name: 'deadline', type: 'uint256' },
];
