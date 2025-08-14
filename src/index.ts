import {rawurldecode} from '@bhsd/common';
import type {ConfigData} from 'wikiparser-node';
import type {LanguageServiceBase} from 'wikiparser-node/extensions/typings.ts';

declare const $LANGS: string[],
	define: unknown;

declare interface Require {
	config(config: {paths?: Record<string, string>}): void;

	(modules: string[], ready: (exports: unknown) => unknown): void;
}

declare interface Obj {
	[x: string]: Obj | undefined;
}

declare type ConfigGetter = () => Promise<ConfigData>;

export const CDN = 'https://testingcf.jsdelivr.net';

const textarea = /* #__PURE__ */
	(() => typeof document === 'object' ? document.createElement('textarea') : undefined)();

/**
 * 解码HTML实体
 * @param str 要解码的字符串
 */
export const decodeHTML = (str: string): string => {
	textarea!.innerHTML = str;
	return textarea!.value;
};

/**
 * 解码标题中的HTML实体和URL编码
 * @param title 标题
 */
export const normalizeTitle = (title: string): string => {
	const decoded = rawurldecode(title);
	return /[<>[\]|{}]/u.test(decoded) ? decoded : decodeHTML(decoded);
};

const loading = new Map<string, Promise<void>>();

/**
 * 使用传统方法加载脚本
 * @param src 脚本地址
 * @param globalConst 脚本全局变量名
 * @param amd 是否兼容 AMD
 */
export const loadScript = (src: string, globalConst: string, amd?: boolean): Promise<void> => {
	if (loading.has(src)) {
		return loading.get(src)!;
	}
	const promise = new Promise<void>(resolve => {
		const path = /^https?:\/\//iu.test(src) ? src : `${CDN}/${src}`;
		let obj: Obj | undefined = globalThis as unknown as Obj;
		for (const prop of globalConst.split('.')) {
			obj = obj?.[prop];
		}
		if (obj) {
			resolve();
		} else if (amd && typeof define === 'function' && 'amd' in define) {
			const requirejs = globalThis.require as unknown as Require;
			requirejs.config({paths: {[globalConst]: path}});
			requirejs([globalConst], (exports: unknown) => {
				Object.assign(globalThis, {[globalConst]: exports});
				resolve();
			});
		} else {
			const script = document.createElement('script');
			script.src = path;
			script.onload = (): void => {
				resolve();
			};
			document.head.append(script);
		}
	});
	loading.set(src, promise);
	return promise;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getObject = (key: string): any => JSON.parse(String(localStorage.getItem(key)));
export const setObject = (key: string, value: unknown): void => {
	localStorage.setItem(key, JSON.stringify(value));
};

/**
 * 解析版本号
 * @param version 版本号
 */
const parseVersion = (version: string): [number, number, number?] =>
	version.split('.', 3).map(Number) as [number, number, number?];

/**
 * 比较版本号
 * @param version 版本号
 * @param baseVersion 基础版本号
 */
export const compareVersion = (version: string, baseVersion: string): boolean => {
	const [major, minor] = parseVersion(version),
		[baseMajor, baseMinor] = parseVersion(baseVersion);
	return major > baseMajor || major === baseMajor && minor >= baseMinor;
};

/**
 * 加载 I18N
 * @param url 下载地址
 * @param cur 当前版本号
 * @param languages 语言代码列表
 * @param acceptableLangs 可接受的语言代码列表
 * @param key 存储的键名
 * @param i18n 已存储的I18N对象
 * @throws `Error` 无法获取语言包
 */
export const setI18N = async (
	url: string,
	cur: string,
	languages: string[] | string,
	acceptableLangs: string[],
	key: string,
	i18n: Record<string, string> = getObject(key) ?? {},
): Promise<Record<string, string>> => {
	const {version, lang} = i18n,
		langs = Array.isArray(languages) ? languages : [languages];
	if (version === cur && langs.includes(lang!)) {
		return i18n;
	}
	for (const language of langs) {
		const l = language.toLowerCase();
		if (!acceptableLangs.includes(l)) {
			continue;
		}
		try {
			const res = await fetch(`${url}/${l}.json`);
			Object.assign(i18n, await res.json(), {version: cur, lang: language});
			setObject(key, i18n);
			return i18n;
		} catch {}
	}
	throw new Error(`Failed to fetch the localization for ${langs[0]}.`);
};

let configLoaded = false,
	i18nLoaded = false;

/**
 * 加载 wikiparse
 * @param getConfig 获取解析配置的函数
 * @param langs 语言代码
 * @param cdn CDN 地址
 */
export const getWikiparse = async (
	getConfig?: ConfigGetter,
	langs?: string | string[],
	cdn?: string,
): Promise<void> => {
	const dir = 'extensions/dist';
	let src = cdn || `npm/wikiparser-node/${dir}/base.min.js`;
	if (!src.endsWith('.js')) {
		src = `${src}${src.endsWith('/') ? '' : '/'}${dir}/base.js`;
	}
	await loadScript(src, 'wikiparse');
	await loadScript(`${wikiparse.CDN}/${dir}/lsp.js`, 'wikiparse.LanguageService');
	if (!configLoaded && typeof getConfig === 'function') {
		configLoaded = true;
		try {
			wikiparse.setConfig(await getConfig());
		} catch {}
	}
	if (!i18nLoaded && langs) {
		i18nLoaded = true;
		const key = 'wikiparse-i18n',
			{version} = wikiparse;
		try {
			wikiparse.setI18N(await setI18N(`${wikiparse.CDN}/i18n`, version, langs, $LANGS, key));
		} catch {
			setObject(key, {version, lang: 'en'});
		}
	}
};

const lsps = new WeakMap<object, LanguageServiceBase>();

/**
 * 获取LSP
 * @param obj 关联对象
 * @param include 是否嵌入
 * @param getConfig 获取解析配置的函数
 * @param lang 语言代码
 */
export const getLSP = (
	obj: object,
	include?: boolean,
	getConfig?: ConfigGetter,
	lang?: string,
): LanguageServiceBase | undefined => {
	void getWikiparse(getConfig, lang);
	if (typeof wikiparse !== 'object' || !wikiparse.LanguageService || lsps.has(obj)) {
		return lsps.get(obj);
	}
	const lsp = new wikiparse.LanguageService(include);
	lsps.set(obj, lsp);
	return lsp;
};
