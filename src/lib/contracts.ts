/**
 * Smart contract addresses and ABIs for The Shipyard
 *
 * Uses ShipyardVault v3 - Cumulative per-project claims
 * Backend signs cumulative amounts, contract pays delta since last claim
 */

// Chain configuration - set via environment or defaults to Base Mainnet
// Base Mainnet: 8453, Base Sepolia: 84532
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532; // Default to Sepolia for testing
export const IS_TESTNET = CHAIN_ID === 84532;

// Contract addresses
// Base Mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// Base Sepolia USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
export const USDC_ADDRESS = (
  IS_TESTNET
    ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
) as `0x${string}`;
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

// ShipyardVault v3 ABI (cumulative per-project claims)
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
  // Claim refund with backend signature (v3: cumulative amount)
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "projectId", type: "bytes32" },
      { name: "fid", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "cumAmt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  // Claim reward with backend signature (v3: cumulative amount)
  {
    name: "claimReward",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "projectId", type: "bytes32" },
      { name: "fid", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "cumAmt", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  // View: Cumulative refund claimed for (projectId, fid)
  {
    name: "refundClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "projectId", type: "bytes32" },
      { name: "fid", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  // View: Cumulative reward claimed for (projectId, fid)
  {
    name: "rewardClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "projectId", type: "bytes32" },
      { name: "fid", type: "uint256" },
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
  // Events (v3: cumulative tracking, emits delta amount)
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
      { name: "projectId", type: "bytes32", indexed: true },
      { name: "fid", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }, // delta transferred
    ],
  },
  {
    name: "RewardClaimed",
    type: "event",
    inputs: [
      { name: "projectId", type: "bytes32", indexed: true },
      { name: "fid", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false }, // delta transferred
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

// Constants
export const USDC_DECIMALS = 6;

// EIP-712 domain for signing (must match contract)
export const VAULT_DOMAIN = {
  name: "The Shipyard",
  version: "1",
  chainId: CHAIN_ID,
  // verifyingContract will be added when VAULT_ADDRESS is set
} as const;

// EIP-712 types for v3 claim signatures (cumulative amounts)
export const CLAIM_REFUND_TYPES = {
  ClaimRefund: [
    { name: "projectId", type: "bytes32" },
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const CLAIM_REWARD_TYPES = {
  ClaimReward: [
    { name: "projectId", type: "bytes32" },
    { name: "fid", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "cumAmt", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
