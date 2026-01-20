-- Feedback Radar Schema
-- Tables for storing feedback and AI analysis results

-- Feedback table
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fingerprint TEXT UNIQUE,
  analysis_status TEXT DEFAULT 'pending' CHECK(analysis_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Indexes for feedback table
CREATE INDEX idx_feedback_source ON feedback(source);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX idx_feedback_analysis_status ON feedback(analysis_status);
CREATE INDEX idx_feedback_fingerprint ON feedback(fingerprint);

-- Analysis table
CREATE TABLE analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id INTEGER NOT NULL UNIQUE,
  sentiment_label TEXT CHECK(sentiment_label IN ('positive', 'neutral', 'negative')),
  sentiment_confidence REAL,
  urgency_score INTEGER,
  urgency_reason TEXT,
  themes_json TEXT,
  summary TEXT,
  next_action TEXT,
  model TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  error TEXT,
  FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
);

-- Indexes for analysis table
CREATE INDEX idx_analysis_feedback_id ON analysis(feedback_id);
CREATE INDEX idx_analysis_sentiment_label ON analysis(sentiment_label);
CREATE INDEX idx_analysis_urgency_score ON analysis(urgency_score DESC);
CREATE INDEX idx_analysis_updated_at ON analysis(updated_at DESC);
