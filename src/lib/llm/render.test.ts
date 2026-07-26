import { describe, expect, test } from 'vitest';
import { renderAnswer } from './render';

describe('renderAnswer', () => {
	test('escapes HTML from the model', () => {
		expect(renderAnswer('<script>alert(1)</script>')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
		);
	});

	test('turns [n] citations into styled sup marks', () => {
		expect(renderAnswer('Volume wins [1]. Identity too [12].')).toBe(
			'<p>Volume wins <sup class="cite">1</sup>. Identity too <sup class="cite">12</sup>.</p>'
		);
	});

	test('styles grouped citations like [6, 7] too', () => {
		expect(renderAnswer('Lift heavy [6, 7].')).toBe(
			'<p>Lift heavy <sup class="cite">6, 7</sup>.</p>'
		);
	});

	test('splits double newlines into paragraphs', () => {
		expect(renderAnswer('First idea.\n\nSecond idea.')).toBe(
			'<p>First idea.</p><p>Second idea.</p>'
		);
	});

	test('renders **bold** emphasis from the model', () => {
		expect(renderAnswer('This **really** matters.')).toBe(
			'<p>This <strong>really</strong> matters.</p>'
		);
	});
});
