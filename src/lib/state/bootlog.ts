// Persistent boot breadcrumbs. When iOS runs a page out of memory it kills
// and reloads it with no error and no console left behind — the only way to
// learn where boot died is a trail written synchronously to localStorage
// before each step. On the next load, a trail that never reached 'ready' (or
// a caught 'error') identifies the step the OS killed.

const CURRENT = 'ask-doac:boot:current';
const PREVIOUS = 'ask-doac:boot:previous';

interface Crumb {
	stage: string;
	t: number;
}

export interface CrashReport {
	/** last stage that started before the page was killed */
	stage: string;
	/** how far into boot that stage started */
	afterMs: number;
}

function read(key: string): Crumb[] {
	try {
		return JSON.parse(localStorage.getItem(key) ?? '[]');
	} catch {
		return [];
	}
}

/** Mark the start of a boot stage. Synchronous, so it survives a process kill. */
export function crumb(stage: string, t = Date.now()): void {
	try {
		const trail = read(CURRENT);
		trail.push({ stage, t });
		localStorage.setItem(CURRENT, JSON.stringify(trail));
	} catch {
		// no localStorage (private mode edge cases) — diagnostics only, carry on
	}
}

/**
 * Rotate the trail at boot start and report whether the previous attempt was
 * killed mid-stage. Reaching 'ready', a caught 'error…' or a deliberate
 * 'reload' (deploy pickup) is a clean ending; anything else means the OS
 * killed the page during that stage.
 */
export function startBootLog(): CrashReport | null {
	try {
		const prev = read(CURRENT);
		localStorage.setItem(PREVIOUS, JSON.stringify(prev));
		localStorage.setItem(CURRENT, '[]');
		const last = prev.at(-1);
		if (
			!last ||
			last.stage === 'ready' ||
			last.stage === 'done' ||
			last.stage === 'reload' ||
			last.stage.startsWith('error')
		) {
			return null;
		}
		console.warn('previous boot was killed during:', last.stage, prev);
		return { stage: last.stage, afterMs: last.t - prev[0].t };
	} catch {
		return null;
	}
}

const STAGE_LABELS: Record<string, string> = {
	boot: 'starting up',
	'model-file': 'downloading the model file',
	'wasm-runtime': 'fetching the AI runtime',
	'webgpu-device': 'starting WebGPU',
	'engine-weights': 'loading the model onto the GPU',
	'webllm-engine': 'loading the model (download + GPU)',
	'ask-translate': 'reading the question (first model run)',
	'ask-embed': 'loading the search embedder',
	'ask-retrieve': 'searching the transcripts',
	'ask-generate': 'writing the answer'
};

export function stageLabel(stage: string): string {
	return STAGE_LABELS[stage] ?? stage;
}
