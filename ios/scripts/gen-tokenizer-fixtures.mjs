// Ground-truth fixtures for the Swift WordPiece tokenizer and the Core ML
// embedder: token ids + q8 query embeddings from the exact transformers.js
// stack the web app ships. Run from the repo root:
//   node ios/scripts/gen-tokenizer-fixtures.mjs
import { env, AutoTokenizer, pipeline } from '@huggingface/transformers';
import { writeFileSync, mkdirSync } from 'node:fs';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = 'static/embedder/';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

const cases = [
	'what did the sleep expert say about caffeine?',
	'How do I build wealth in my 20s?',
	"Steven Bartlett's advice on hiring — what matters most?",
	'Comment gérer le stress au travail ?',
	'training in your 60s',
	'dopamine',
	'GLP-1 drugs like Ozempic: safe long-term?',
	'était-ce vraiment une bonne idée???',
	'antidisestablishmentarianism supercalifragilistic',
	'  spaced    out   input  ',
	'ALL CAPS QUESTION ABOUT MONEY',
	'mix of 中文 characters and English',
	'emoji test 🚀 does it survive?',
	'a'.repeat(120),
	'12345 67.89 $100 3:2',
];

const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const tokens = {};
for (const text of cases) {
	const enc = tokenizer(text);
	tokens[text] = Array.from(enc.input_ids.data, Number);
}
mkdirSync('ios/AskDiaryKit/Tests/AskDiaryKitTests/Fixtures', { recursive: true });
writeFileSync(
	'ios/AskDiaryKit/Tests/AskDiaryKitTests/Fixtures/tokens.json',
	JSON.stringify(tokens, null, 1)
);

// q8 embeddings — the same call path as src/lib/rag/embed.ts embedQuery()
const embedder = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const embeddings = {};
for (const text of cases.slice(0, 8)) {
	const out = await embedder(text, { pooling: 'mean', normalize: true });
	embeddings[text] = Array.from(out.data, (x) => Number(x.toFixed(6)));
}
writeFileSync(
	'ios/AskDiaryKit/Tests/AskDiaryKitTests/Fixtures/embeddings.json',
	JSON.stringify(embeddings)
);
console.log('wrote', Object.keys(tokens).length, 'token cases,', Object.keys(embeddings).length, 'embedding cases');
