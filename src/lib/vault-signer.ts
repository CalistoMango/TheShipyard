/**
 * Backend Signing Utility for ShipyardVault v3
 *
 * Handles EIP-712 signature generation for cumulative per-project claims.
 * Backend signs cumulative amounts, contract pays delta since last claim.
 * Server-side only - uses PAYOUT_SIGNER_KEY from environment.
 */

import { ethers } from "ethers";
import { SUBMITTER_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "./constants";
import { vaultAbi, ideaToProjectId } from "./contracts";

// Chain ID - Base Mainnet: 8453, Base Sepolia: 84532
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532; // Default to Sepolia for testing

// RPC URLs
const RPC_URL = CHAIN_ID === 8453
  ? (process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org")
  : (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");

/**
 * Get a provider for reading on-chain state
 */
function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

/**
 * Get the vault contract instance for reading state
 */
function getVaultContract(): ethers.Contract {
  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("VAULT_ADDRESS environment variable not set");
  }
  const provider = getProvider();
  return new ethers.Contract(vaultAddress, vaultAbi, provider);
}

/**
 * Convert idea ID to bytes32 projectId
 */
export function toProjectId(ideaId: number): string {
  return ideaToProjectId(ideaId);
}

/**
 * Get cumulative refund amount claimed for a (projectId, fid) pair
 * V3: Returns uint256 (cumulative amount), not boolean
 * THROWS on RPC error - caller must handle to prevent signing with stale state
 */
export async function getRefundClaimed(projectId: string, fid: bigint): Promise<bigint> {
  const vault = getVaultContract();
  const claimed = await vault.refundClaimed(projectId, fid);
  return BigInt(claimed.toString());
}

/**
 * Get cumulative reward amount claimed for a (projectId, fid) pair
 * V3: Returns uint256 (cumulative amount), not boolean
 * THROWS on RPC error - caller must handle to prevent signing with stale state
 */
export async function getRewardClaimed(projectId: string, fid: bigint): Promise<bigint> {
  const vault = getVaultContract();
  const claimed = await vault.rewardClaimed(projectId, fid);
  return BigInt(claimed.toString());
}

/**
 * Verify a funding transaction on-chain
 * Returns the verified amount or null if invalid
 */
export async function verifyFundingTransaction(
  txHash: string,
  expectedFid: number,
  expectedIdeaId: number
): Promise<{ verified: boolean; amount: bigint; error?: string }> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { verified: false, amount: 0n, error: "Transaction not found or not confirmed" };
    }

    if (receipt.status !== 1) {
      return { verified: false, amount: 0n, error: "Transaction failed on-chain" };
    }

    // Look for ProjectFunded event from our vault
    const vaultAddress = process.env.VAULT_ADDRESS?.toLowerCase();
    if (!vaultAddress) {
      // If no vault configured, skip verification (backwards compat)
      console.warn("VAULT_ADDRESS not set - skipping on-chain verification");
      return { verified: true, amount: 0n, error: "Verification skipped - no vault" };
    }

    const vault = getVaultContract();
    const projectFundedTopic = vault.interface.getEvent("ProjectFunded")?.topicHash;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== vaultAddress) continue;
      if (log.topics[0] !== projectFundedTopic) continue;

      try {
        const parsed = vault.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsed) {
          const logFid = Number(parsed.args.fid);
          const logProjectId = parsed.args.projectId as string;
          const logAmount = BigInt(parsed.args.amount.toString());

          // Convert expected idea ID to bytes32 for comparison
          const expectedProjectId = toProjectId(expectedIdeaId);

          if (logFid === expectedFid && logProjectId.toLowerCase() === expectedProjectId.toLowerCase()) {
            return { verified: true, amount: logAmount };
          }
        }
      } catch {
        // Skip logs we can't parse
      }
    }

    return { verified: false, amount: 0n, error: "No matching ProjectFunded event found" };
  } catch (error) {
    console.error("Error verifying funding transaction:", error);
    return { verified: false, amount: 0n, error: "Failed to verify transaction" };
  }
}

/**
 * Verify a refund claim transaction on-chain (v2: per-project)
 */
export async function verifyRefundTransaction(
  txHash: string,
  expectedFid: number,
  expectedProjectId?: string
): Promise<{ verified: boolean; amount: bigint; error?: string }> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { verified: false, amount: 0n, error: "Transaction not found or not confirmed" };
    }

    if (receipt.status !== 1) {
      return { verified: false, amount: 0n, error: "Transaction failed on-chain" };
    }

    const vaultAddress = process.env.VAULT_ADDRESS?.toLowerCase();
    if (!vaultAddress) {
      console.error("VAULT_ADDRESS not set - cannot verify refund transaction");
      return { verified: false, amount: 0n, error: "Server configuration error - vault address not set" };
    }

    const vault = getVaultContract();
    const refundClaimedTopic = vault.interface.getEvent("RefundClaimed")?.topicHash;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== vaultAddress) continue;
      if (log.topics[0] !== refundClaimedTopic) continue;

      try {
        const parsed = vault.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsed) {
          const logProjectId = parsed.args.projectId as string;
          const logFid = Number(parsed.args.fid);
          const amount = BigInt(parsed.args.amount.toString());

          // Match FID and optionally projectId
          if (logFid === expectedFid) {
            if (!expectedProjectId || logProjectId.toLowerCase() === expectedProjectId.toLowerCase()) {
              return { verified: true, amount };
            }
          }
        }
      } catch {
        // Skip logs we can't parse
      }
    }

    return { verified: false, amount: 0n, error: "No matching RefundClaimed event found" };
  } catch (error) {
    console.error("Error verifying refund transaction:", error);
    return { verified: false, amount: 0n, error: "Failed to verify transaction" };
  }
}

/**
 * Verify a reward claim transaction on-chain (v2: per-project)
 */
export async function verifyRewardTransaction(
  txHash: string,
  expectedFid: number,
  expectedProjectId?: string
): Promise<{ verified: boolean; amount: bigint; error?: string }> {
  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { verified: false, amount: 0n, error: "Transaction not found or not confirmed" };
    }

    if (receipt.status !== 1) {
      return { verified: false, amount: 0n, error: "Transaction failed on-chain" };
    }

    const vaultAddress = process.env.VAULT_ADDRESS?.toLowerCase();
    if (!vaultAddress) {
      console.warn("VAULT_ADDRESS not set - skipping on-chain verification");
      return { verified: true, amount: 0n, error: "Verification skipped - no vault" };
    }

    const vault = getVaultContract();
    const rewardClaimedTopic = vault.interface.getEvent("RewardClaimed")?.topicHash;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== vaultAddress) continue;
      if (log.topics[0] !== rewardClaimedTopic) continue;

      try {
        const parsed = vault.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsed) {
          const logProjectId = parsed.args.projectId as string;
          const logFid = Number(parsed.args.fid);
          const amount = BigInt(parsed.args.amount.toString());

          // Match FID and optionally projectId
          if (logFid === expectedFid) {
            if (!expectedProjectId || logProjectId.toLowerCase() === expectedProjectId.toLowerCase()) {
              return { verified: true, amount };
            }
          }
        }
      } catch {
        // Skip logs we can't parse
      }
    }

    return { verified: false, amount: 0n, error: "No matching RewardClaimed event found" };
  } catch (error) {
    console.error("Error verifying reward transaction:", error);
    return { verified: false, amount: 0n, error: "Failed to verify transaction" };
  }
}

// EIP-712 Domain - must match contract exactly
function getEIP712Domain() {
  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("VAULT_ADDRESS environment variable not set");
  }

  return {
    name: "The Shipyard",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: vaultAddress,
  };
}

// EIP-712 Types for v3 (cumulative claims)
const REFUND_TYPES = {
  ClaimRefund: [
    { name: "projectId", type: "bytes32" },
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const REWARD_TYPES = {
  ClaimReward: [
    { name: "projectId", type: "bytes32" },
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

// Types for v3 (cumulative claims)
export interface SignedClaim {
  projectId: string;
  fid: string;
  recipient: string;
  cumAmt: string; // v3: cumulative amount
  deadline: number;
  signature: string;
}

export interface ClaimParams {
  projectId: string; // bytes32 as hex string
  fid: bigint;
  recipientAddress: string;
  cumAmt: bigint; // v3: cumulative total amount to sign for
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
 * Sign a refund claim for a specific project (v3 - cumulative)
 *
 * Backend calculates: cumAmt = onChainClaimed + eligibleRefund
 * Contract pays: delta = cumAmt - onChainClaimed
 *
 * @example
 * const onChainClaimed = await getRefundClaimed(projectId, fid);
 * const eligible = 10_000_000n; // $10 new eligible refund
 * const signed = await signRefundClaim({
 *   projectId: toProjectId(283),
 *   fid: 12345n,
 *   recipientAddress: '0x123...',
 *   cumAmt: onChainClaimed + eligible, // cumulative total
 * });
 */
export async function signRefundClaim(params: ClaimParams): Promise<SignedClaim> {
  const { projectId, fid, recipientAddress, cumAmt, deadlineSeconds = 600 } = params;

  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const signer = getSigner();

  const message = {
    projectId,
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumAmt.toString(),
    deadline,
  };

  const signature = await signer.signTypedData(getEIP712Domain(), REFUND_TYPES, message);

  return {
    projectId,
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumAmt.toString(),
    deadline,
    signature,
  };
}

/**
 * Sign a reward claim for a specific project (v3 - cumulative)
 *
 * Backend calculates: cumAmt = onChainClaimed + eligibleReward
 * Contract pays: delta = cumAmt - onChainClaimed
 *
 * @example
 * const onChainClaimed = await getRewardClaimed(projectId, fid);
 * const eligible = 85_000_000n; // $85 builder reward
 * const signed = await signRewardClaim({
 *   projectId: toProjectId(283),
 *   fid: 67890n,
 *   recipientAddress: '0x456...',
 *   cumAmt: onChainClaimed + eligible, // cumulative total
 * });
 */
export async function signRewardClaim(params: ClaimParams): Promise<SignedClaim> {
  const { projectId, fid, recipientAddress, cumAmt, deadlineSeconds = 600 } = params;

  const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
  const signer = getSigner();

  const message = {
    projectId,
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumAmt.toString(),
    deadline,
  };

  const signature = await signer.signTypedData(getEIP712Domain(), REWARD_TYPES, message);

  return {
    projectId,
    fid: fid.toString(),
    recipient: recipientAddress,
    cumAmt: cumAmt.toString(),
    deadline,
    signature,
  };
}

/**
 * Calculate payout breakdown for a successful project
 *
 * @param totalPool - Total USDC in the project pool (in base units, 6 decimals)
 * @returns Breakdown of payouts using fee constants from constants.ts
 */
export function calculatePayouts(totalPool: bigint) {
  const platformFee = (totalPool * BigInt(PLATFORM_FEE_PERCENT)) / 100n;
  const ideaCreatorFee = (totalPool * BigInt(SUBMITTER_FEE_PERCENT)) / 100n;
  const builderPayout = totalPool - platformFee - ideaCreatorFee;

  return {
    totalPool,
    platformFee, // PLATFORM_FEE_SHARE - stays in contract
    ideaCreatorFee, // SUBMITTER_FEE_SHARE - to idea submitter
    builderPayout, // BUILDER_FEE_SHARE - to builder
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
