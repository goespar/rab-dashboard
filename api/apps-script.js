export default async function handler(request, response) {
  const endpoint = process.env.APPS_SCRIPT_URL
  if (!endpoint) {
    response.status(503).json({ ok: false, error: 'APPS_SCRIPT_URL belum dikonfigurasi di Vercel.' })
    return
  }
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST')
    response.status(405).json({ ok: false, error: 'Metode tidak diizinkan.' })
    return
  }
  try {
    const target = new URL(endpoint)
    if (request.method === 'GET') {
      target.searchParams.set('action', String(request.query?.action || 'load'))
      if (request.query?.token) target.searchParams.set('token', String(request.query.token))
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers: request.method === 'POST' ? { 'Content-Type': 'text/plain;charset=utf-8' } : undefined,
      body: request.method === 'POST' ? (typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {})) : undefined,
      redirect: 'follow',
    })
    const text = await upstream.text()
    response.status(upstream.status).setHeader('Content-Type', 'application/json; charset=utf-8').send(text)
  } catch (error) {
    response.status(502).json({ ok: false, error: error.message || 'Google Apps Script tidak dapat dijangkau.' })
  }
}