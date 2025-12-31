/**
 * Smart contract addresses and ABIs for The Shipyard
 *
 * Uses ShipyardVault - a FID-based USDC vault with signature claims
 */

// Contract addresses - update VAULT_ADDRESS after deployment
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined;

// Standard ERC20 ABI (minimal for approve + allowance)
export const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

// ShipyardVault ABI (FID-based, signature claims)
export const vaultAbi = [
  // Fund a project
  {
    name: "fundProject",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "projectId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  // Claim refund with backend signature
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "cumAmt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Claim reward with backend signature
  {
    name: "claimReward",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "cumAmt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  // View: Cumulative refunds claimed by FID
  {
    name: "lastClaimedRefund",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "fid", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // View: Cumulative rewards claimed by FID
  {
    name: "lastClaimedReward",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "fid", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // View: Get claimable refund amount
  {
    name: "claimableRefund",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "cumAmt", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  // View: Get claimable reward amount
  {
    name: "claimableReward",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "fid", type: "uint256" },
      { name: "cumAmt", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  // View: Total USDC in vault
  {
    name: "totalBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  // View: Domain separator for EIP-712
  {
    name: "domainSeparator",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  // Events
  {
    name: "ProjectFunded",
    type: "event",
    inputs: [
      { name: "fid", type: "uint256", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "projectId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RefundClaimed",
    type: "event",
    inputs: [
      { name: "fid", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "cumAmt", type: "uint256", indexed: false },
      { name: "delta", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RewardClaimed",
    type: "event",
    inputs: [
      { name: "fid", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "cumAmt", type: "uint256", indexed: false },
      { name: "delta", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * Convert an idea ID (number) to bytes32 projectId for the contract
 * The contract uses bytes32 for flexibility - we just left-pad the ID
 */
export function ideaToProjectId(ideaId: number): `0x${string}` {
  return `0x${ideaId.toString(16).padStart(64, '0')}` as `0x${string}`;
}

// Chain config
export const BASE_CHAIN_ID = 8453;
export const USDC_DECIMALS = 6;

// EIP-712 domain for signing (must match contract)
export const VAULT_DOMAIN = {
  name: "The Shipyard",
  version: "1",
  chainId: BASE_CHAIN_ID,
  // verifyingContract will be added when VAULT_ADDRESS is set
} as const;

// EIP-712 types for claim signatures
export const CLAIM_REFUND_TYPES = {
  ClaimRefund: [
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const CLAIM_REWARD_TYPES = {
  ClaimReward: [
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
