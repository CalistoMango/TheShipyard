/**
 * Backend Signing Utility for ShipyardVault
 *
 * Handles EIP-712 signature generation for refunds and rewards.
 * Server-side only - uses PAYOUT_SIGNER_KEY from environment.
 */

import { ethers } from "ethers";
import { SUBMITTER_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "./constants";
import { vaultAbi } from "./contracts";

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
 * Query on-chain lastClaimedRefund for a FID
 * This is the cumulative amount already claimed
 */
export async function getLastClaimedRefund(fid: bigint): Promise<bigint> {
  try {
    const vault = getVaultContract();
    const result = await vault.lastClaimedRefund(fid);
    return BigInt(result.toString());
  } catch (error) {
    console.error("Error querying lastClaimedRefund:", error);
    // Return 0 if vault doesn't exist or query fails
    return 0n;
  }
}

/**
 * Query on-chain lastClaimedReward for a FID
 * This is the cumulative amount already claimed
 */
export async function getLastClaimedReward(fid: bigint): Promise<bigint> {
  try {
    const vault = getVaultContract();
    const result = await vault.lastClaimedReward(fid);
    return BigInt(result.toString());
  } catch (error) {
    console.error("Error querying lastClaimedReward:", error);
    // Return 0 if vault doesn't exist or query fails
    return 0n;
  }
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
          const expectedProjectId = `0x${expectedIdeaId.toString(16).padStart(64, '0')}`;

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
 * Verify a refund claim transaction on-chain
 */
export async function verifyRefundTransaction(
  txHash: string,
  expectedFid: number
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
          const logFid = Number(parsed.args.fid);
          const delta = BigInt(parsed.args.delta.toString());

          if (logFid === expectedFid) {
            return { verified: true, amount: delta };
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
 * Verify a reward claim transaction on-chain
 */
export async function verifyRewardTransaction(
  txHash: string,
  expectedFid: number
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
          const logFid = Number(parsed.args.fid);
          const delta = BigInt(parsed.args.delta.toString());

          if (logFid === expectedFid) {
            return { verified: true, amount: delta };
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
