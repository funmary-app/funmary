<script lang="ts">
	import { TERMS_UPDATED_AT } from '#lib/legal-versions.ts';
	import SettingsBreadcrumb from '#lib/components/SettingsBreadcrumb.svelte';
	import { REPOSITORY_URL } from '#lib/repository.ts';

	let {
		data,
	}: {
		data: {
			operator: { name: string; url: string } | null;
			contactEmail: string | null;
		};
	} = $props();

	const LAST_UPDATED = TERMS_UPDATED_AT;
</script>

<svelte:head>
	<title>利用規約 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<SettingsBreadcrumb current="利用規約" public />
	<h1>利用規約</h1>
	<p class="muted">最終更新日: {LAST_UPDATED}</p>

	<p>
		この利用規約は、Funmary (以下「本サービス」)
		の利用条件を定めるものです。本サービスを利用した時点で、この規約に同意したものとみなします。
	</p>

	<h2>1. 本サービスについて</h2>
	<p>
		本サービスは、公立はこだて未来大学の学生が、自分の時間割や休講などの情報を見やすくするために、個人が開発し、運営している非公式のアプリです。大学が運営するものではなく、大学とは関係がありません。
	</p>
	<p>
		本サービスのコードは
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
		<a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">GitHub で公開</a>
		しています。中でどのような処理をしているかは、コードを読んで確かめられます。
	</p>

	<h2>2. 提供する機能</h2>
	<p>
		時間割の表示、休講・補講・教室変更の通知、カレンダーアプリへの予定の連携、Discord
		への通知、利用者が指定した URL (Webhook)
		への通知など、学生ポータルや公開シラバスの情報をもとにした機能を提供します。これらの情報は、大学や学生ポータルの都合で、形が変わったり、取得できなくなったりすることがあります。
	</p>

	<h2>3. 利用できる人</h2>
	<p>
		本サービスへのログインには、運営者が許可したメールアドレスのドメイン (大学が発行する Google
		アカウントなど)
		が必要です。登録には、運営者または既存の利用者からの招待コードが必要になる場合があります。
	</p>

	<h2>4. 禁止する行為</h2>
	<ul>
		<li>法令、または公立はこだて未来大学の規則に違反する行為</li>
		<li>本サービスのサーバーやネットワークに、通常の利用を超える負荷をかける行為</li>
		<li>他の利用者になりすます行為、他の利用者の情報を不正に取得しようとする行為</li>
		<li>本サービスの運営を妨害する行為</li>
		<li>不正アクセス、本サービスの脆弱性を悪用する行為</li>
		<li>本サービスから得た情報を、本来の目的を外れて、第三者に販売や再配布する行為</li>
	</ul>

	<h2>5. 利用者が登録する情報について</h2>
	<p>
		Discord の Webhook や、利用者が自分で用意した Webhook の URL
		など、利用者自身が登録する情報については、利用者自身の責任で管理してください。他人の個人情報を含む内容を登録しないでください。
	</p>

	<h2>6. 免責事項</h2>
	<p>
		本サービスが示す休講、補講、教室変更などの情報は、学生ポータルや公開シラバスから取得したものをそのまま伝えるもので、正確性や最新性を保証するものではありません。授業に関する最終的な確認は、必ず大学の公式な情報
		(学生ポータル、掲示、教職員への確認など)
		で行ってください。本サービスの利用によって生じた不利益について、運営者は責任を負いません。
	</p>
	<p>
		本サービスは、無償で、現状のまま提供します。事前の通知なく、機能を変更したり、一時的に停止したり、終了したりすることがあります。
	</p>

	<h2>7. 利用の停止</h2>
	<p>
		この規約に違反した、または違反するおそれがあると運営者が判断した場合、事前の通知なく、利用を停止することがあります。
	</p>

	<h2>8. 規約の変更</h2>
	<p>
		この規約は、必要に応じて変更することがあります。変更した場合は、このページの内容を更新し、最終更新日を書き換えます。
	</p>

	<h2>9. 連絡先</h2>
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
