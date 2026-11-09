// @vitest-environment jsdom
// Compatibility check for the Twitter template after upstream moved the
// template engine to Knap (upstream/main "Move templating to Knap (#951)").
//
// The site adapters inject flat keys like "twitter:author_handle" into the
// variable bag. This test proves that the Knap engine still resolves those
// namespaced variables and the filters the Twitter template relies on.
import { describe, test, expect } from 'vitest';
import { compileTemplate } from '../../template-compiler';
import { createTwitterTemplate } from '../../../managers/template-manager';

function makeVariables(overrides: Record<string, string> = {}): Record<string, any> {
	const base: Record<string, any> = {
		'{{title}}': 'Hello world',
		'{{url}}': 'https://x.com/jack/status/20',
		'{{description}}': 'a description',
		'{{author}}': 'Jack',
		'{{date}}': '2026-11-08',
		'{{content}}': '# body',
	};
	for (const [k, v] of Object.entries(overrides)) {
		base[k] = v;
	}
	return base;
}

describe('Twitter template under the Knap engine', () => {
	test('resolves namespaced twitter: variables', async () => {
		const variables = makeVariables({
			'{{twitter:author_handle}}': 'jack',
			'{{twitter:author_name}}': 'Jack',
			'{{twitter:tweet_url}}': 'https://x.com/jack/status/20',
			'{{twitter:author_weight}}': '42.5',
		});

		const fn = compileTemplate(0, '{{twitter:author_handle}}', variables, 'https://x.com/');
		expect(await fn).toBe('jack');

		const fn2 = compileTemplate(0, '{{twitter:author_weight}}', variables, 'https://x.com/');
		expect(await fn2).toBe('42.5');
	});

	test('resolves the note name format of the shipped Twitter template', async () => {
		const template = createTwitterTemplate();
		const variables = makeVariables({
			'{{twitter:author_handle}}': 'jack',
			'{{twitter:tweet_url}}': 'https://x.com/jack/status/20',
			'{{twitter:author_name}}': 'Jack',
			'{{twitter:author_bio}}': 'bio text',
			'{{twitter:author_company}}': 'Acme',
			'{{twitter:author_weight}}': '42.5',
			'{{twitter:followers}}': '1000',
			'{{twitter:following}}': '10',
			'{{twitter:listed}}': '2',
			'{{twitter:mutuals_count}}': '5',
			'{{twitter:mutuals_top}}': 'a, b',
			'{{twitter:i_follow}}': 'true',
			'{{twitter:follows_me}}': 'false',
			'{{twitter:author_blue_verified}}': 'true',
			'{{twitter:tweet_likes}}': '7',
			'{{twitter:tweet_retweets}}': '1',
			'{{twitter:tweet_bookmarks}}': '3',
			'{{twitter:tweet_views}}': '99',
			'{{twitter:tweet_created_at}}': '2026-01-01',
		});

		const fn = compileTemplate(0, template.noteNameFormat, variables, 'https://x.com/');
		expect(await fn).toBe('jack - Hello world');
	});

	test('renders every Twitter property without error', async () => {
		const template = createTwitterTemplate();
		const variables = makeVariables({
			'{{twitter:author_handle}}': 'jack',
			'{{twitter:tweet_url}}': 'https://x.com/jack/status/20',
			'{{twitter:author_name}}': 'Jack',
			'{{twitter:author_bio}}': 'bio text',
			'{{twitter:author_company}}': 'Acme',
			'{{twitter:author_weight}}': '42.5',
			'{{twitter:followers}}': '1000',
			'{{twitter:following}}': '10',
			'{{twitter:listed}}': '2',
			'{{twitter:mutuals_count}}': '5',
			'{{twitter:mutuals_top}}': 'a, b',
			'{{twitter:i_follow}}': 'true',
			'{{twitter:follows_me}}': 'false',
			'{{twitter:author_blue_verified}}': 'true',
			'{{twitter:tweet_likes}}': '7',
			'{{twitter:tweet_retweets}}': '1',
			'{{twitter:tweet_bookmarks}}': '3',
			'{{twitter:tweet_views}}': '99',
			'{{twitter:tweet_created_at}}': '2026-01-01',
		});

		for (const prop of template.properties) {
			const fn = compileTemplate(0, prop.value, variables, 'https://x.com/');
			const out = await fn;
			expect(typeof out).toBe('string');
			expect(out).not.toContain('{{');
		}
	});

	test('the default template author filter still works under Knap', async () => {
		const variables = makeVariables({ '{{author}}': 'Jack' });
		const fn = compileTemplate(0, '{{author|split:", "|wikilink|join}}', variables, 'https://x.com/');
		const out = await fn;
		expect(out).toContain('Jack');
	});
});
