/**
 * Reads the .env file in the working directory (backend/.env in development)
 * into process.env. A variable the environment already sets keeps its value.
 * src/server.ts imports this before anything else, so every module after it
 * sees the file's settings; the production image has no .env and sets
 * everything through the environment.
 *
 * quiet: from dotenv 17 on, every load prints "injected env (N) from .env" to
 * stderr unless told not to, even when there is no file.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
