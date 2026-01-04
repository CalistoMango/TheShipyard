import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Manifest } from '@farcaster/miniapp-core/src/manifest';
import {
  APP_BUTTON_TEXT,
  APP_DESCRIPTION,
  APP_ICON_URL,
  APP_NAME,
  APP_OG_IMAGE_URL,
  APP_PRIMARY_CATEGORY,
  APP_SPLASH_BACKGROUND_COLOR,
  APP_SPLASH_URL,
  APP_TAGS,
  APP_URL,
  APP_WEBHOOK_URL,
  APP_ACCOUNT_ASSOCIATION,
} from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMiniAppEmbedMetadata(ogImageUrl?: string) {
  return {
    version: 'next',
    imageUrl: ogImageUrl ?? APP_OG_IMAGE_URL,
    ogTitle: APP_NAME,
    ogDescription: APP_DESCRIPTION,
    ogImageUrl: ogImageUrl ?? APP_OG_IMAGE_URL,
    button: {
      title: APP_BUTTON_TEXT,
      action: {
        type: 'launch_frame',
        name: APP_NAME,
        url: APP_URL,
        splashImageUrl: APP_SPLASH_URL,
        iconUrl: APP_ICON_URL,
        splashBackgroundColor: APP_SPLASH_BACKGROUND_COLOR,
        description: APP_DESCRIPTION,
        primaryCategory: APP_PRIMARY_CATEGORY,
        tags: APP_TAGS,
      },
    },
  };
}

/**
 * Parse and validate a numeric ID from a string.
 *
 * @param id - The string ID to parse
 * @param fieldName - Name of the field for error messages (default: "ID")
 * @returns Object with parsed id or error message
 */
export function parseId(
  id: string | undefined | null,
  fieldName: string = "ID"
): { valid: true; id: number } | { valid: false; error: string } {
  if (!id) {
    return { valid: false, error: `Missing ${fieldName}` };
  }

  const parsed = parseInt(id, 10);

  if (isNaN(parsed) || parsed <= 0) {
    return { valid: false, error: `Invalid ${fieldName}` };
  }

  return { valid: true, id: parsed };
}

export async function getFarcasterDomainManifest(): Promise<Manifest> {
  return {
    accountAssociation: APP_ACCOUNT_ASSOCIATION!,
    miniapp: {
      version: '1',
      name: APP_NAME ?? 'Neynar Starter Kit',
      homeUrl: APP_URL,
      iconUrl: APP_ICON_URL,
      imageUrl: APP_OG_IMAGE_URL,
      buttonTitle: APP_BUTTON_TEXT ?? 'Launch Mini App',
      splashImageUrl: APP_SPLASH_URL,
      splashBackgroundColor: APP_SPLASH_BACKGROUND_COLOR,
      webhookUrl: APP_WEBHOOK_URL,
      // Recommended fields (type assertion needed as @farcaster/miniapp-core types are outdated)
      tagline: 'Fund ideas. Race to build. Claim the pool.',
      description: APP_DESCRIPTION,
      primaryCategory: APP_PRIMARY_CATEGORY,
      tags: APP_TAGS,
    } as Manifest['miniapp'],
  };
}
