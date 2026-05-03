import { SiteAdapter } from './types';
import { twitterAdapter } from './twitter';

const adapters: SiteAdapter[] = [twitterAdapter];

export async function runSiteAdapters(url: string, doc: Document): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	for (const adapter of adapters) {
		if (!adapter.match(url)) continue;
		try {
			const result = await adapter.extract(doc, url);
			Object.assign(out, result);
		} catch (err) {
			console.warn(`[site-adapter:${adapter.name}] extract failed:`, err);
		}
	}
	return out;
}
