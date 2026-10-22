// 管理画面で上げた PDF を受け取る。ブラウザから来るものは信用せず、大きさと先頭の印を確かめる。
// 上限は adapter-node の既定の BODY_SIZE_LIMIT (512 KB) に合わせる。これを超える PDF は、管理用コマンドで取り込む
const MAX_PDF_BYTES = 512 * 1024;
const PDF_MAGIC = '%PDF-';

type UploadResult =
	| { readonly ok: true; readonly value: Uint8Array }
	| { readonly ok: false; readonly error: string };

export async function readPdfUpload(form: FormData, name: string): Promise<UploadResult> {
	const file = form.get(name);
	if (!(file instanceof File) || file.size === 0) {
		return { ok: false, error: 'PDF のファイルを選んでください。' };
	}
	if (file.size > MAX_PDF_BYTES) {
		return {
			ok: false,
			error: 'ファイルが大きすぎます (512 KB まで)。管理用コマンドで取り込んでください。',
		};
	}
	const bytes = new Uint8Array(await file.arrayBuffer());
	const head = new TextDecoder().decode(bytes.subarray(0, PDF_MAGIC.length));
	if (head !== PDF_MAGIC) return { ok: false, error: 'PDF のファイルではありません。' };
	return { ok: true, value: bytes };
}
