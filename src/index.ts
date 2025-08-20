import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  API_KEY: string
  BIMAAKBAR_KV: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

const parseMetadata = (items: any[]) =>
  items ? items.map((item: any) => ({ ...item, metadata: JSON.parse(item.metadata as string || '{}') })) : []

const BLOCKED_IPS = ["140.213.64.174"];
const RATE_LIMIT_MS = 10_000;

// ==================== BLOG API ====================

// Get all posts
app.get('/api/posts', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const statement = c.env.DB.prepare(
      `SELECT * FROM posts 
       WHERE json_extract(metadata, '$.publish') = true 
       ORDER BY json_extract(metadata, '$.date') DESC`
    )
    const { results } = await statement.all()
    return c.json(parseMetadata(results))
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil postingan', message: e.message }, 500)
  }
})

app.get('/api/posts/:slug', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const slug = c.req.param('slug')
    const post = await c.env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first()
    if (!post) return c.json({ error: 'Postingan tidak ditemukan' }, 404)
    const metadata = typeof post.metadata === 'string' ? JSON.parse(post.metadata) : {}
    return c.json({ ...post, metadata })
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil postingan', message: e.message }, 500)
  }
})

// Get all portofolios
app.get('/api/portofolio', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const { results } = await c.env.DB.prepare('SELECT * FROM portofolio ORDER BY date DESC').all()
    return c.json(results)
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil portofolio', message: e.message }, 500)
  }
})

// Get all pages
app.get('/api/pages', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const { results } = await c.env.DB.prepare('SELECT * FROM pages').all()
    return c.json(results)
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil halaman', message: e.message }, 500)
  }
})

// Get a single page by slug
app.get('/api/pages/:slug', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const slug = c.req.param('slug')
    const page = await c.env.DB.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first()
    if (!page) return c.json({ error: 'Halaman tidak ditemukan' }, 404)
    return c.json(page)
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil halaman', message: e.message }, 500)
  }
})

// Send a contact message
app.post('/api/contact', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const { name, email, message } = await c.req.json()
    if (!name || !email || !message) return c.json({ error: 'Semua field wajib diisi' }, 400)
    await c.env.DB.prepare('INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)')
      .bind(name, email, message).run()
    return c.json({ message: 'Pesan berhasil terkirim' }, 201)
  } catch (e: any) {
    return c.json({ error: 'Gagal mengirim pesan', message: e.message }, 500)
  }
})

// Get comments for a post
app.get('/api/comments', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const postId = c.req.query('postId')
    if (!postId) return c.json({ error: 'postId diperlukan' }, 400)

    const viewCountRaw = await c.env.BIMAAKBAR_KV.get(postId)
    const views = viewCountRaw ? parseInt(viewCountRaw) : 0
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '10')
    const offset = (page - 1) * limit

    const { results: comments } = await c.env.DB.prepare(
      `SELECT id, name, message, avatar, created_at FROM comments
       WHERE post_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(postId, limit, offset).all()

    return c.json({ comments, views })
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil data komentar', message: e.message }, 500)
  }
})

// Post a new comment
app.post('/api/comments', async (c) => {
  try {
    if (!c.env.DB) return c.json({ error: 'Database binding not found' }, 500)
    const { name, message, postId, avatar } = await c.req.json()

    if (!name || !message || !postId) return c.json({ error: 'Field yang diperlukan tidak ada' }, 400)
    if (message.length > 1000) return c.json({ error: 'Pesan terlalu panjang (maks 1000 karakter)' }, 400)

    const now = Date.now()
    const limitTime = 30 * 1000
    const lastComment = await c.env.DB.prepare(
      `SELECT last_commented_at FROM comment_limits WHERE user_id = ?`
    ).bind(name).first<{ last_commented_at: string }>()

    if (lastComment) {
      const lastTime = new Date(lastComment.last_commented_at as string).getTime()
      if (now - lastTime < limitTime) {
        return c.json({ error: 'Terlalu cepat mengirim komentar, coba lagi nanti.' }, 429)
      }
    }

    const avatarUrl = (typeof avatar === 'string' && avatar.startsWith('http')) ? avatar : null
    const createdAt = new Date().toISOString()
    await c.env.DB.prepare(
      `INSERT INTO comments (post_id, name, message, avatar, created_at) VALUES (?, ?, ?, ?, ?)`
    ).bind(postId, name, message, avatarUrl, createdAt).run()

    await c.env.DB.prepare(
      `INSERT INTO comment_limits (user_id, last_commented_at) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET last_commented_at = excluded.last_commented_at`
    ).bind(name, createdAt).run()

    return c.json({ success: true }, 201)
  } catch (e: any) {
    return c.json({ error: 'Gagal mengirim komentar', message: e.message }, 500)
  }
})

// ==================== VIEW COUNTER API ====================
app.post('/api/views/:postId', async (c) => {
  try {
    const postId = c.req.param('postId')
    const ip = c.req.header('cf-connecting-ip') || 'unknown'
    const blockedIP = "140.213.64.174"

    if (ip === blockedIP) {
      const current = await c.env.BIMAAKBAR_KV.get(postId)
      const count = current ? parseInt(current) : 0
      return c.json({ postId, views: count, added: false, blocked: true })
    }

    const lastKey = `last_view:${postId}:${ip}`
    const lastViewRaw = await c.env.BIMAAKBAR_KV.get(lastKey)
    const now = Date.now()

    if (lastViewRaw) {
      const lastView = parseInt(lastViewRaw)
      if (now - lastView < VIEW_LIMIT_MS) {
        const current = await c.env.BIMAAKBAR_KV.get(postId)
        const count = current ? parseInt(current) : 0
        return c.json({ postId, views: count, added: false, blocked: false, rateLimited: true })
      }
    }

    await c.env.BIMAAKBAR_KV.put(lastKey, now.toString(), { expirationTtl: VIEW_LIMIT_MS / 1000 })

    const current = await c.env.BIMAAKBAR_KV.get(postId)
    const count = current ? parseInt(current) + 1 : 1
    await c.env.BIMAAKBAR_KV.put(postId, count.toString())

    return c.json({ postId, views: count, added: true })
  } catch (e: any) {
    return c.json({ error: 'Gagal menambah view', message: e.message }, 500)
  }
})

app.get('/api/views/:postId', async (c) => {
  try {
    const postId = c.req.param('postId')
    const current = await c.env.BIMAAKBAR_KV.get(postId)
    const count = current ? parseInt(current) : 0
    return c.json({ postId, views: count })
  } catch (e: any) {
    return c.json({ error: 'Gagal mengambil view', message: e.message }, 500)
  }
})

export default app


