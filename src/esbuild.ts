import esbuild from 'esbuild';
import type {Plugin} from 'esbuild';

export const cssPlugin: Plugin = {
	name: 'css',
	setup(build) {
		build.onLoad({filter: /\.css$/}, ({path}) => { // oxlint-disable-line require-unicode-regexp
			const {outputFiles: [output]} = esbuild.buildSync({
				entryPoints: [path],
				bundle: true,
				minify: true,
				write: false,
				loader: {'.css': 'css'},
				supported: {nesting: false},
			});
			return {contents: output!.text.trim(), loader: 'text'};
		});
	},
};
