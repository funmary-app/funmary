// Discord のスラッシュコマンドの定義と、その登録 (#36)。
// グローバルコマンドとして登録し、サポートサーバーとユーザーインストールの両方で使えるようにする (integration_types と contexts)。
// 反映までは最大 1 時間かかる。Bot のトークンは、ログにも例外の文にも出さない。
const DISCORD_API = 'https://discord.com/api/v10';

/** 利用者が呼べるスラッシュコマンド。応答は実行した本人だけが見られる */
export const SLASH_COMMANDS = [
	{
		name: 'today',
		description: '今日の授業と予定を、本人にだけ見せます',
	},
	{
		name: 'next',
		description: '次の授業の時刻と教室を、本人にだけ見せます',
	},
	{
		name: 'week',
		description: '今週の時間割を、本人にだけ見せます',
	},
	{
		name: 'changes',
		description: 'これから 14 日の休講、補講、教室変更を、本人にだけ見せます',
	},
	{
		name: 'bus',
		description: '亀田支所前と未来大の間の、次のバスを、本人にだけ見せます',
	},
] as const;

/** Discord に送る、コマンドの定義 (type 1 は CHAT_INPUT)。integration_types 0 = サーバー、1 = ユーザー。contexts 0 = サーバー、1 = Bot との DM、2 = そのほかの DM */
export function commandPayloads() {
	return SLASH_COMMANDS.map((command) => ({
		name: command.name,
		description: command.description,
		type: 1,
		integration_types: [0, 1],
		contexts: [0, 1, 2],
	}));
}

/**
 * グローバルコマンドを、この定義で置き換える。成功したら登録した数を返す。
 * 失敗したら、Discord の応答の状態だけを含む例外にする (トークンは含めない)
 */
export async function registerSlashCommands(options: {
	readonly token: string;
	readonly applicationId: string;
	readonly fetch?: typeof fetch;
}): Promise<number> {
	const doFetch = options.fetch ?? fetch;
	const response = await doFetch(`${DISCORD_API}/applications/${options.applicationId}/commands`, {
		method: 'PUT',
		headers: {
			Authorization: `Bot ${options.token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(commandPayloads()),
	});
	if (!response.ok) {
		throw new Error(`Discord がコマンドの登録を断りました (HTTP ${response.status})`);
	}
	return SLASH_COMMANDS.length;
}
