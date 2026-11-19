import { defineProject } from 'vitest/config';
import { sharedTestOptions } from '../../../vitest.shared.js';

export default defineProject({
	test: {
		...sharedTestOptions,
		name: 'notify',
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
