import { SiteAdapter } from '../types';
import { discoverQueryIds, fetchTweetDetail, fetchFollowersYouKnow } from './graphql';
import { computeAuthorWeight, WeightSignals } from './weight';

const STATUS_PATH_RE = /^\/[A-Za-z0-9_]+\/status\/(\d+)/;

function s(v: unknown): string {
	if (v === undefined || v === null) return '';
	return String(v);
}

function findFocalTweet(td: any): any | null {
	const insts = td?.data?.threaded_conversation_with_injections_v2?.instructions || [];
	for (const ins of insts) {
		if (ins.type !== 'TimelineAddEntries') continue;
		for (const entry of (ins.entries || [])) {
			const item = entry?.content?.itemContent;
			if (item?.itemType === 'TimelineTweet') {
				const result = item.tweet_results?.result;
				return result?.tweet || result;
			}
		}
	}
	return null;
}

function yearsSince(twitterDate: string): number {
	if (!twitterDate) return 0;
	const t = new Date(twitterDate).getTime();
	if (Number.isNaN(t)) return 0;
	return (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
}

async function extract(_doc: Document, url: string): Promise<Record<string, string>> {
	const u = new URL(url);
	const m = u.pathname.match(STATUS_PATH_RE);
	if (!m) return {};
	const tweetId = m[1];

	const queryIds = await discoverQueryIds();
	const tweetDetailQid = queryIds['TweetDetail'];
	const fykQid = queryIds['FollowersYouKnow'];
	if (!tweetDetailQid) {
		console.warn('[twitter-adapter] could not discover TweetDetail queryId');
		return {};
	}

	const td = await fetchTweetDetail(tweetId, tweetDetailQid);
	const focal = findFocalTweet(td);
	if (!focal) return {};

	const user = focal?.core?.user_results?.result;
	const userLegacy = user?.legacy || {};
	const tweetLegacy = focal?.legacy || {};
	const tweetViews = focal?.views || {};
	const userId = user?.rest_id || tweetLegacy.user_id_str;

	const followers = Number(userLegacy.followers_count || 0);
	const following = Number(userLegacy.friends_count || 0);
	const accountAgeYears = yearsSince(user?.core?.created_at);

	// FollowersYouKnow — best-effort; failure does not block the rest.
	let mutualsCount = 0;
	const mutualHandles: string[] = [];
	const mutualTopFollowers: number[] = [];
	let mutualsBlueCount = 0;
	if (userId && fykQid) {
		try {
			const fyk = await fetchFollowersYouKnow(userId, fykQid, 50);
			const insts = fyk?.data?.user?.result?.timeline?.timeline?.instructions || [];
			for (const ins of insts) {
				for (const entry of (ins.entries || [])) {
					if (!entry.entryId?.startsWith('user-')) continue;
					const mu = entry?.content?.itemContent?.user_results?.result;
					if (!mu) continue;
					mutualsCount++;
					const handle = mu?.core?.screen_name;
					if (handle) mutualHandles.push(handle);
					mutualTopFollowers.push(Number(mu?.legacy?.followers_count || 0));
					if (mu?.is_blue_verified) mutualsBlueCount++;
				}
			}
		} catch (err) {
			console.warn('[twitter-adapter] FollowersYouKnow failed:', err);
		}
	}

	const signals: WeightSignals = {
		followers,
		following,
		listedCount: Number(userLegacy.listed_count || 0),
		statusesCount: Number(userLegacy.statuses_count || 0),
		mediaCount: Number(userLegacy.media_count || 0),
		accountAgeYears,
		mutualsCount,
		mutualsTopFollowers: mutualTopFollowers.slice(0, 10),
		mutualsBlueRatio: mutualsCount > 0 ? mutualsBlueCount / mutualsCount : 0,
		iFollow: !!user?.relationship_perspectives?.following,
		followsMe: !!user?.relationship_perspectives?.followed_by,
		isBlueVerified: !!user?.is_blue_verified,
		hasCompanyLabel: !!user?.affiliates_highlighted_label?.label?.description,
		defaultProfile: !!userLegacy.default_profile,
	};
	const weight = computeAuthorWeight(signals);

	const out: Record<string, string> = {
		'twitter:tweet_id': tweetId,
		'twitter:tweet_url': `https://x.com/${user?.core?.screen_name || ''}/status/${tweetId}`,
		'twitter:tweet_text': s(tweetLegacy.full_text),
		'twitter:tweet_lang': s(tweetLegacy.lang),
		'twitter:tweet_created_at': s(tweetLegacy.created_at),
		'twitter:tweet_likes': s(tweetLegacy.favorite_count),
		'twitter:tweet_retweets': s(tweetLegacy.retweet_count),
		'twitter:tweet_replies': s(tweetLegacy.reply_count),
		'twitter:tweet_quotes': s(tweetLegacy.quote_count),
		'twitter:tweet_bookmarks': s(tweetLegacy.bookmark_count),
		'twitter:tweet_views': s(tweetViews.count),
		'twitter:tweet_is_article': focal?.article ? 'true' : 'false',

		'twitter:author_id': s(user?.rest_id),
		'twitter:author_handle': s(user?.core?.screen_name),
		'twitter:author_name': s(user?.core?.name),
		'twitter:author_bio': s(userLegacy.description),
		'twitter:author_location': s(user?.location?.location),
		'twitter:author_website': s(userLegacy.entities?.url?.urls?.[0]?.expanded_url || userLegacy.url),
		'twitter:author_avatar': s(user?.avatar?.image_url),
		'twitter:author_banner': s(userLegacy.profile_banner_url),
		'twitter:author_created_at': s(user?.core?.created_at),
		'twitter:author_age_years': accountAgeYears.toFixed(1),
		'twitter:author_blue_verified': user?.is_blue_verified ? 'true' : 'false',
		'twitter:author_legacy_verified': user?.verification?.verified ? 'true' : 'false',
		'twitter:author_company': s(user?.affiliates_highlighted_label?.label?.description),

		'twitter:followers': s(followers),
		'twitter:following': s(following),
		'twitter:tweets': s(userLegacy.statuses_count),
		'twitter:listed': s(userLegacy.listed_count),
		'twitter:media_count': s(userLegacy.media_count),

		'twitter:i_follow': signals.iFollow ? 'true' : 'false',
		'twitter:follows_me': signals.followsMe ? 'true' : 'false',

		'twitter:mutuals_count': s(mutualsCount),
		'twitter:mutuals_handles': mutualHandles.join(', '),
		'twitter:mutuals_top': mutualHandles.slice(0, 3).join(', '),
		'twitter:mutuals_blue_ratio': signals.mutualsBlueRatio.toFixed(2),

		'twitter:author_weight': s(weight.total),
		'twitter:author_weight_breakdown': JSON.stringify(weight),
	};

	return out;
}

export const twitterAdapter: SiteAdapter = {
	name: 'twitter',
	match: (url: string) => {
		try {
			const u = new URL(url);
			if (!/^(?:.*\.)?(?:x|twitter)\.com$/.test(u.hostname)) return false;
			return STATUS_PATH_RE.test(u.pathname);
		} catch {
			return false;
		}
	},
	extract,
};
