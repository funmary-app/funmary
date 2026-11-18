// トークンの持ち主が現在の規約に同意していない場合に、同意画面の URL を返す。

export interface TermsGate {
	/** 同意を求める利用規約とプライバシーポリシーの版 (最終更新日) */
	readonly version: string;
	/** 同意画面の URL (https://example.com/consent) */
	readonly consentUrl: string;
}

/** 購読 (ICS、RSS) の読み込み関数が、持ち主の同意を待っているときに返す印 */
export const TERMS_REQUIRED = 'terms-required' as const;

/** 公開 API が返すエラーの種類 (error の値)。クライアントは、この値で見分ける */
export const TERMS_NOT_ACCEPTED = 'terms_not_accepted';

/** 人と AI エージェントが読む説明。何が起きていて、何をすればよいかを書く */
export function termsRequiredMessage(consentUrl: string): string {
	return `Funmary の利用規約とプライバシーポリシーへの同意が必要です。次のページでログインし、内容を確認して同意してください。\n${consentUrl}`;
}

/** 公開 API の本文。HTTP の状態は 403 (トークンは正しいが、いまは使えない) */
export function termsRequiredBody(gate: TermsGate) {
	return {
		error: TERMS_NOT_ACCEPTED,
		message: termsRequiredMessage(gate.consentUrl),
		consentUrl: gate.consentUrl,
	};
}
