export interface GemmaModel {
	id: string;
	label: string;
	/** short marketing-ish descriptor shown in preferences */
	blurb: string;
	url: string;
	sizeBytes: number;
}

export const GEMMA_MODELS: GemmaModel[] = [
	{
		id: 'gemma-4-E2B',
		label: 'Gemma 4 E2B',
		blurb: 'Fast and light — great default (2.0 GB)',
		url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
		sizeBytes: 2_008_000_000
	},
	{
		id: 'gemma-4-E4B',
		label: 'Gemma 4 E4B',
		blurb: 'Smarter answers, bigger download (3.0 GB)',
		url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm',
		sizeBytes: 2_969_000_000
	}
];

export const DEFAULT_MODEL_ID = 'gemma-4-E2B';
const PREF_KEY = 'ask-doac:model';

export function getModel(id: string | null | undefined): GemmaModel {
	return GEMMA_MODELS.find((m) => m.id === id) ?? GEMMA_MODELS[0];
}

export function getPreferredModel(): GemmaModel {
	if (typeof localStorage === 'undefined') return getModel(DEFAULT_MODEL_ID);
	return getModel(localStorage.getItem(PREF_KEY));
}

export function setPreferredModel(id: string) {
	localStorage.setItem(PREF_KEY, getModel(id).id);
}
