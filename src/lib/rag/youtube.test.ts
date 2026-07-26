import { describe, expect, test } from 'vitest';
import { timestampToSeconds, youtubeUrl } from './youtube';

describe('timestampToSeconds', () => {
	test('parses HH:MM:SS', () => {
		expect(timestampToSeconds('00:33:06')).toBe(1986);
		expect(timestampToSeconds('01:15:08')).toBe(4508);
	});

	test('parses MM:SS', () => {
		expect(timestampToSeconds('07:02')).toBe(422);
	});

	test('returns 0 for garbage', () => {
		expect(timestampToSeconds('')).toBe(0);
		expect(timestampToSeconds('n/a')).toBe(0);
	});
});

describe('youtubeUrl', () => {
	test('builds a watch URL with the timestamp', () => {
		expect(youtubeUrl('jSqCL7Npln0', '00:33:06')).toBe(
			'https://www.youtube.com/watch?v=jSqCL7Npln0&t=1986s'
		);
	});

	test('omits t=0 so the video starts normally', () => {
		expect(youtubeUrl('jSqCL7Npln0', '00:00:00')).toBe(
			'https://www.youtube.com/watch?v=jSqCL7Npln0'
		);
	});
});
