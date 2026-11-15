CREATE TABLE password_vault (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt BLOB NOT NULL CHECK (length(salt) = 16),
  encrypted BLOB NOT NULL
);
