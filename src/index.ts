import { Hono } from 'hono'
import { cors } from 'hono/cors'

// Definisikan tipe Bindings
type Bindings = {
  DB: D1Database
  API_KEY: string // Untuk mengamankan endpoint POST
}

const app = new Hono<{ Bindings: Bindings }>()

// --- Middleware ---
// Aktifkan CORS untuk semua rute di bawah /api/
app.use('/api/*', cors())

// --- Helper untuk parse metadata ---
const parseMetadata = (items: any[]) => {
  return items ? items.map(item => ({
    ...item,
    metadata: JSON.parse(item.metadata as string || '{}')
  })) : []
}

// --- API Routes ---

// == POSTS ==
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

// == PORTOFOLIO ==
app.get('/api/portofolio', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM portofolio ORDER BY date DESC').all()
    return c.json(results)
  } catch (e) {
    return c.json({ error: 'Gagal mengambil portofolio' }, 500)
  }
})

// == PAGES ==
app.get('/api/pages', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM pages').all()
    return c.json(results)
  } catch (e) {
    return c.json({ error: 'Gagal mengambil halaman' }, 500)
  }
})

// == CONTACTS ==
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

// Fallback
app.get('*', (c) => c.text('Selamat Datang di Bima Akbar API'))

export default app
