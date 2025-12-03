import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
// @ts-ignore - extractors.js is a JS file
import { extractBranding } from '$lib/extractors.js';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Create a mock spinner that does nothing (we don't need CLI output)
const mockSpinner = {
	text: '',
	start: (text?: string) => { if (text) mockSpinner.text = text; return mockSpinner; },
	stop: () => mockSpinner,
	succeed: () => mockSpinner,
	fail: () => mockSpinner,
	warn: () => mockSpinner,
	info: () => mockSpinner
};

// Built-in comprehensive tech detection patterns
const TECH_PATTERNS = {
	frameworks: [
		// JavaScript Frameworks
		{ name: 'React', patterns: ['react', '_reactRootContainer', '__REACT_DEVTOOLS_GLOBAL_HOOK__', 'data-reactroot', 'data-reactid'], type: 'framework' },
		{ name: 'Next.js', patterns: ['__NEXT_DATA__', '_next/', 'next/static', '__next'], type: 'framework' },
		{ name: 'Vue.js', patterns: ['__VUE__', 'vue.js', 'vue.min.js', 'data-v-', '__vue_app__'], type: 'framework' },
		{ name: 'Nuxt', patterns: ['__NUXT__', '_nuxt/', 'nuxt.js'], type: 'framework' },
		{ name: 'Angular', patterns: ['ng-version', 'ng-app', 'angular.js', 'angular.min.js', '_ngcontent', 'ng-'], type: 'framework' },
		{ name: 'Svelte', patterns: ['svelte', '__svelte'], type: 'framework' },
		{ name: 'SvelteKit', patterns: ['__sveltekit', 'sveltekit'], type: 'framework' },
		{ name: 'Astro', patterns: ['astro-', 'data-astro'], type: 'framework' },
		{ name: 'Remix', patterns: ['__remixContext', '__remix'], type: 'framework' },
		{ name: 'Gatsby', patterns: ['___gatsby', 'gatsby-'], type: 'framework' },
		{ name: 'Solid.js', patterns: ['_$HY', 'solid-js'], type: 'framework' },
		{ name: 'Qwik', patterns: ['q:container', 'qwik'], type: 'framework' },
		{ name: 'Preact', patterns: ['preact', '__PREACT_DEVTOOLS__'], type: 'framework' },
		{ name: 'Ember.js', patterns: ['ember', 'data-ember-action'], type: 'framework' },
		{ name: 'Alpine.js', patterns: ['x-data', 'x-bind', 'x-on', 'alpine'], type: 'framework' },
		{ name: 'HTMX', patterns: ['hx-get', 'hx-post', 'hx-trigger', 'htmx.org'], type: 'framework' },
		{ name: 'Lit', patterns: ['lit-element', 'lit-html'], type: 'framework' },
		{ name: 'Stimulus', patterns: ['data-controller', 'stimulus'], type: 'framework' },
		{ name: 'Turbo', patterns: ['turbo-frame', 'turbo-stream', 'hotwired'], type: 'framework' },
	],
	cms: [
		{ name: 'WordPress', patterns: ['wp-content', 'wp-includes', 'wp-json', 'wordpress'], type: 'cms' },
		{ name: 'Drupal', patterns: ['drupal', '/sites/default/files'], type: 'cms' },
		{ name: 'Joomla', patterns: ['/media/jui/', 'joomla'], type: 'cms' },
		{ name: 'Shopify', patterns: ['cdn.shopify.com', 'Shopify.theme', 'myshopify.com'], type: 'cms' },
		{ name: 'Wix', patterns: ['wix.com', 'static.wixstatic.com', 'wix-code'], type: 'cms' },
		{ name: 'Squarespace', patterns: ['squarespace.com', 'static1.squarespace.com'], type: 'cms' },
		{ name: 'Webflow', patterns: ['webflow.com', 'assets.website-files.com', 'w-'], type: 'cms' },
		{ name: 'Ghost', patterns: ['ghost.io', '/ghost/'], type: 'cms' },
		{ name: 'Contentful', patterns: ['contentful.com', 'ctfassets.net'], type: 'cms' },
		{ name: 'Sanity', patterns: ['sanity.io', 'cdn.sanity.io'], type: 'cms' },
		{ name: 'Strapi', patterns: ['strapi', '/uploads/'], type: 'cms' },
		{ name: 'Prismic', patterns: ['prismic.io', 'cdn.prismic.io'], type: 'cms' },
		{ name: 'HubSpot', patterns: ['hubspot.com', 'hs-scripts.com', 'hsforms.com'], type: 'cms' },
		{ name: 'Framer', patterns: ['framer.com', 'framerusercontent.com'], type: 'cms' },
	],
	analytics: [
		{ name: 'Google Analytics', patterns: ['google-analytics.com', 'googletagmanager.com', 'gtag(', 'ga('], type: 'analytics' },
		{ name: 'Google Tag Manager', patterns: ['googletagmanager.com/gtm.js'], type: 'analytics' },
		{ name: 'Plausible', patterns: ['plausible.io'], type: 'analytics' },
		{ name: 'Fathom', patterns: ['usefathom.com'], type: 'analytics' },
		{ name: 'Mixpanel', patterns: ['mixpanel.com', 'mixpanel.init'], type: 'analytics' },
		{ name: 'Amplitude', patterns: ['amplitude.com', 'cdn.amplitude.com'], type: 'analytics' },
		{ name: 'Segment', patterns: ['segment.com', 'cdn.segment.com', 'analytics.js'], type: 'analytics' },
		{ name: 'Hotjar', patterns: ['hotjar.com', 'static.hotjar.com'], type: 'analytics' },
		{ name: 'Heap', patterns: ['heap.io', 'heapanalytics.com'], type: 'analytics' },
		{ name: 'PostHog', patterns: ['posthog.com', 'app.posthog.com'], type: 'analytics' },
		{ name: 'Clarity', patterns: ['clarity.ms'], type: 'analytics' },
		{ name: 'Vercel Analytics', patterns: ['vercel-analytics', '_vercel/insights'], type: 'analytics' },
	],
	hosting: [
		{ name: 'Vercel', patterns: ['vercel.app', 'vercel.com', 'x-vercel'], type: 'hosting' },
		{ name: 'Netlify', patterns: ['netlify.app', 'netlify.com', 'x-nf-'], type: 'hosting' },
		{ name: 'Cloudflare Pages', patterns: ['pages.dev', 'cloudflare'], type: 'hosting' },
		{ name: 'AWS', patterns: ['amazonaws.com', 'cloudfront.net', 'aws.'], type: 'hosting' },
		{ name: 'Google Cloud', patterns: ['googleapis.com', 'appspot.com', 'run.app'], type: 'hosting' },
		{ name: 'Azure', patterns: ['azure.com', 'azurewebsites.net', 'blob.core.windows.net'], type: 'hosting' },
		{ name: 'Heroku', patterns: ['herokuapp.com', 'heroku'], type: 'hosting' },
		{ name: 'Railway', patterns: ['railway.app'], type: 'hosting' },
		{ name: 'Render', patterns: ['onrender.com', 'render.com'], type: 'hosting' },
		{ name: 'DigitalOcean', patterns: ['digitalocean.com', 'digitaloceanspaces.com'], type: 'hosting' },
		{ name: 'GitHub Pages', patterns: ['github.io'], type: 'hosting' },
	],
	libraries: [
		{ name: 'jQuery', patterns: ['jquery', 'jQuery'], type: 'library' },
		{ name: 'Lodash', patterns: ['lodash'], type: 'library' },
		{ name: 'Moment.js', patterns: ['moment.js', 'moment.min.js'], type: 'library' },
		{ name: 'Day.js', patterns: ['dayjs'], type: 'library' },
		{ name: 'Axios', patterns: ['axios'], type: 'library' },
		{ name: 'Three.js', patterns: ['three.js', 'three.min.js', 'THREE'], type: 'library' },
		{ name: 'GSAP', patterns: ['gsap', 'TweenMax', 'TweenLite', 'greensock'], type: 'library' },
		{ name: 'Framer Motion', patterns: ['framer-motion'], type: 'library' },
		{ name: 'Lottie', patterns: ['lottie', 'lottie-web'], type: 'library' },
		{ name: 'Chart.js', patterns: ['chart.js', 'chartjs'], type: 'library' },
		{ name: 'D3.js', patterns: ['d3.js', 'd3.min.js'], type: 'library' },
		{ name: 'Highcharts', patterns: ['highcharts'], type: 'library' },
		{ name: 'Swiper', patterns: ['swiper'], type: 'library' },
		{ name: 'Splide', patterns: ['splide'], type: 'library' },
		{ name: 'AOS', patterns: ['aos.js', 'data-aos'], type: 'library' },
		{ name: 'ScrollReveal', patterns: ['scrollreveal'], type: 'library' },
		{ name: 'Prism.js', patterns: ['prismjs', 'prism.js'], type: 'library' },
		{ name: 'Highlight.js', patterns: ['highlight.js', 'hljs'], type: 'library' },
		{ name: 'Marked', patterns: ['marked.js', 'marked.min.js'], type: 'library' },
		{ name: 'Socket.io', patterns: ['socket.io'], type: 'library' },
		{ name: 'Pusher', patterns: ['pusher.com', 'pusher.js'], type: 'library' },
	],
	fonts: [
		{ name: 'Google Fonts', patterns: ['fonts.googleapis.com', 'fonts.gstatic.com'], type: 'fonts' },
		{ name: 'Adobe Fonts', patterns: ['use.typekit.net', 'typekit.com'], type: 'fonts' },
		{ name: 'Font Awesome', patterns: ['fontawesome', 'font-awesome', 'fa-'], type: 'fonts' },
		{ name: 'Custom Web Fonts', patterns: ['@font-face', 'woff2', 'woff'], type: 'fonts' },
	],
	payment: [
		{ name: 'Stripe', patterns: ['stripe.com', 'js.stripe.com', 'Stripe('], type: 'payment' },
		{ name: 'PayPal', patterns: ['paypal.com', 'paypalobjects.com'], type: 'payment' },
		{ name: 'Square', patterns: ['squareup.com', 'squarecdn.com'], type: 'payment' },
		{ name: 'Paddle', patterns: ['paddle.com', 'cdn.paddle.com'], type: 'payment' },
		{ name: 'Gumroad', patterns: ['gumroad.com'], type: 'payment' },
		{ name: 'LemonSqueezy', patterns: ['lemonsqueezy.com'], type: 'payment' },
	],
	auth: [
		{ name: 'Auth0', patterns: ['auth0.com', 'cdn.auth0.com'], type: 'auth' },
		{ name: 'Clerk', patterns: ['clerk.com', 'clerk.dev'], type: 'auth' },
		{ name: 'Firebase Auth', patterns: ['firebaseauth', 'firebase.auth'], type: 'auth' },
		{ name: 'Supabase Auth', patterns: ['supabase.co', 'supabase.io'], type: 'auth' },
		{ name: 'NextAuth', patterns: ['next-auth', 'api/auth'], type: 'auth' },
		{ name: 'Okta', patterns: ['okta.com'], type: 'auth' },
	],
	monitoring: [
		{ name: 'Sentry', patterns: ['sentry.io', 'browser.sentry-cdn.com', 'Sentry.init'], type: 'monitoring' },
		{ name: 'LogRocket', patterns: ['logrocket.com', 'cdn.logrocket.io'], type: 'monitoring' },
		{ name: 'Datadog', patterns: ['datadoghq.com'], type: 'monitoring' },
		{ name: 'New Relic', patterns: ['newrelic.com', 'nr-data.net'], type: 'monitoring' },
		{ name: 'Bugsnag', patterns: ['bugsnag.com'], type: 'monitoring' },
	],
	cdn: [
		{ name: 'Cloudflare CDN', patterns: ['cdnjs.cloudflare.com', 'cf-'], type: 'cdn' },
		{ name: 'jsDelivr', patterns: ['cdn.jsdelivr.net'], type: 'cdn' },
		{ name: 'unpkg', patterns: ['unpkg.com'], type: 'cdn' },
		{ name: 'Fastly', patterns: ['fastly.net'], type: 'cdn' },
		{ name: 'Akamai', patterns: ['akamai', 'akamized.net'], type: 'cdn' },
	],
	server: [
		{ name: 'Node.js', patterns: ['x-powered-by: express', 'node'], type: 'server' },
		{ name: 'Express', patterns: ['x-powered-by: express'], type: 'server' },
		{ name: 'PHP', patterns: ['x-powered-by: php', '.php'], type: 'server' },
		{ name: 'ASP.NET', patterns: ['x-powered-by: asp.net', 'x-aspnet-version'], type: 'server' },
		{ name: 'Ruby on Rails', patterns: ['x-powered-by: phusion', 'rails', 'ruby'], type: 'server' },
		{ name: 'Django', patterns: ['csrfmiddlewaretoken', 'django'], type: 'server' },
		{ name: 'Flask', patterns: ['werkzeug'], type: 'server' },
		{ name: 'Laravel', patterns: ['laravel', 'x-powered-by: laravel'], type: 'server' },
		{ name: 'nginx', patterns: ['server: nginx'], type: 'server' },
		{ name: 'Apache', patterns: ['server: apache'], type: 'server' },
	],
};

// Tech stack scanning (from ingredients)
interface IngredientCheck {
	tag: string;
	attribute: string | null;
	value: string | null;
}

interface HeaderCheck {
	header: string;
	value: string | null;
}

interface Ingredient {
	name: string;
	description: string;
	icon: string;
	checks: {
		tags: IngredientCheck[];
		headers: HeaderCheck[];
	};
}

interface TechMatch {
	id: string;
	name: string;
	description: string;
	icon: string;
}

async function scanTechStack(page: any, responseHeaders: Map<string, string>): Promise<{ matches: Record<string, TechMatch[]>; categories: Record<string, string> }> {
	const matches: Record<string, TechMatch[]> = {};

	// Get the ingredients directory path
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const ingredientsPath = join(__dirname, '..', '..', '..', 'lib', 'ingredients');

	let categories: Record<string, string> = {};
	try {
		const categoriesJson = readFileSync(join(ingredientsPath, 'categories.json'), 'utf-8');
		categories = JSON.parse(categoriesJson);
	} catch (e) {
		// Use inline categories if file not found
		categories = {
			"ads": "Ads",
			"analytics": "Analytics",
			"auth": "Authentication",
			"blogs": "Blogs",
			"builders": "Website Builders",
			"cdn": "CDNs",
			"cms": "CMS",
			"compliance": "Compliance",
			"docs": "Documentation Tools",
			"ecommerce": "E-Commerce",
			"fonts": "Fonts",
			"frameworks": "Frameworks",
			"hosts": "Hosts",
			"libraries": "Libraries",
			"monitoring": "Monitoring",
			"notifications": "Notifications",
			"payments": "Payments",
			"search": "Search",
			"security": "Security",
			"servers": "Servers",
			"social": "Social",
			"storage": "Storage",
			"widgets": "Widgets",
			"wikis": "Wikis",
			"other": "Other"
		};
	}

	// Scan HTML content in browser
	const htmlContent = await page.content();

	// Extract all script srcs, link hrefs, and meta tags for matching
	const scanData = await page.evaluate(() => {
		const data: {
			scripts: { src: string | null; content: string; id: string | null }[];
			links: { href: string | null; rel: string | null }[];
			metas: { name: string | null; content: string | null; property: string | null }[];
			allElements: { tag: string; attributes: Record<string, string>; text: string }[];
		} = {
			scripts: [],
			links: [],
			metas: [],
			allElements: []
		};

		// Scripts
		document.querySelectorAll('script').forEach((el) => {
			data.scripts.push({
				src: el.getAttribute('src'),
				content: el.textContent?.substring(0, 5000) || '',
				id: el.getAttribute('id')
			});
		});

		// Links
		document.querySelectorAll('link').forEach((el) => {
			data.links.push({
				href: el.getAttribute('href'),
				rel: el.getAttribute('rel')
			});
		});

		// Meta tags
		document.querySelectorAll('meta').forEach((el) => {
			data.metas.push({
				name: el.getAttribute('name'),
				content: el.getAttribute('content'),
				property: el.getAttribute('property')
			});
		});

		// Sample of elements for data-* attribute checks
		['main', 'div', 'body', 'html', 'header', 'footer', 'nav', 'section'].forEach(tagName => {
			document.querySelectorAll(tagName).forEach((el) => {
				const attrs: Record<string, string> = {};
				for (const attr of el.attributes) {
					attrs[attr.name] = attr.value;
				}
				data.allElements.push({
					tag: tagName,
					attributes: attrs,
					text: ''
				});
			});
		});

		return data;
	});

	// Check each category
	for (const category of Object.keys(categories)) {
		if (category === 'categories.json') continue;

		let ingredientFiles: string[] = [];
		try {
			ingredientFiles = readdirSync(join(ingredientsPath, category)).filter(f => f.endsWith('.json'));
		} catch (e) {
			continue;
		}

		for (const file of ingredientFiles) {
			try {
				const ingredientJson = readFileSync(join(ingredientsPath, category, file), 'utf-8');
				const ingredient: Ingredient = JSON.parse(ingredientJson);
				const ingredientId = file.replace('.json', '');

				let matched = false;

				// Check tags
				for (const tagCheck of ingredient.checks.tags) {
					if (matched) break;

					if (tagCheck.tag === 'script') {
						for (const script of scanData.scripts) {
							if (matched) break;

							// Check src attribute
							if (tagCheck.attribute === 'src' && script.src && tagCheck.value) {
								if (tagCheck.value.includes('*')) {
									const parts = tagCheck.value.split('*');
									if (parts.every(p => script.src!.includes(p))) {
										matched = true;
									}
								} else if (script.src.includes(tagCheck.value)) {
									matched = true;
								}
							}

							// Check id attribute
							if (tagCheck.attribute === 'id' && script.id && tagCheck.value) {
								if (script.id.includes(tagCheck.value)) {
									matched = true;
								}
							}

							// Check script content (attribute is null)
							if (tagCheck.attribute === null && tagCheck.value && script.content) {
								if (script.content.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}

					if (tagCheck.tag === 'link') {
						for (const link of scanData.links) {
							if (matched) break;
							if (tagCheck.attribute === 'href' && link.href && tagCheck.value) {
								if (tagCheck.value.includes('*')) {
									const parts = tagCheck.value.split('*');
									if (parts.every(p => link.href!.includes(p))) {
										matched = true;
									}
								} else if (link.href.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}

					if (tagCheck.tag === 'meta') {
						for (const meta of scanData.metas) {
							if (matched) break;
							// Generator meta tag
							if (meta.name === 'generator' && tagCheck.value && meta.content) {
								if (meta.content.includes(tagCheck.value)) {
									matched = true;
								}
							}
							// Platform meta tag
							if (meta.name === 'platform' && tagCheck.value && meta.content) {
								if (meta.content.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}

					// Check other elements (main, div, etc.)
					if (['main', 'div', 'body', 'html', 'header', 'footer', 'nav', 'section'].includes(tagCheck.tag)) {
						for (const el of scanData.allElements) {
							if (matched) break;
							if (el.tag === tagCheck.tag && tagCheck.attribute && tagCheck.value) {
								const attrValue = el.attributes[tagCheck.attribute];
								if (attrValue && attrValue.includes(tagCheck.value)) {
									matched = true;
								}
							}
						}
					}
				}

				// Check headers
				for (const headerCheck of ingredient.checks.headers) {
					if (matched) break;
					const headerValue = responseHeaders.get(headerCheck.header.toLowerCase());
					if (headerValue) {
						if (headerCheck.value === null) {
							matched = true;
						} else if (headerValue.includes(headerCheck.value)) {
							matched = true;
						}
					}
				}

				// Also check raw HTML for additional patterns
				if (!matched) {
					for (const tagCheck of ingredient.checks.tags) {
						if (tagCheck.value && htmlContent.includes(tagCheck.value)) {
							// Only match if it's a strong indicator
							if (tagCheck.attribute === null || tagCheck.attribute === 'src' || tagCheck.attribute === 'href') {
								matched = true;
								break;
							}
						}
					}
				}

				if (matched) {
					if (!matches[category]) {
						matches[category] = [];
					}
					// Avoid duplicates
					if (!matches[category].some(m => m.id === ingredientId)) {
						matches[category].push({
							id: ingredientId,
							name: ingredient.name,
							description: ingredient.description,
							icon: ingredient.icon
						});
					}
				}
			} catch (e) {
				// Skip invalid ingredient files
			}
		}
	}

	return { matches, categories };
}

// Built-in tech detection using patterns (doesn't rely on external files)
async function detectBuiltInTech(page: Page, responseHeaders: Map<string, string>, targetUrl: string): Promise<Record<string, string[]>> {
	const detected: Record<string, string[]> = {};

	// Get page content and combine with headers for scanning
	const html = await page.content();
	const headerStr = Array.from(responseHeaders.entries()).map(([k, v]) => `${k}: ${v}`).join('\n').toLowerCase();
	const fullContent = html + '\n' + headerStr + '\n' + targetUrl;

	// Scan for each category
	for (const [category, techs] of Object.entries(TECH_PATTERNS)) {
		for (const tech of techs) {
			const found = tech.patterns.some(pattern =>
				fullContent.toLowerCase().includes(pattern.toLowerCase())
			);
			if (found) {
				if (!detected[category]) {
					detected[category] = [];
				}
				if (!detected[category].includes(tech.name)) {
					detected[category].push(tech.name);
				}
			}
		}
	}

	// Additional deep scanning in browser context
	const browserDetected = await page.evaluate(() => {
		const results: Record<string, string[]> = {};
		const html = document.documentElement.outerHTML;

		// Check window objects for framework globals
		const w = window as any;

		// React
		if (w.React || w.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot], [data-reactid], #__next')) {
			results.frameworks = results.frameworks || [];
			if (!results.frameworks.includes('React')) results.frameworks.push('React');
		}

		// Next.js
		if (w.__NEXT_DATA__ || document.querySelector('#__next') || html.includes('/_next/')) {
			results.frameworks = results.frameworks || [];
			if (!results.frameworks.includes('Next.js')) results.frameworks.push('Next.js');
		}

		// Vue
		if (w.Vue || w.__VUE__ || document.querySelector('[data-v-]')) {
			results.frameworks = results.frameworks || [];
			if (!results.frameworks.includes('Vue.js')) results.frameworks.push('Vue.js');
		}

		// Nuxt
		if (w.__NUXT__ || html.includes('/_nuxt/')) {
			results.frameworks = results.frameworks || [];
			if (!results.frameworks.includes('Nuxt')) results.frameworks.push('Nuxt');
		}

		// Angular
		if (w.ng || document.querySelector('[ng-version], [_ngcontent]')) {
			results.frameworks = results.frameworks || [];
			if (!results.frameworks.includes('Angular')) results.frameworks.push('Angular');
		}

		// Svelte/SvelteKit
		if (w.__svelte || html.includes('__sveltekit') || document.querySelector('[class*="svelte-"]')) {
			results.frameworks = results.frameworks || [];
			if (!results.frameworks.includes('Svelte')) results.frameworks.push('Svelte');
		}

		// jQuery
		if (w.jQuery || w.$) {
			results.libraries = results.libraries || [];
			if (!results.libraries.includes('jQuery')) results.libraries.push('jQuery');
		}

		// GSAP
		if (w.gsap || w.TweenMax || w.TweenLite) {
			results.libraries = results.libraries || [];
			if (!results.libraries.includes('GSAP')) results.libraries.push('GSAP');
		}

		// Three.js
		if (w.THREE) {
			results.libraries = results.libraries || [];
			if (!results.libraries.includes('Three.js')) results.libraries.push('Three.js');
		}

		// Stripe
		if (w.Stripe) {
			results.payment = results.payment || [];
			if (!results.payment.includes('Stripe')) results.payment.push('Stripe');
		}

		// Sentry
		if (w.Sentry) {
			results.monitoring = results.monitoring || [];
			if (!results.monitoring.includes('Sentry')) results.monitoring.push('Sentry');
		}

		// Iconify
		if (w.Iconify) {
			results.icons = results.icons || [];
			if (!results.icons.includes('Iconify')) results.icons.push('Iconify');
		}

		return results;
	});

	// Merge browser detected with pattern detected
	for (const [category, techs] of Object.entries(browserDetected)) {
		if (!detected[category]) {
			detected[category] = [];
		}
		for (const tech of techs) {
			if (!detected[category].includes(tech)) {
				detected[category].push(tech);
			}
		}
	}

	return detected;
}

export const POST: RequestHandler = async ({ request }) => {
	let browser = null;

	try {
		const body = await request.json();
		const { url, options = {} } = body;

		if (!url) {
			return json({ error: 'URL is required' }, { status: 400 });
		}

		let targetUrl = url;
		if (!targetUrl.match(/^https?:\/\//)) {
			targetUrl = 'https://' + targetUrl;
		}

		try {
			new URL(targetUrl);
		} catch {
			return json({ error: 'Invalid URL format' }, { status: 400 });
		}

		// Launch Playwright browser with stealth args
		browser = await chromium.launch({
			headless: true,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-blink-features=AutomationControlled',
				'--disable-web-security',
				'--disable-features=IsolateOrigins,site-per-process',
				'--disable-dev-shm-usage'
			]
		});

		// Use the extraction function (it will create its own context with stealth settings)
		const result = await extractBranding(targetUrl, mockSpinner, browser, {
			navigationTimeout: 90000,
			darkMode: options.darkMode || false,
			mobile: options.mobile || false,
			slow: options.slow || false
		});

		// Create a new context for tech stack scanning
		const context = await browser.newContext({
			viewport: { width: 1920, height: 1080 },
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			locale: 'en-US'
		});

		const scanPage = await context.newPage();

		// Capture response headers
		const responseHeaders = new Map<string, string>();
		scanPage.on('response', (response) => {
			if (response.url() === targetUrl || response.url().replace(/\/$/, '') === targetUrl.replace(/\/$/, '')) {
				const headers = response.headers();
				for (const [key, value] of Object.entries(headers)) {
					responseHeaders.set(key.toLowerCase(), value);
				}
			}
		});

		await scanPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
		await scanPage.waitForTimeout(3000);

		// Scan for tech stack using ingredient files
		const techStack = await scanTechStack(scanPage, responseHeaders);

		// Also run built-in detection for frameworks/libraries that might be missed
		const builtInTech = await detectBuiltInTech(scanPage, responseHeaders, targetUrl);

		await browser.close();
		browser = null;

		// Merge tech stack into result
		return json({
			...result,
			techStack: techStack.matches,
			techCategories: techStack.categories,
			detectedTech: builtInTech
		});

	} catch (error: any) {
		if (browser) {
			await browser.close();
		}
		console.error('Extraction error:', error);
		return json(
			{ error: error.message || 'Failed to extract design tokens' },
			{ status: 500 }
		);
	}
};
