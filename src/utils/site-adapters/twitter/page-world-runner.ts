// This function is injected into the tweet page's MAIN world via
// chrome.scripting.executeScript. It MUST be self-contained — no module
// imports, no closures over outer scope. Only browser globals are available.
// Args come in as the first parameter; result is returned and serialized
// back across the world boundary.

export interface PageWorldArgs {
	tweetId: string;
}

export interface PageWorldResult {
	td?: any;
	fyk?: any;
	ops?: Record<string, string>;
	trace: string[];
	error?: string;
}

export function twitterPageWorldRunner(input: PageWorldArgs): Promise<PageWorldResult> {
	return (async () => {
		const trace: string[] = [];
		const log = (m: string) => { trace.push(m); try { console.log('[twitter-page-world]', m); } catch {} };
		log(`runner started, tweetId=${input.tweetId}`);

		const scriptUrls = (Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]).map(s => s.src);
		const perfUrls = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
			.map(e => e.name)
			.filter(u => /\.js(\?|$)/.test(u));
		const linkUrls = (Array.from(document.querySelectorAll('link[rel="modulepreload"], link[rel="preload"][as="script"]')) as HTMLLinkElement[])
			.map(l => l.href);

		// SPAs (X especially) routinely call performance.clearResourceTimings() and
		// remove <script src> nodes after boot. Falling back to an HTML re-fetch of
		// the current URL is the only reliable way to get the bundle paths back —
		// X serves them in the SSR'd HTML.
		let htmlUrls: string[] = [];
		if (scriptUrls.length === 0 && perfUrls.length === 0 && linkUrls.length === 0) {
			try {
				const r = await fetch(location.href, { credentials: 'include' });
				if (r.ok) {
					const html = await r.text();
					const set = new Set<string>();
					const re = /(?:src|href)=["']([^"']+\.js[^"']*)["']/g;
					let mm: RegExpExecArray | null;
					while ((mm = re.exec(html)) !== null) set.add(mm[1]);
					htmlUrls = [...set];
					log(`HTML re-fetch found ${htmlUrls.length} JS URLs`);
				}
			} catch (e) {
				log(`HTML re-fetch failed: ${(e as Error).message}`);
			}
		}

		const allUrls = Array.from(new Set([...scriptUrls, ...perfUrls, ...linkUrls, ...htmlUrls]));
		log(`script[src]=${scriptUrls.length} perf-js=${perfUrls.length} link=${linkUrls.length} html=${htmlUrls.length} unique=${allUrls.length}`);

		const candidates = allUrls.filter(u => /(twimg\.com|x\.com).*\.js/.test(u));
		log(`bundle candidates=${candidates.length}`);

		const ops: Record<string, string> = {};
		await Promise.all(candidates.map(async (url) => {
			try {
				const r = await fetch(url, { credentials: 'omit' });
				if (!r.ok) return;
				const txt = await r.text();
				const re = /queryId:"([^"]+)"[^{}]{0,40}operationName:"([^"]+)"/g;
				let m: RegExpExecArray | null;
				while ((m = re.exec(txt)) !== null) {
					if (!ops[m[2]]) ops[m[2]] = m[1];
				}
			} catch {}
		}));
		log(`discovered ${Object.keys(ops).length} ops`);

		const tdQid = ops['TweetDetail'];
		const fykQid = ops['FollowersYouKnow'];
		if (!tdQid) return { ops, trace, error: 'no_TweetDetail_qid' };

		const csrfMatch = document.cookie.match(/(?:^|; )ct0=([^;]+)/);
		if (!csrfMatch) return { ops, trace, error: 'no_ct0_cookie' };
		const csrf = decodeURIComponent(csrfMatch[1]);

		const bearer = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
		const headers: Record<string, string> = {
			'authorization': `Bearer ${bearer}`,
			'x-csrf-token': csrf,
			'x-twitter-active-user': 'yes',
			'x-twitter-auth-type': 'OAuth2Session',
			'x-twitter-client-language': 'en',
			'content-type': 'application/json',
		};

		const tdFeatures = {
			rweb_video_screen_enabled: false,
			profile_label_improvements_pcf_label_in_post_enabled: true,
			rweb_tipjar_consumption_enabled: true,
			verified_phone_label_enabled: false,
			creator_subscriptions_tweet_preview_api_enabled: true,
			responsive_web_graphql_timeline_navigation_enabled: true,
			responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
			premium_content_api_read_enabled: false,
			communities_web_enable_tweet_community_results_fetch: true,
			c9s_tweet_anatomy_moderator_badge_enabled: true,
			responsive_web_grok_analyze_button_fetch_trends_enabled: false,
			responsive_web_grok_analyze_post_followups_enabled: true,
			responsive_web_jetfuel_frame: false,
			responsive_web_grok_share_attachment_enabled: true,
			articles_preview_enabled: true,
			responsive_web_edit_tweet_api_enabled: true,
			graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
			view_counts_everywhere_api_enabled: true,
			longform_notetweets_consumption_enabled: true,
			responsive_web_twitter_article_tweet_consumption_enabled: true,
			tweet_awards_web_tipping_enabled: false,
			creator_subscriptions_quote_tweet_preview_enabled: false,
			freedom_of_speech_not_reach_fetch_enabled: true,
			standardized_nudges_misinfo: true,
			tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
			rweb_video_timestamps_enabled: true,
			longform_notetweets_rich_text_read_enabled: true,
			longform_notetweets_inline_media_enabled: true,
			responsive_web_enhance_cards_enabled: false,
			responsive_web_graphql_exclude_directive_enabled: true,
		};
		const tdVars = {
			focalTweetId: input.tweetId,
			referrer: 'tweet',
			with_rux_injections: false,
			includePromotedContent: false,
			withCommunity: true,
			withQuickPromoteEligibilityTweetFields: true,
			withBirdwatchNotes: true,
			withVoice: true,
			withV2Timeline: true,
		};
		const tdUrl = `/i/api/graphql/${tdQid}/TweetDetail?variables=${encodeURIComponent(JSON.stringify(tdVars))}&features=${encodeURIComponent(JSON.stringify(tdFeatures))}`;

		let td: any;
		try {
			const r = await fetch(tdUrl, { credentials: 'include', headers });
			if (!r.ok) return { ops, trace, error: `TweetDetail_${r.status}` };
			td = await r.json();
			log('TweetDetail ok');
		} catch (e) {
			return { ops, trace, error: `TweetDetail_threw_${(e as Error).message}` };
		}

		// Find userId from TweetDetail and call FollowersYouKnow
		let fyk: any = null;
		if (fykQid) {
			let userId: string | null = null;
			try {
				const insts = td?.data?.threaded_conversation_with_injections_v2?.instructions || [];
				outer: for (const ins of insts) {
					if (ins.type !== 'TimelineAddEntries') continue;
					for (const entry of (ins.entries || [])) {
						const item = entry?.content?.itemContent;
						if (item?.itemType === 'TimelineTweet') {
							const result = item.tweet_results?.result;
							const tweet = result?.tweet || result;
							userId = tweet?.core?.user_results?.result?.rest_id || null;
							break outer;
						}
					}
				}
			} catch {}
			if (userId) {
				try {
					const fykVars = { userId, count: 50, includePromotedContent: false };
					const fykUrl = `/i/api/graphql/${fykQid}/FollowersYouKnow?variables=${encodeURIComponent(JSON.stringify(fykVars))}&features=${encodeURIComponent(JSON.stringify({}))}`;
					const r = await fetch(fykUrl, { credentials: 'include', headers });
					if (r.ok) { fyk = await r.json(); log('FYK ok'); } else log(`FYK ${r.status}`);
				} catch (e) {
					log(`FYK threw: ${(e as Error).message}`);
				}
			} else {
				log('no userId found in TweetDetail');
			}
		}

		return { td, fyk, ops, trace };
	})();
}
