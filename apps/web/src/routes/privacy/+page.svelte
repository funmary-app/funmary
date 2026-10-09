<script lang="ts">
	import { PRIVACY_UPDATED_AT } from '#lib/legal-versions.ts';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';

	let {
		data,
	}: {
		data: {
			operator: { name: string; url: string } | null;
			contactEmail: string | null;
		};
	} = $props();

	const LAST_UPDATED = PRIVACY_UPDATED_AT;
</script>

<svelte:head>
	<title>プライバシーポリシー - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="プライバシーポリシー" public />
	<h1>プライバシーポリシー</h1>
	<p class="muted">最終更新日: {LAST_UPDATED}</p>

	<p>
		このプライバシーポリシーは、Funmary (以下「本サービス」)
		が、利用者の情報をどのように取得し、使い、保存するかを説明するものです。
	</p>

	<h2>1. 運営者</h2>
	<p>
		本サービスは、公立はこだて未来大学とは関係のない個人が、非公式に開発し、運営しています。大学が、利用者の情報を取得したり、管理したりすることはありません。
	</p>

	<h2>2. 取得する情報</h2>
	<h3>ログインのときに取得する情報</h3>
	<p>
		ログインには Google のアカウントを使います。Google からは、メールアドレス、氏名、Google
		が発行する識別子 (ほかの情報には使えない、本サービスだけの内部の値)
		を受け取ります。パスワードを受け取ることはありません。
	</p>
	<h3>利用者が入力する情報</h3>
	<p>
		履修している科目、個人用に加えた予定、時間割の個人用の変更など、利用者が自分で入力した情報です。
	</p>
	<h3>通知の送り先を登録したときに取得する情報</h3>
	<ul>
		<li>
			Discord と連携したとき: Discord のユーザー識別子、連携に使うアクセストークンと更新トークン
			(暗号化して保存します)
		</li>
		<li>Webhook を登録したとき: 利用者が指定した URL、署名の鍵 (暗号化して保存します)</li>
		<li>
			カレンダーの購読や、通知のフィードの URL を発行したとき: URL に含めるトークン
			(元の値はハッシュにして保存し、本サービスも元の値を知ることはできません)
		</li>
	</ul>
	<h3>アクセスログ、操作の記録</h3>
	<p>
		サーバーのアクセスログ (エラーの記録など)
		と、管理者やモデレーターが科目の情報を変えたときの操作の記録
		(操作した人のメールアドレスを含みます) を残します。
	</p>
	<h3>Cookie</h3>
	<p>
		ログインの状態を保つためのセッションの Cookie と、画面の配色 (ライトかダークか) を覚えるための
		Cookie を使います。広告や、他のサイトをまたいで利用者を追跡する Cookie は使いません。
	</p>

	<h2>3. 利用目的</h2>
	<p>
		取得した情報は、時間割の表示、休講などの通知、カレンダーへの連携、不具合の調査、不正な利用への対応のために使います。本サービスの機能に関係のない目的には使いません。
	</p>

	<h2>4. 学生ポータルの情報について</h2>
	<p>
		休講、補講、教室変更、公開シラバスの情報は、運営者が管理する 1
		つのアカウントで、全学向けに公開されている情報として取得しています。利用者おひとりおひとりの学生ポータルのアカウントに接続することはなく、成績などの個人の学籍情報を取得することもありません。
	</p>

	<h2>5. 第三者への提供、連携先</h2>
	<ul>
		<li>Google: ログインの確認のためだけに使います (メールアドレス、氏名、識別子の確認)</li>
		<li>
			Discord: 利用者が自分で Discord との連携や Webhook
			の登録を選んだときだけ、その送り先に通知を送ります
		</li>
		<li>
			利用者が自分で指定した Webhook の URL:
			利用者自身が管理する送り先なので、その先での扱いは利用者の責任になります
		</li>
	</ul>
	<p>これら以外に、取得した情報を第三者に販売したり、提供したりすることはありません。</p>

	<h2>6. 保存する期間</h2>
	<p>
		通知欄の記録は 90 日で消します。そのほかの情報は、アカウントを使っている間、保存します。退会
		(アカウントの削除)
		は、設定の「データの書き出しと退会」から、自分でできます。退会すると、あなたのデータをすべて消します。同じ画面で、自分のデータを書き出すこともできます。
	</p>

	<h2>7. 安全のための管理</h2>
	<p>
		Webhook の URL、署名の鍵、Discord
		のトークンなど、特に取り扱いに注意が要る情報は、暗号化して保存します。管理画面や、ログに出す情報からは、これらの値を伏せています。
	</p>

	<h2>8. 開示、訂正、削除の請求</h2>
	<p>
		自分の情報の開示、訂正、削除を求める場合は、下の連絡先にご連絡ください。本人からの請求であることを確かめたうえで、対応します。
	</p>

	<h2>9. このポリシーの変更</h2>
	<p>
		このポリシーは、必要に応じて変更することがあります。変更した場合は、このページの内容を更新し、最終更新日を書き換えます。
	</p>

	<h2>10. 連絡先</h2>
	<ul class="links">
		{#if data.contactEmail}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- メールの作成画面を開く -->
				<a href="mailto:{data.contactEmail}">{data.contactEmail}</a>
			</li>
		{/if}
		{#if data.operator}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
			<li>
				運営: <a href={data.operator.url} target="_blank" rel="noopener noreferrer"
					>{data.operator.name}</a
				>
			</li>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</ul>
</div>

<style lang="scss">
	h2 {
		margin-top: 2rem;
	}

	h3 {
		margin-top: 1.25rem;
		font-size: 1rem;
	}

	.links {
		margin: 0;
		padding: 0;
		list-style: none;

		a {
			display: inline-flex;
			align-items: center;
			min-height: 44px;
		}
	}
</style>
