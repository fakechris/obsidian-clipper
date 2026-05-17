// Pure function: signals → 0-100 author weight, plus a transparent breakdown.
// Adjust freely without touching extraction code.

export interface WeightSignals {
	followers: number;
	following: number;
	listedCount: number;
	statusesCount: number;
	mediaCount: number;
	accountAgeYears: number;
	mutualsCount: number;
	mutualsTopFollowers: number[];   // followers_count of returned mutuals
	mutualsBlueRatio: number;        // 0-1
	iFollow: boolean;
	followsMe: boolean;
	isBlueVerified: boolean;
	hasCompanyLabel: boolean;
	defaultProfile: boolean;
}

export interface WeightBreakdown {
	followers: number;
	listed: number;
	mutuals: number;
	relationship: number;
	age: number;
	ratio: number;
	signals: number;
	total: number;
}

function clamp(n: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, n));
}

function followersTier(followers: number): number {
	// log10 buckets, asymptote at 25
	if (followers <= 0) return 0;
	const log = Math.log10(followers);
	// 1 → 0, 2 → 5, 3 → 10, 4 → 17, 5 → 22, 6+ → 25
	if (log < 1) return 0;
	if (log < 2) return 5;
	if (log < 3) return 10;
	if (log < 4) return 17;
	if (log < 5) return 22;
	return 25;
}

function listedTier(listed: number): number {
	// listed_count is the underrated trust signal — being curated by others.
	if (listed <= 0) return 0;
	if (listed < 10) return 3;
	if (listed < 50) return 7;
	if (listed < 200) return 11;
	if (listed < 1000) return 14;
	return 15;
}

function mutualsTier(mutualsCount: number, topMutualsFollowers: number[]): number {
	// Base score from raw count + bonus from total reach of your mutuals.
	let base = 0;
	if (mutualsCount >= 30) base = 18;
	else if (mutualsCount >= 10) base = 14;
	else if (mutualsCount >= 3) base = 9;
	else if (mutualsCount >= 1) base = 5;

	const reach = topMutualsFollowers.reduce((s, n) => s + Math.log10(Math.max(1, n)), 0);
	// Each mutual contributes its log10(followers) to a small bonus, capped at 7.
	const bonus = clamp(reach * 0.7, 0, 7);
	return clamp(base + bonus, 0, 25);
}

function relationshipScore(iFollow: boolean, followsMe: boolean): number {
	let s = 0;
	if (iFollow) s += 5;
	if (followsMe) s += 10;
	return s;
}

function ageTier(years: number): number {
	if (years < 1) return 0;
	if (years < 2) return 3;
	if (years < 5) return 6;
	if (years < 10) return 9;
	return 10;
}

function ratioScore(followers: number, following: number): number {
	// Followers / following. Real-influence accounts skew high; bots skew opposite.
	if (followers === 0) return 0;
	const ratio = followers / Math.max(following, 1);
	if (ratio >= 10) return 10;
	if (ratio >= 3) return 7;
	if (ratio >= 1) return 4;
	if (ratio >= 0.3) return 2;
	return 0;
}

function signalsScore(s: WeightSignals): number {
	let v = 0;
	if (s.hasCompanyLabel) v += 3;     // affiliated org badge — paid but vetted
	if (s.isBlueVerified) v += 1;      // checkmark — purely paid since 2022
	if (s.defaultProfile) v -= 3;      // never bothered to set up — red flag
	return clamp(v, 0, 5);
}

export function computeAuthorWeight(s: WeightSignals): WeightBreakdown {
	const followers = followersTier(s.followers);
	const listed = listedTier(s.listedCount);
	const mutuals = mutualsTier(s.mutualsCount, s.mutualsTopFollowers);
	const relationship = relationshipScore(s.iFollow, s.followsMe);
	const age = ageTier(s.accountAgeYears);
	const ratio = ratioScore(s.followers, s.following);
	const signals = signalsScore(s);
	const total = clamp(
		Math.round(followers + listed + mutuals + relationship + age + ratio + signals),
		0, 100,
	);
	return { followers, listed, mutuals, relationship, age, ratio, signals, total };
}
