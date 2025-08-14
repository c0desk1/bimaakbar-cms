import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  API_KEY: string
  BIMAAKBAR_KV: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

const parseMetadata = (items: any[]) => {
  return items ? items.map(item => ({
    ...item,
    metadata: JSON.parse(item.metadata as string || '{}')
  })) : []
}

app.get('/api/posts', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM posts ORDER BY createdAt DESC').all()
    return c.json(parseMetadata(results))
  } catch (e) {
    return c.json({ error: 'Gagal mengambil postingan' }, 500)
  }
})

app.get('/api/posts/:slug', async (c) => {
  const slug = c.req.param('slug')
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first()
  if (!post) return c.json({ error: 'Postingan tidak ditemukan' }, 404)
  return c.json({ ...post, metadata: JSON.parse(post.metadata as string || '{}') })
})

app.get('/api/portofolio', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM portofolio ORDER BY date DESC').all()
    return c.json(results)
  } catch (e) {
    return c.json({ error: 'Gagal mengambil portofolio' }, 500)
  }
})

app.get('/api/pages', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM pages').all()
    return c.json(results)
  } catch (e) {
    return c.json({ error: 'Gagal mengambil halaman' }, 500)
  }
})

app.post('/api/contact', async (c) => {
  try {
    const { name, email, message } = await c.req.json<{ name: string, email: string, message: string }>()
    if (!name || !email || !message) {
      return c.json({ error: 'Semua field wajib diisi' }, 400)
    }
    await c.env.DB.prepare('INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)')
      .bind(name, email, message).run()
    return c.json({ message: 'Pesan berhasil terkirim' }, 201)
  } catch (e) {
    return c.json({ error: 'Gagal mengirim pesan' }, 500)
  }
})

app.get('/api/comments', async (c) => {
	try {
	  const postId = c.req.query('postId')
	  if (!postId) return c.json({ error: 'postId diperlukan' }, 400)
  
	  if (c.req.query('incrementView') === 'true') {
		const current = await c.env.BIMAAKBAR_KV.get(postId)
		const count = current ? parseInt(current) + 1 : 1
		await c.env.BIMAAKBAR_KV.put(postId, count.toString())
	  }
  
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

app.post('/api/comments', async (c) => {
	try {
	  const { name, message, postId, avatar } = await c.req.json<{
		name: string, message: string, postId: string, avatar?: string
	  }>()
  
	  if (!name || !message || !postId) return c.json({ error: 'Field yang diperlukan tidak ada' }, 400)
	  if (message.length > 1000) return c.json({ error: 'Pesan terlalu panjang (maks 1000 karakter)' }, 400)
  
	  const now = Date.now()
	  const limitTime = 30 * 1000
	  const lastComment = await c.env.DB.prepare(
		`SELECT last_commented_at FROM comment_limits WHERE user_id = ?`
	  ).bind(name).first<{ last_commented_at: string }>()
  
	  if (lastComment) {
		const lastTime = new Date(lastComment.last_commented_at).getTime()
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

app.get('*', (c) => c.text('Selamat Datang di Bima Akbar API'))

export default app
