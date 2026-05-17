// Content scripts run in an isolated world that does not see the page's
// performance entries or active <script src> nodes (X removes them after
// boot). The actual GraphQL fetches must therefore happen in the page's
// MAIN world. We delegate to the service worker, which uses
// chrome.scripting.executeScript({world:'MAIN'}) to inject and run
// `twitterPageWorldRunner` in the tab.

import browser from '../../browser-polyfill';
import type { PageWorldResult } from './page-world-runner';

interface FetchResponse { ok: boolean; result?: PageWorldResult; error?: string }

export async function fetchTwitterDataInPageWorld(tweetId: string): Promise<PageWorldResult> {
	const resp = await browser.runtime.sendMessage({
		action: 'twitter:fetchInPageWorld',
		args: { tweetId },
	}) as FetchResponse;
	if (!resp?.ok) {
		throw new Error(resp?.error || 'page-world fetch failed');
	}
	if (!resp.result) {
		throw new Error('page-world fetch returned no result');
	}
	return resp.result;
}
