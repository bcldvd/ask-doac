/**
 * "26 Jul 2026, 15:42 (2c0c7f2)" — the build stamp shown in preferences.
 * Locale and timezone are pinned to UTC/en-GB so the label matches the
 * moment the build ran, not where the viewer happens to be.
 */
export function versionLabel(builtAtIso: string, commit: string): string {
	const date = new Date(builtAtIso).toLocaleString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'UTC'
	});
	return `${date} (${commit})`;
}
