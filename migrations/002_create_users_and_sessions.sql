CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(50) NOT NULL CHECK (length(trim(username)) > 0),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- El nombre de usuario no distingue mayúsculas: "Admin" y "admin" son la misma persona.
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));

-- Solo se guarda el hash SHA-256 del token: una fuga de la base no revela sesiones válidas.
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
