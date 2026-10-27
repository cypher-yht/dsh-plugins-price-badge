/**
 * Host half of the price badge bundle.
 *
 * The Client module owns the rendering; this half only exposes the two Host
 * facts the badge cannot compute in the browser:
 *   - GET /plugins/price-badge/balance → DeepSeek account wallet balances
 *
 * Everything else (peak/off-peak determination and countdown) is pure clock
 * math and runs in the Client.
 */

const BALANCE_PATH = '/plugins/price-badge/balance'
const BALANCE_TTL_MS = 30000

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** DeepSeek account wallet shape → the compact form the badge renders. */
function summarizeBalance(balance) {
  if (!balance || balance.status !== 'ready') return undefined
  const wallets = Array.isArray(balance.value) ? balance.value : []
  const bonusWallets = Array.isArray(balance.bonusWallets) ? balance.bonusWallets : []
  const pick = wallets.find((wallet) => wallet?.currency === 'CNY') ?? wallets[0]
  if (!pick) return undefined
  const bonus = bonusWallets.find((wallet) => wallet?.currency === pick.currency) ?? bonusWallets[0]
  const bonusAmount = Number(bonus?.balance ?? 0)
  return {
    currency: String(pick.currency ?? 'CNY'),
    balance: String(pick.balance ?? ''),
    // 赠金为 0 时不展示，避免常态出现「赠金 ¥0.00」。
    ...(Number.isFinite(bonusAmount) && bonusAmount > 0.0001 ? { bonus: String(bonus.balance) } : {}),
  }
}

export function apply(ctx) {
  let cached
  let cachedAt = 0

  const readBalance = async (account, client) => {
    const now = Date.now()
    if (cached !== undefined && now - cachedAt < BALANCE_TTL_MS) return cached
    const balance = await account.getBalance(client)
    cached = summarizeBalance(balance)
    cachedAt = Date.now()
    return cached
  }

  const handler = async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      jsonResponse(res, 403, { error: 'local access only' })
      return
    }
    if (req.method !== 'GET') {
      jsonResponse(res, 405, { error: 'method not allowed' })
      return
    }
    const account = ctx.get?.('deepseekAccount') ?? ctx.deepseekAccount
    if (account === undefined || typeof account.getBalance !== 'function') {
      jsonResponse(res, 200, { status: 'unavailable', reason: 'account-service-missing' })
      return
    }
    try {
      const wallet = await readBalance(account, {
        version: '1.0.0',
        locale: 'zh',
        timezoneOffsetSeconds: 8 * 3600,
      })
      if (wallet === undefined) {
        jsonResponse(res, 200, { status: 'signed-out' })
        return
      }
      jsonResponse(res, 200, { status: 'ready', ...wallet })
    } catch (error) {
      jsonResponse(res, 200, {
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  ctx.inject?.(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.register({ kind: 'exact', path: BALANCE_PATH, handler }),
      'price-badge: balance endpoint',
    )
  })
}
