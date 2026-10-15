-- The sign-in table connect-pg-simple keeps. The backend has made it itself
-- the first time it started, so on every instance that has run this finds it
-- and changes nothing, and no one is signed out. The definition is
-- connect-pg-simple's own table.sql.

-- CreateTable
CREATE TABLE IF NOT EXISTS "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session"("expire");
