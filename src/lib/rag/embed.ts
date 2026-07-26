// Browser-side query embedding with the same model used at index build time.
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedder() {
	embedderPromise ??= pipeline('feature-extraction', MODEL, { dtype: 'fp32' });
	return embedderPromise;
}

export async function embedQuery(text: string): Promise<Float32Array> {
	const embedder = await getEmbedder();
	const out = await embedder(text, { pooling: 'mean', normalize: true });
	return out.data as Float32Array;
}
