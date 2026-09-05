/**
 * Single wiring point for the backend service.
 *
 * INTEGRATION NOTE FOR PERSON 1:
 * Replace `PlaceholderBackendService` with the real implementation of
 * `BackendService` (see ./backend.interface.ts) once it exists. Nothing
 * else in the dashboard codebase should need to change.
 */
import { BackendService } from "./backend.interface";
import { PlaceholderBackendService } from "./backend.placeholder";

export const backend: BackendService = new PlaceholderBackendService(
  process.env.QUILL_DB_PATH || undefined
);

export * from "./backend.interface";
