-- The Shipyard Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- ===========================================
-- ENUMS
-- ===========================================

CREATE TYPE idea_status AS ENUM ('open', 'voting', 'completed');
CREATE TYPE build_status AS ENUM ('pending_review', 'voting', 'approved', 'rejected');
CREATE TYPE category AS ENUM ('games', 'tools', 'social', 'defi', 'content', 'other');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'completed', 'failed');

-- ===========================================
-- USERS
-- ===========================================

CREATE TABLE users (
  fid BIGINT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  pfp_url TEXT,
  wallet_address TEXT,
  balance DECIMAL(18, 6) DEFAULT 0 CHECK (balance >= 0),
  streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for wallet lookups
CREATE INDEX idx_users_wallet ON users(wallet_address);

-- ===========================================
-- DEPOSITS (Immutable audit log)
-- ===========================================

CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_fid BIGINT NOT NULL REFERENCES users(fid),
  amount DECIMAL(18, 6) NOT NULL CHECK (amount >= 1),
  tx_hash TEXT NOT NULL UNIQUE,
  confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent updates/deletes on deposits (immutable)
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Modification of audit records is not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deposits_immutable
  BEFORE UPDATE OR DELETE ON deposits
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ===========================================
-- WITHDRAWALS (Immutable audit log)
-- ===========================================

CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_fid BIGINT NOT NULL REFERENCES users(fid),
  amount DECIMAL(18, 6) NOT NULL CHECK (amount >= 1),
  wallet_address TEXT NOT NULL,
  tx_hash TEXT,
  status withdrawal_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TRIGGER withdrawals_immutable
  BEFORE DELETE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ===========================================
-- IDEAS
-- ===========================================

CREATE TABLE ideas (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category category NOT NULL DEFAULT 'other',
  status idea_status DEFAULT 'open',
  cast_hash TEXT,
  related_casts TEXT[] DEFAULT '{}',
  submitter_fid BIGINT REFERENCES users(fid),
  pool DECIMAL(18, 6) DEFAULT 0,
  upvote_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for filtering and sorting
CREATE INDEX idx_ideas_status ON ideas(status);
CREATE INDEX idx_ideas_category ON ideas(category);
CREATE INDEX idx_ideas_pool ON ideas(pool DESC);
CREATE INDEX idx_ideas_upvotes ON ideas(upvote_count DESC);
CREATE INDEX idx_ideas_created ON ideas(created_at DESC);
CREATE INDEX idx_ideas_submitter ON ideas(submitter_fid);

-- ===========================================
-- FUNDING (Immutable audit log)
-- ===========================================

CREATE TABLE funding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id INTEGER NOT NULL REFERENCES ideas(id),
  funder_fid BIGINT NOT NULL REFERENCES users(fid),
  amount DECIMAL(18, 6) NOT NULL CHECK (amount >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER funding_immutable
  BEFORE UPDATE OR DELETE ON funding
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE INDEX idx_funding_idea ON funding(idea_id);
CREATE INDEX idx_funding_funder ON funding(funder_fid);

-- ===========================================
-- UPVOTES (Toggleable)
-- ===========================================

CREATE TABLE upvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id INTEGER NOT NULL REFERENCES ideas(id),
  user_fid BIGINT NOT NULL REFERENCES users(fid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(idea_id, user_fid)
);

CREATE INDEX idx_upvotes_idea ON upvotes(idea_id);
CREATE INDEX idx_upvotes_user ON upvotes(user_fid);

-- ===========================================
-- BUILDS
-- ===========================================

CREATE TABLE builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id INTEGER NOT NULL REFERENCES ideas(id),
  builder_fid BIGINT NOT NULL REFERENCES users(fid),
  url TEXT NOT NULL,
  description TEXT,
  status build_status DEFAULT 'pending_review',
  vote_ends_at TIMESTAMPTZ,
  votes_approve INTEGER DEFAULT 0,
  votes_reject INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_builds_idea ON builds(idea_id);
CREATE INDEX idx_builds_builder ON builds(builder_fid);
CREATE INDEX idx_builds_status ON builds(status);

-- ===========================================
-- VOTES (on builds)
-- ===========================================

CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES builds(id),
  voter_fid BIGINT NOT NULL REFERENCES users(fid),
  approved BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(build_id, voter_fid)
);

CREATE INDEX idx_votes_build ON votes(build_id);
CREATE INDEX idx_votes_voter ON votes(voter_fid);

-- ===========================================
-- PAYOUTS (Immutable audit log)
-- ===========================================

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES builds(id),
  recipient_fid BIGINT NOT NULL REFERENCES users(fid),
  amount DECIMAL(18, 6) NOT NULL,
  payout_type TEXT NOT NULL CHECK (payout_type IN ('builder', 'submitter', 'platform')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER payouts_immutable
  BEFORE UPDATE OR DELETE ON payouts
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE INDEX idx_payouts_build ON payouts(build_id);
CREATE INDEX idx_payouts_recipient ON payouts(recipient_fid);

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER builds_updated_at
  BEFORE UPDATE ON builds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Public read access for ideas, builds, users (leaderboard)
CREATE POLICY "Ideas are viewable by everyone" ON ideas FOR SELECT USING (true);
CREATE POLICY "Builds are viewable by everyone" ON builds FOR SELECT USING (true);
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Funding is viewable by everyone" ON funding FOR SELECT USING (true);
CREATE POLICY "Upvotes are viewable by everyone" ON upvotes FOR SELECT USING (true);
CREATE POLICY "Votes are viewable by everyone" ON votes FOR SELECT USING (true);
CREATE POLICY "Payouts are viewable by everyone" ON payouts FOR SELECT USING (true);

-- Deposits/withdrawals only viewable by owner (via service role for now)
CREATE POLICY "Deposits viewable by owner" ON deposits FOR SELECT USING (true);
CREATE POLICY "Withdrawals viewable by owner" ON withdrawals FOR SELECT USING (true);

-- Write operations will be done via service role / API routes
-- (Add more granular policies as auth is implemented)
