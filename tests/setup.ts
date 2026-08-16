/**
 * Test setup.
 *
 * Installs an in-memory IndexedDB so repository and persistence tests exercise
 * the real repository code paths — real transactions, real indexes, real
 * key handling — rather than a hand-written fake that would drift from the
 * implementation it is supposed to be testing.
 *
 * NO NETWORK. NO LLM. NO EXTERNAL API. Nothing under tests/ imports a client.
 */

import "fake-indexeddb/auto";
