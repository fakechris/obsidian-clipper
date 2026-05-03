export interface SiteAdapter {
	name: string;
	match(url: string): boolean;
	extract(doc: Document, url: string): Promise<Record<string, string>>;
}
