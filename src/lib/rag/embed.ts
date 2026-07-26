// Browser-side query embedding with the same model used at index build time.
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { isMobileDevice } from '$lib/llm/models';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedder() {
	// q8 on phones: the chat model already occupies most of the page's memory
	// budget, and fp32 MiniLM (~90 MB weights + ONNX arena) can be the straw
	// that gets the page killed. Quantized query embeddings rank against the
	// fp32-built index almost identically.
	embedderPromise ??= pipeline('feature-extraction', MODEL, {
		dtype: isMobileDevice() ? 'q8' : 'fp32'
	});
	return embedderPromise;
}

export async function embedQuery(text: string): Promise<Float32Array> {
	const embedder = await getEmbedder();
	const out = await embedder(text, { pooling: 'mean', normalize: true });
	return out.data as Float32Array;
}
