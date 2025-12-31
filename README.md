# The Shipyard

A Farcaster mini-app for crowdfunding project ideas with USDC on Base. Users fund ideas using their Farcaster ID (FID), and rewards are distributed to builders and idea creators upon successful completion.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        PROJECT LIFECYCLE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. FUNDING PHASE                                               │
│     ├── User A (FID 12345) funds Project X → 100 USDC          │
│     ├── User B (FID 67890) funds Project X → 200 USDC          │
│     └── Pool = 300 USDC                                         │
│                                                                 │
│  2a. PROJECT FAILS (not built in 30 days)                       │
│      ├── FID 12345 claims refund → 100 USDC (any wallet)       │
│      └── FID 67890 claims refund → 200 USDC (any wallet)       │
│                                                                 │
│  2b. PROJECT SUCCEEDS (built & validated)                       │
│      ├── Platform fee (10%) → 30 USDC (stays in vault)          │
│      ├── Idea creator (5%) → 15 USDC                            │
│      ├── Builder (85%) → 255 USDC                               │
│      └── Funders: nothing back (successfully funded!)           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Blockchain**: Base (L2), USDC, wagmi/viem
- **Backend**: Next.js API routes, Supabase (PostgreSQL)
- **Farcaster**: Neynar SDK, Mini App SDK
- **Smart Contract**: ShipyardVault (Solidity, UUPS upgradeable)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Neynar API key

### Environment Variables

Create a `.env.local` file:

```bash
# Neynar
NEXT_PUBLIC_NEYNAR_CLIENT_ID=your_client_id
NEYNAR_API_KEY=your_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Smart Contract (after deployment)
NEXT_PUBLIC_VAULT_ADDRESS=0x...  # Client-side
VAULT_ADDRESS=0x...              # Server-side (same address)
PAYOUT_SIGNER_KEY=0x...          # Private key for signing claims

# Optional
BASE_RPC_URL=https://mainnet.base.org
```

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running Tests

```bash
# Unit tests
npm test

# With dev server running (for integration tests)
npm run dev & npm test
```

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── ideas/              # Idea CRUD, funding, upvotes
│   │   ├── builds/             # Build submissions, voting
│   │   ├── claim-reward/       # Reward claim signatures
│   │   └── ...
│   └── page.tsx                # Main app entry
├── components/
│   └── ui/                     # React components
│       ├── IdeaDetail.tsx      # Idea detail with funding
│       ├── BrowseTab.tsx       # Browse ideas
│       └── ...
├── lib/
│   ├── contracts.ts            # Contract ABIs & addresses
│   ├── vault-signer.ts         # EIP-712 signing utilities
│   ├── supabase.ts             # Database client
│   └── types.ts                # TypeScript types
└── __tests__/                  # Test files
```

## Smart Contract

The `ShipyardVault` contract (deployed on Base) handles USDC deposits and signature-based claims:

| Function | Description |
|----------|-------------|
| `fundProject(fid, projectId, amount)` | Deposit USDC to fund a project |
| `claimRefund(fid, recipient, cumAmt, deadline, sig)` | Claim refund for failed projects |
| `claimReward(fid, recipient, cumAmt, deadline, sig)` | Claim reward as builder/idea creator |
| `lastClaimedRefund(fid)` | View cumulative refunds claimed by FID |
| `lastClaimedReward(fid)` | View cumulative rewards claimed by FID |

The contract uses EIP-712 signatures for secure, gas-efficient claims. The backend signs claim authorizations, and users submit them on-chain to receive funds.

## API Endpoints

### Ideas
- `GET /api/ideas` - List ideas (with filters/sorting)
- `GET /api/ideas/[id]` - Get idea details
- `POST /api/ideas` - Create new idea
- `POST /api/ideas/[id]/fund` - Record funding (after on-chain tx)
- `POST /api/ideas/[id]/upvote` - Toggle upvote
- `POST /api/ideas/[id]/refund-signature` - Get signed refund claim

### Builds
- `GET /api/builds` - List builds
- `POST /api/builds` - Submit a build
- `POST /api/builds/[id]/vote` - Vote on a build

### Claims
- `GET /api/claim-reward?fid=123` - Check available rewards
- `POST /api/claim-reward` - Get signed reward claim

### Users
- `GET /api/users/[fid]` - Get user profile
- `GET /api/leaderboard` - Get leaderboard data

## Fee Structure

| Recipient | Percentage |
|-----------|------------|
| Builder | 85% |
| Idea Creator | 5% |
| Platform | 10% |

## Deployment

### Frontend (Vercel)

```bash
npm run deploy:vercel
```

### Smart Contract (Base)

The ShipyardVault contract is deployed separately using Foundry. After deployment, set the `VAULT_ADDRESS` environment variables.

## Security Considerations

- Use a multisig for contract ownership
- Store `PAYOUT_SIGNER_KEY` securely (KMS/HSM recommended)
- Get the contract audited before mainnet
- Validate all user inputs server-side

## License

MIT
