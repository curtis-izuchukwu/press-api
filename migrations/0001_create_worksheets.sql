CREATE TABLE IF NOT EXISTS worksheets (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  format TEXT NOT NULL,
  academic_level TEXT NOT NULL,
  mode TEXT NOT NULL,
  cache_status TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);