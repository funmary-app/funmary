// E2E のテストの前に、Google の代わりの OpenID Connect のサーバーを 1 つ立てる。
// ワーカーは並べて動くが、サーバーは 1 つだけ。次にログインする人は、ワーカーごとに分ける (support.ts の oidc)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startMockOidcServer } from '../../../packages/private/auth/src/testing/mock-oidc-server.ts';
import { E2E_DATA_DIR } from '../e2e-data-dir.ts';
import { OIDC_PORT } from '../oidc-port.ts';

export default async function globalSetup() {
	mkdirSync(E2E_DATA_DIR, { recursive: true });
	const server = await startMockOidcServer({
		clientId: 'e2e.apps.googleusercontent.com',
		clientSecret: 'e2e-client-secret',
		port: OIDC_PORT,
		// 手元では、テストのサーバーを使い回す (reuseExistingServer)。アプリは前の公開鍵を覚えているので、
		// 鍵が変わると ID トークンの検証に失敗する。立て直しても同じ鍵を使う
		keyFile: join(E2E_DATA_DIR, 'mock-oidc-key.pem'),
	});
	return () => server.close();
}
