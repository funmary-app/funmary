// 新規登録の方式の選び方。管理画面の「登録と招待」と、CLI の案内で使う。
import type { Registration } from '@funmary/auth';

export const REGISTRATIONS = [
	'invite',
	'open',
	'closed',
] as const satisfies readonly Registration[];

export const REGISTRATION_OPTIONS: readonly {
	readonly value: Registration;
	readonly label: string;
	readonly description: string;
}[] = [
	{
		value: 'invite',
		label: '招待コードが要る',
		description: '招待コードを持つ人だけが登録できます。',
	},
	{
		value: 'open',
		label: '誰でも登録できる',
		description: '大学のアカウントがあれば、招待コードがなくても登録できます。',
	},
	{
		value: 'closed',
		label: '受け付けない',
		description: '新しい登録を止めます。登録済みの人は、いつもどおりログインできます。',
	},
];

export function registrationLabel(value: Registration): string {
	return REGISTRATION_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
