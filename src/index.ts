// File: src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'

// Definisikan tipe Bindings agar TypeScript tahu apa itu c.env.DB
type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// --- Middleware ---
// Izinkan akses dari semua domain (penting untuk Vercel)
app.use('/api/*', cors())

// --- Routes ---

// GET /api/posts -> Mengambil semua postingan
app.get('/api/posts', async (c) => {
  try {
    const statement = c.env.DB.prepare(
      'SELECT id, title, slug, metadata, createdAt FROM posts ORDER BY createdAt DESC'
    )
    const { results } = await statement.all()

    // Parse metadata untuk setiap post
    const posts = results.map(post => ({
      ...post,
      metadata: JSON.parse(post.metadata as string || '{}')
    }))

    return c.json(posts)
  } catch (e: any) {
    console.error(e)
    return c.json({ error: 'Gagal mengambil postingan', message: e.message }, 500)
  }
})

// GET /api/posts/:slug -> Mengambil satu postingan
app.get('/api/posts/:slug', async (c) => {
  try {
    const slug = c.req.param('slug')
    const statement = c.env.DB.prepare('SELECT * FROM posts WHERE slug = ?')
    const post = await statement.bind(slug).first()

    if (!post) {
      return c.json({ error: 'Postingan tidak ditemukan' }, 404)
    }

    // Parse metadata untuk post ini
    const responseData = {
      ...post,
      metadata: JSON.parse(post.metadata as string || '{}')
    }
    
    return c.json(responseData)
  } catch (e: any) {
    console.error(e)
    return c.json({ error: 'Gagal mengambil data postingan', message: e.message }, 500)
  }
})

// Fallback untuk route lainnya
app.get('*', (c) => c.text('Selamat Datang di Bima Akbar API'))

export default app