// Time-remaining estimate for the model download, computed over a sliding
// window of recent progress so it tracks the connection's *current* speed
// instead of averaging over the whole download. Time is injected (ms
// timestamps) so tests stay clock-free.

export interface EtaEstimate {
	/** seconds until the download completes at the current speed */
	seconds: number;
	bytesPerSec: number;
}

const WINDOW_MS = 5_000;
/** don't publish a number until the window spans this much time */
const WARMUP_MS = 1_000;

export class DownloadEta {
	private samples: { at: number; bytes: number }[] = [];

	/** Record a progress sample and return the current estimate (null while warming up or stalled). */
	sample(at: number, receivedBytes: number, totalBytes: number): EtaEstimate | null {
		this.samples.push({ at, bytes: receivedBytes });
		while (this.samples.length > 1 && this.samples[0].at < at - WINDOW_MS) this.samples.shift();

		const first = this.samples[0];
		const spanMs = at - first.at;
		const spanBytes = receivedBytes - first.bytes;
		if (spanMs < WARMUP_MS || spanBytes <= 0) return null;

		const bytesPerSec = (spanBytes / spanMs) * 1000;
		const seconds = Math.max(0, (totalBytes - receivedBytes) / bytesPerSec);
		return { seconds, bytesPerSec };
	}
}

/** "about 10 min left" / "about a minute left" / "under a minute left" / "a few seconds left" */
export function formatEta(seconds: number): string {
	if (seconds >= 90) return `about ${Math.round(seconds / 60)} min left`;
	if (seconds >= 60) return 'about a minute left';
	if (seconds >= 10) return 'under a minute left';
	return 'a few seconds left';
}

export function formatSpeed(bytesPerSec: number): string {
	return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
}
