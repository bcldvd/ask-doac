// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	// build stamp injected by `define` in vite.config.ts
	const __BUILD_DATE__: string;
	const __COMMIT_HASH__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
