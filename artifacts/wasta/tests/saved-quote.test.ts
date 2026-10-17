import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { app, logger } from '../../../server/index';
import { createDatabase, db, getOrder, useDatabase } from '../../../server/db';
import { seed } from '../../../server/seed';
import { formatDepositPercent } from '../src/lib/quote-format';

test('saved API quotes from the active SQLite seed display fractions, not percentage points', async () => {
  // Exercise the same app as artifacts/api-server's dev command, not the retained
  // legacy PostgreSQL routes. An isolated connection keeps workshop data untouched.
  logger.level = 'silent';
  useDatabase(createDatabase(':memory:'));
  seed();
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const [id, expectedDeposit, expectedLabel] of [
      ['demo-dining', 18000, '60%'],
      ['demo-bedroom', 26000, '60.19%'],
      ['demo-wardrobe', 22000, '61.11%'],
    ] as const) {
      // Both owner and private buyer routes serialize via getOrder. Request the
      // private API with an isolated seeded token; never expose it in test output.
      const response = await fetch(`http://127.0.0.1:${address.port}/api/b/${getOrder(id).token}`);
      assert.equal(response.status, 200);
      const { quote } = await response.json();
      assert.equal(quote.depositEgp, expectedDeposit);
      assert.equal(quote.depositPercent, quote.materialsEgp / quote.totalEgp);
      assert.ok(quote.depositPercent > 0 && quote.depositPercent <= 1);
      assert.equal(formatDepositPercent(quote.depositPercent), expectedLabel);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  }
});
