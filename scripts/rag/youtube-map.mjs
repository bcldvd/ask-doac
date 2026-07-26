// Map every scraped episode to its YouTube video on The Diary Of A CEO
// channel. YouTube titles differ from podcast titles (DOAC retitles per
// platform), so title search is unreliable — instead we dump the channel's
// video list once and match by DURATION (transcript's last timestamp ≈ video
// length), with title similarity as tiebreak. Outputs:
//   data/youtube-map.json      full match info for auditing
//   static/rag/youtube.json    shipped {episodeId: videoId}
import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CHANNELS = [
	'https://www.youtube.com/@TheDiaryOfACEO/videos',
	'https://www.youtube.com/@TheDiaryOfACEO/podcasts',
	'https://www.youtube.com/@TheDiaryOfACEO/streams',
	'https://www.youtube.com/@TheDiaryOfACEOClips/videos'
];
const TOLERANCE_S = 240; // podcast vs video edit differences
const CACHE = 'data/youtube-channel.json';

const tokens = (s) =>
	new Set(
		s
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((t) => t.length > 2)
	);

function similarity(a, b) {
	const A = tokens(a);
	const B = tokens(b);
	let inter = 0;
	for (const t of A) if (B.has(t)) inter++;
	return inter / Math.min(A.size, B.size) || 0; // containment: YT titles are supersets/rewrites
}

const toSeconds = (ts) => ts.split(':').reduce((t, p) => t * 60 + Number(p), 0);

// 1. Channel video list (cached — delete data/youtube-channel.json to refresh)
let videos;
try {
	videos = JSON.parse(await readFile(CACHE, 'utf8'));
	console.log(`channel cache: ${videos.length} videos`);
} catch {
	videos = [];
	for (const url of CHANNELS) {
		try {
			const { stdout } = await run(
				'yt-dlp',
				['--flat-playlist', '--print', '%(id)s\t%(duration)d\t%(title)s', url],
				{ timeout: 300_000, maxBuffer: 64 * 1024 * 1024 }
			);
			const list = stdout
				.trim()
				.split('\n')
				.filter(Boolean)
				.map((l) => {
					const [id, duration, ...title] = l.split('\t');
					return { id, duration: Number(duration), title: title.join('\t') };
				})
				.filter((v) => v.duration > 0);
			console.log(`${url} -> ${list.length} videos`);
			videos.push(...list);
		} catch (e) {
			console.log(`channel list failed for ${url}: ${String(e).slice(0, 120)}`);
		}
	}
	await writeFile(CACHE, JSON.stringify(videos));
}

// 2. Match each episode by duration, tiebreak on title similarity
const files = (await readdir('data/transcripts')).filter((f) => f.endsWith('.json'));
const map = {};
let ok = 0;
for (const f of files) {
	const ep = JSON.parse(await readFile(`data/transcripts/${f}`, 'utf8'));
	const title = ep.title.replace(/^Transcript of /, '');
	const last = ep.paragraphs.at(-1);
	const episodeSeconds = last ? toSeconds(last.t) : 0;
	const candidates = videos
		.filter((v) => Math.abs(v.duration - episodeSeconds) <= TOLERANCE_S)
		.map((v) => ({ ...v, sim: similarity(title, v.title), dd: Math.abs(v.duration - episodeSeconds) }))
		.sort((a, b) => b.sim - a.sim || a.dd - b.dd);
	const best = candidates[0];
	// Accept a lone duration match outright; with rivals, demand some title overlap.
	const accepted = best && (candidates.length === 1 || best.sim >= 0.3);
	map[ep.id] = accepted
		? { videoId: best.id, ytTitle: best.title, sim: +best.sim.toFixed(2), durationDiff: best.dd }
		: null;
	if (accepted) ok++;
	else
		console.log(
			`MISS ${ep.id.slice(0, 55)} (${episodeSeconds}s, ${candidates.length} cand${best ? `, best sim ${best.sim.toFixed(2)}: ${best.title.slice(0, 60)}` : ''})`
		);
}

// 3. Search fallback for the misses: title search, but the DURATION decides.
//    A ±tolerance duration match on an official channel is a fingerprint —
//    title similarity no longer needs to carry the decision.
const OFFICIAL = /^the diary of a ceo( clips)?$/i;
const misses = Object.entries(map).filter(([, v]) => v === null);
console.log(`search fallback for ${misses.length} misses…`);
for (const [id] of misses) {
	const ep = JSON.parse(await readFile(`data/transcripts/${id}.json`, 'utf8'));
	const title = ep.title.replace(/^Transcript of /, '');
	const episodeSeconds = toSeconds(ep.paragraphs.at(-1)?.t ?? '0:00');
	try {
		const { stdout } = await run(
			'yt-dlp',
			[
				`ytsearch8:${title}`,
				'--print',
				'%(id)s\t%(duration)d\t%(channel)s\t%(title)s',
				'--skip-download',
				'--no-warnings'
			],
			{ timeout: 120_000 }
		);
		const hits = stdout
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((l) => {
				const [vid, duration, channel, ...t] = l.split('\t');
				return { id: vid, duration: Number(duration), channel, title: t.join('\t') };
			})
			.filter(
				(v) => OFFICIAL.test(v.channel ?? '') && Math.abs(v.duration - episodeSeconds) <= TOLERANCE_S
			)
			.map((v) => ({ ...v, sim: similarity(title, v.title), dd: Math.abs(v.duration - episodeSeconds) }))
			.sort((a, b) => b.sim - a.sim || a.dd - b.dd);
		const best = hits[0];
		if (best) {
			map[id] = { videoId: best.id, ytTitle: best.title, sim: +best.sim.toFixed(2), durationDiff: best.dd, via: 'search' };
			ok++;
			console.log(`OK   ${id.slice(0, 55)} -> ${best.id} (${best.title.slice(0, 60)})`);
		} else {
			console.log(`MISS ${id.slice(0, 55)} (search found no official duration match)`);
		}
	} catch (e) {
		console.log(`ERR  ${id.slice(0, 55)}: ${String(e).slice(0, 100)}`);
	}
}

await writeFile('data/youtube-map.json', JSON.stringify(map, null, 1));
await writeFile(
	'static/rag/youtube.json',
	JSON.stringify(
		Object.fromEntries(
			Object.entries(map)
				.filter(([, v]) => v?.videoId)
				.map(([k, v]) => [k, v.videoId])
		)
	)
);
console.log(`DONE: ${ok}/${files.length} mapped`);
