import { describe, test, expect } from 'vitest';
import { computeAuthorWeight, WeightSignals } from './weight';

function defaults(overrides: Partial<WeightSignals> = {}): WeightSignals {
	return {
		followers: 0,
		following: 0,
		listedCount: 0,
		statusesCount: 0,
		mediaCount: 0,
		accountAgeYears: 0,
		mutualsCount: 0,
		mutualsTopFollowers: [],
		mutualsBlueRatio: 0,
		iFollow: false,
		followsMe: false,
		isBlueVerified: false,
		hasCompanyLabel: false,
		defaultProfile: false,
		...overrides,
	};
}

describe('computeAuthorWeight', () => {
	test('zero signals → zero score', () => {
		const r = computeAuthorWeight(defaults());
		expect(r.total).toBe(0);
	});

	test('total stays within 0-100', () => {
		const max = computeAuthorWeight(defaults({
			followers: 1_000_000,
			following: 100,
			listedCount: 5000,
			accountAgeYears: 15,
			mutualsCount: 100,
			mutualsTopFollowers: Array(10).fill(100_000),
			iFollow: true,
			followsMe: true,
			isBlueVerified: true,
			hasCompanyLabel: true,
		}));
		expect(max.total).toBeLessThanOrEqual(100);
		expect(max.total).toBeGreaterThan(80);
	});

	test('mutual follow weighs more than just I follow', () => {
		const oneWay = computeAuthorWeight(defaults({ iFollow: true }));
		const both = computeAuthorWeight(defaults({ iFollow: true, followsMe: true }));
		expect(both.total).toBeGreaterThan(oneWay.total);
	});

	test('listed_count matters even with low follower count', () => {
		const noListed = computeAuthorWeight(defaults({ followers: 500 }));
		const wellListed = computeAuthorWeight(defaults({ followers: 500, listedCount: 200 }));
		expect(wellListed.total).toBeGreaterThan(noListed.total + 10);
	});

	test('default_profile penalises slightly', () => {
		const normal = computeAuthorWeight(defaults({ followers: 1000, hasCompanyLabel: true }));
		const lazy = computeAuthorWeight(defaults({ followers: 1000, hasCompanyLabel: true, defaultProfile: true }));
		expect(lazy.total).toBeLessThanOrEqual(normal.total);
	});

	test('breakdown sums to total within rounding', () => {
		const r = computeAuthorWeight(defaults({
			followers: 5000,
			following: 500,
			listedCount: 30,
			accountAgeYears: 4,
			mutualsCount: 8,
			mutualsTopFollowers: [10000, 5000],
			iFollow: true,
		}));
		const sum = r.followers + r.listed + r.mutuals + r.relationship + r.age + r.ratio + r.signals;
		expect(Math.abs(r.total - sum)).toBeLessThanOrEqual(1);
	});

	test('Ashwin-like profile lands in respectable band', () => {
		// Rough approximation of the user we probed.
		const r = computeAuthorWeight(defaults({
			followers: 3119,
			following: 795,
			listedCount: 35,
			accountAgeYears: 10,
			mutualsCount: 8,
			mutualsTopFollowers: [43807, 7966, 339590, 251151, 73903, 2711279],
			iFollow: true,
			followsMe: false,
			isBlueVerified: true,
			hasCompanyLabel: true,
		}));
		expect(r.total).toBeGreaterThanOrEqual(50);
		expect(r.total).toBeLessThanOrEqual(85);
	});
});
