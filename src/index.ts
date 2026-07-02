import {rawurldecode} from '@bhsd/common';
import type {ConfigData} from 'wikiparser-node';
import type {LanguageServiceBase} from 'wikiparser-node/dist/extensions/typings.ts';

export type ConfigGetter = () => Promise<ConfigData>;

declare const $LANGS: string[],
	define: unknown;

declare interface Require {
	config(config: {paths?: Record<string, string>}): void;

	(modules: string[], ready: (exports: unknown) => unknown): void;
}

declare interface Obj {
	[x: string]: Obj | undefined;
}

declare interface WikiparseOptions {

	/** 获取解析配置的函数 */
	getConfig?: ConfigGetter | undefined;

	/** 语言代码或语言代码列表 */
	langs?: string | string[] | undefined;

	/** CDN 地址 */
	cdn?: string | undefined;
}

export const CDN = 'https://fastly.jsdelivr.net';

const dict: Record<string, string> = {'\n': '<br>', '&': '&amp;', '<': '&lt;'};

/**
 * 转义HTML字符串
 * @param text 原字符串
 */
export const escHTML = (text: string): string => text.replaceAll(/[\n<&]/gu, ch => dict[ch]!);

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
			obj = obj === globalThis as unknown as Obj ? getGlobal(prop) as Obj | undefined : obj?.[prop];
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
const parseVersion = (version: string): [number, number?, number?] =>
	version.split('.', 3).map(Number) as [number, number?, number?];

/**
 * 比较版本号
 * @param version 版本号
 * @param baseVersion 基础版本号
 */
export const compareVersion = (version: string, baseVersion: string): boolean => {
	const [major, minor = 0, patch = 0] = parseVersion(version),
		[baseMajor, baseMinor = 0, basePatch = 0] = parseVersion(baseVersion);
	return major > baseMajor
		|| major === baseMajor && minor > baseMinor
		|| major === baseMajor && minor === baseMinor && patch >= basePatch;
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
 * @param opt 选项
 * @param opt.getConfig 获取解析配置的函数
 * @param opt.langs 语言代码或语言代码列表
 * @param opt.cdn CDN 地址
 */
export const getWikiparse = async ({getConfig, langs, cdn}: WikiparseOptions = {}): Promise<void> => {
	const repo = 'npm/wikiparser-node',
		dir = 'extensions/dist';
	if (cdn && /\.jsdelivr\.net\/?$/iu.test(cdn)) {
		// eslint-disable-next-line no-param-reassign
		cdn += (cdn.endsWith('/') ? '' : '/') + repo;
	}
	let src = cdn || `${repo}/${dir}/base.min.js`;
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
 * @param opt 选项
 */
export const getLSP = (obj: object, include?: boolean, opt?: WikiparseOptions): LanguageServiceBase | undefined => {
	void getWikiparse(opt);
	if (typeof wikiparse !== 'object' || !isGlobal('wikiparse') || !wikiparse.LanguageService || lsps.has(obj)) {
		return lsps.get(obj);
	}
	const lsp = new wikiparse.LanguageService(include);
	lsps.set(obj, lsp);
	return lsp;
};

/**
 * 判断全局变量是否存在
 * @param prop 变量名
 */
export const isGlobal = (prop: string): boolean => Object.hasOwn(globalThis, prop);

/**
 * 获取全局变量的值
 * @param prop 变量名
 */
export const getGlobal = (prop: string): unknown => Object.getOwnPropertyDescriptor(globalThis, prop)?.value;
