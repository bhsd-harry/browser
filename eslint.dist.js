import {dist, distES10} from '@bhsd/code-standard';

export default [
	dist,
	{
		files: ['dist/color.js'],
		languageOptions: {
			ecmaVersion: 10,
		},
		rules: distES10.rules,
	},
];
