-- Quran Easy Malayalam - Supabase Schema
-- Run this in the Supabase SQL Editor

-- User word progress (each row = one unique Arabic word for one user)
CREATE TABLE user_word_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word_id TEXT NOT NULL,
  arabic TEXT NOT NULL,
  malayalam TEXT NOT NULL,
  status TEXT DEFAULT 'new'
    CHECK (status IN ('new', 'learning', 'learned', 'mastered')),
  ease_factor FLOAT DEFAULT 2.5,
  interval_days INT DEFAULT 0,
  next_review TIMESTAMPTZ,
  correct_count INT DEFAULT 0,
  wrong_count INT DEFAULT 0,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

-- Quiz history
CREATE TABLE quiz_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scope_type TEXT NOT NULL
    CHECK (scope_type IN ('page', 'juz', 'surah')),
  scope_value INT NOT NULL,
  score INT NOT NULL,
  total INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for words due for review
CREATE INDEX idx_word_progress_review
  ON user_word_progress(user_id, next_review)
  WHERE status != 'new';

-- Mushtabihat bookmarks (saved verse pairs)
CREATE TABLE user_mushtabihat_bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ayah1 TEXT NOT NULL,
  ayah2 TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ayah1, ayah2)
);

-- Mushtabihat hidden/spam pairs (dismissed by user)
CREATE TABLE user_mushtabihat_hidden (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ayah1 TEXT NOT NULL,
  ayah2 TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ayah1, ayah2)
);

-- RLS policies
ALTER TABLE user_word_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mushtabihat_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mushtabihat_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own word progress"
  ON user_word_progress FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own quiz history"
  ON quiz_history FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own mushtabihat bookmarks"
  ON user_mushtabihat_bookmarks FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own mushtabihat hidden"
  ON user_mushtabihat_hidden FOR ALL
  USING (auth.uid() = user_id);
