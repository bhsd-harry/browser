/* eslint-env node */
'use strict';

const fs = require('fs'),
	path = require('path'),
	esbuild = require('esbuild');
const langs = fs.readdirSync(path.join(require.resolve('wikiparser-node'), '..', '..', 'i18n'))
	.map(file => file.slice(0, -5));

esbuild.buildSync({
	entryPoints: ['src/index.ts'],
	charset: 'utf8',
	target: 'es2024',
	bundle: true,
	format: 'esm',
	define: {
		$LANGS: JSON.stringify(langs),
	},
	outfile: 'dist/index.js',
	logLevel: 'info',
});
