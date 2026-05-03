import { SiteAdapter } from './types';
import { twitterAdapter } from './twitter';

const adapters: SiteAdapter[] = [twitterAdapter];

export async function runSiteAdapters(url: string, doc: Document): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	console.log('[site-adapters] runSiteAdapters called for', url);
	for (const adapter of adapters) {
		const matched = adapter.match(url);
		console.log(`[site-adapters] ${adapter.name}.match(${url}) = ${matched}`);
		if (!matched) continue;
		try {
			const result = await adapter.extract(doc, url);
			console.log(`[site-adapters] ${adapter.name} produced ${Object.keys(result).length} fields`);
			Object.assign(out, result);
		} catch (err) {
			console.warn(`[site-adapter:${adapter.name}] extract threw:`, err);
			out[`${adapter.name}:_status`] = 'threw';
			out[`${adapter.name}:_error`] = String((err as Error).message || err);
		}
	}
	return out;
}
