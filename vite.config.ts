import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';

// Build stamp for the preferences sheet. Vercel builds expose the commit as
// an env var; local builds fall back to git.
const commit = (
	process.env.VERCEL_GIT_COMMIT_SHA ??
	(() => {
		try {
			return execSync('git rev-parse HEAD').toString();
		} catch {
			return 'dev';
		}
	})()
)
	.trim()
	.slice(0, 7);

export default defineConfig({
	define: {
		__BUILD_DATE__: JSON.stringify(new Date().toISOString()),
		__COMMIT_HASH__: JSON.stringify(commit)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter({ fallback: 'index.html' })
		})
	],
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
