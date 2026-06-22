/**
 * Lightweight debug logger gated by a live settings getter.
 *
 * When debug logging is disabled the calls are cheap no-ops, so call sites can
 * stay in hot paths. All messages are prefixed with `[Orbital]` so users can
 * filter the developer console. Uses console.debug (not console.log) per the
 * Obsidian community-plugin guidelines.
 */

export type LogFn = (...args: unknown[]) => void;

export interface Logger {
	/** Emit a verbose trace when debug logging is enabled. */
	debug: LogFn;
}

/**
 * Build a Logger whose output is gated by `isEnabled()`, re-read on every call
 * so toggling the setting takes effect immediately without re-wiring.
 */
export function createLogger(isEnabled: () => boolean): Logger {
	return {
		debug: (...args: unknown[]): void => {
			if (isEnabled()) console.debug("[Orbital]", ...args);
		},
	};
}
