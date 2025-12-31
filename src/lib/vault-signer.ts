/**
 * Backend Signing Utility for ShipyardVault
 *
 * Handles EIP-712 signature generation for refunds and rewards.
 * Server-side only - uses PAYOUT_SIGNER_KEY from environment.
 */

import { ethers } from "ethers";

// EIP-712 Domain - must match contract exactly
function getEIP712Domain() {
  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("VAULT_ADDRESS environment variable not set");
  }

  return {
    name: "The Shipyard",
    version: "1",
    chainId: 8453, // Base Mainnet
    verifyingContract: vaultAddress,
  };
}

// EIP-712 Types
const REFUND_TYPES = {
  ClaimRefund: [
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const REWARD_TYPES = {
  ClaimReward: [
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

// Types
export interface SignedClaim {
  fid: string;
  recipient: string;
  cumAmt: string;
  deadline: number;
  signature: string;
}

export interface ClaimParams {
  fid: bigint;
  recipientAddress: string;
  cumulativeAmount: bigint;
  deadlineSeconds?: number; // Default 10 minutes
}

/**
 * Get the signer wallet for creating claim signatures
 */
function getSigner(): ethers.Wallet {
  const signerKey = process.env.PAYOUT_SIGNER_KEY;
  if (!signerKey) {
    throw new Error("PAYOUT_SIGNER_KEY environment variable not set");
  }
  return new ethers.Wallet(signerKey);
}

/**
 * Sign a refund claim for failed project(s)
 *
 * @example
 * const signed = await signRefundClaim({
 *   fid: 12345n,
 *   recipientAddress: '0x123...',
 *   cumulativeAmount: 150_000_000n, // 150 USDC (6 decimals)
 * });
 */
export async function signRefundClaim(params: ClaimParams): Promise<SignedClaim> {
  const { fid, recipientAddress, cumulativeAmount, deadlineSeconds = 600 } = params;

  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const signer = getSigner();

  const message = {
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumulativeAmount.toString(),
    deadline,
  };

  const signature = await signer.signTypedData(getEIP712Domain(), REFUND_TYPES, message);

  return {
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumulativeAmount.toString(),
    deadline,
    signature,
  };
}

/**
 * Sign a reward claim for builder or idea creator
 *
 * @example
 * const signed = await signRewardClaim({
 *   fid: 67890n,
 *   recipientAddress: '0x456...',
 *   cumulativeAmount: 875_000_000n, // 875 USDC (6 decimals)
 * });
 */
export async function signRewardClaim(params: ClaimParams): Promise<SignedClaim> {
  const { fid, recipientAddress, cumulativeAmount, deadlineSeconds = 600 } = params;

  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const signer = getSigner();

  const message = {
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumulativeAmount.toString(),
    deadline,
  };

  const signature = await signer.signTypedData(getEIP712Domain(), REWARD_TYPES, message);

  return {
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumulativeAmount.toString(),
    deadline,
    signature,
  };
}

/**
 * Calculate payout breakdown for a successful project
 *
 * @param totalPool - Total USDC in the project pool (in base units, 6 decimals)
 * @param platformFeePercent - Platform fee percentage (default 10%)
 * @returns Breakdown of payouts
 */
export function calculatePayouts(totalPool: bigint, platformFeePercent = 10n) {
  const platformFee = (totalPool * platformFeePercent) / 100n;
  const ideaCreatorFee = (totalPool * 5n) / 100n;
  const builderPayout = totalPool - platformFee - ideaCreatorFee;

  return {
    totalPool,
    platformFee, // 10% - stays in contract
    ideaCreatorFee, // 5% - to idea submitter
    builderPayout, // 85% - to builder
  };
}

// USDC has 6 decimals
export const USDC_DECIMALS = 6;

/**
 * Convert a dollar amount to USDC base units (6 decimals)
 */
export function usdcToBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/**
 * Convert USDC base units to dollar amount
 */
export function baseUnitsToUsdc(baseUnits: bigint): number {
  return Number(baseUnits) / 10 ** USDC_DECIMALS;
}
