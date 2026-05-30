-- ══════════════════════════════════════════════════════════════
-- SpotiFight — Friend System Migration
-- Run this in the Supabase dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Add friend_code column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_friend_code_idx ON profiles(friend_code);

-- 2. Create duel_invites table
CREATE TABLE IF NOT EXISTS duel_invites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    room_code   TEXT,
    status      TEXT        NOT NULL DEFAULT 'pending',  -- pending | sent | accepted | declined | expired
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Row-Level Security for duel_invites
ALTER TABLE duel_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "duel_invites_select"
    ON duel_invites FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "duel_invites_insert"
    ON duel_invites FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "duel_invites_update"
    ON duel_invites FOR UPDATE
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 4. Enable Realtime for duel_invites
ALTER PUBLICATION supabase_realtime ADD TABLE duel_invites;
