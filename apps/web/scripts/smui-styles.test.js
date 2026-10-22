import { describe, expect, it } from 'vitest';
import { smuiStyleFile, withSmuiStyles } from './smui-styles.js';

const everyStyleExists = () => true;

describe('withSmuiStyles', () => {
	it('SMUI の部品を import したモジュールの先頭に、その部品の CSS の import を足す', () => {
		const code = "import Button from '@smui/button';\n";
		expect(withSmuiStyles(code, everyStyleExists)).toBe(
			`import '#lib/styles/generated/smui/button.css';\n${code}`,
		);
	});

	it('部品の中のモジュール (@smui/textfield/helper-text) も、部品の CSS を読む。同じ部品の CSS は 1 回だけ足す', () => {
		const code = [
			"import Textfield from '@smui/textfield';",
			"import HelperText from '@smui/textfield/helper-text';",
			'import { Label } from "@smui/button";',
		].join('\n');
		const imports = withSmuiStyles(code, everyStyleExists)?.split('\n').slice(0, 2);
		expect(imports).toEqual([
			"import '#lib/styles/generated/smui/textfield.css';",
			"import '#lib/styles/generated/smui/button.css';",
		]);
	});

	it('CSS を作っていない部品 (スタイルのない部品) は足さない。足すものがなければ変えない', () => {
		const code = "import { classMap } from '@smui/common/internal';\nimport x from 'svelte';\n";
		expect(withSmuiStyles(code, () => false)).toBeUndefined();
		expect(withSmuiStyles("import x from 'svelte';\n", everyStyleExists)).toBeUndefined();
	});
});

describe('smuiStyleFile', () => {
	it('@smui-extra の部品は、@smui の部品と名前がぶつからないよう extra- を付ける', () => {
		expect(smuiStyleFile('@smui/textfield')).toBe('src/lib/styles/generated/smui/textfield.css');
		expect(smuiStyleFile('@smui-extra/accordion')).toBe(
			'src/lib/styles/generated/smui/extra-accordion.css',
		);
	});
});
