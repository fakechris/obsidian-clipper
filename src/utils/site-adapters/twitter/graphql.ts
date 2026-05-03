// Same-origin GraphQL helpers for x.com / twitter.com.
// Runs in the content-script context, which shares cookies with the page.

const BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const TWEET_DETAIL_FEATURES: Record<string, boolean> = {
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

let queryIdCache: Record<string, string> | null = null;

function readCookie(name: string): string | null {
	const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
	return m ? decodeURIComponent(m[1]) : null;
}

export async function discoverQueryIds(): Promise<Record<string, string>> {
	if (queryIdCache) return queryIdCache;

	const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
	const mainBundles = scripts.map(s => s.src).filter(u => /\/main\.[a-f0-9]+\.js(\?|$)/.test(u));
	const ops: Record<string, string> = {};

	await Promise.all(mainBundles.map(async (url) => {
		try {
			const txt = await fetch(url, { credentials: 'omit' }).then(r => r.text());
			const re = /queryId:"([^"]+)"[^{}]{0,40}operationName:"([^"]+)"/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(txt)) !== null) {
				if (!ops[m[2]]) ops[m[2]] = m[1];
			}
		} catch {
			// Bundle fetch can fail on slow networks — fall through; caller decides what to do.
		}
	}));

	queryIdCache = ops;
	return ops;
}

async function graphqlGet(opName: string, qid: string, variables: object, extras: { features?: object; fieldToggles?: object } = {}): Promise<any> {
	const csrf = readCookie('ct0');
	if (!csrf) throw new Error('no ct0 cookie — not logged in');

	const params: string[] = [`variables=${encodeURIComponent(JSON.stringify(variables))}`];
	if (extras.features !== undefined) params.push(`features=${encodeURIComponent(JSON.stringify(extras.features))}`);
	if (extras.fieldToggles !== undefined) params.push(`fieldToggles=${encodeURIComponent(JSON.stringify(extras.fieldToggles))}`);
	const url = `/i/api/graphql/${qid}/${opName}?${params.join('&')}`;

	const r = await fetch(url, {
		credentials: 'include',
		headers: {
			'authorization': `Bearer ${BEARER}`,
			'x-csrf-token': csrf,
			'x-twitter-active-user': 'yes',
			'x-twitter-auth-type': 'OAuth2Session',
			'x-twitter-client-language': 'en',
			'content-type': 'application/json',
		},
	});
	if (!r.ok) throw new Error(`${opName} returned ${r.status}`);
	return r.json();
}

export async function fetchTweetDetail(tweetId: string, qid: string): Promise<any> {
	const variables = {
		focalTweetId: tweetId,
		referrer: 'tweet',
		with_rux_injections: false,
		includePromotedContent: false,
		withCommunity: true,
		withQuickPromoteEligibilityTweetFields: true,
		withBirdwatchNotes: true,
		withVoice: true,
		withV2Timeline: true,
	};
	return graphqlGet('TweetDetail', qid, variables, { features: TWEET_DETAIL_FEATURES });
}

export async function fetchFollowersYouKnow(userId: string, qid: string, count = 50): Promise<any> {
	return graphqlGet('FollowersYouKnow', qid, {
		userId,
		count,
		includePromotedContent: false,
	}, { features: {} });
}
