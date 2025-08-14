import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

type ContactForm = {
  name: string;
  email: string;
  message: string;
};

export async function POST(req: Request) {
  try {
    const body: ContactForm = await req.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Semua field wajib diisi" },
        { status: 400 }
      );
    }

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: `Pesan baru dari ${name}`,
      html: `<p>Nama: ${name}</p><p>Email: ${email}</p><p>Pesan: ${message}</p>`,
      replyTo: email,
    });

    const contactsDir = path.join(process.cwd(), "content", "contacts");
    if (!fs.existsSync(contactsDir)) fs.mkdirSync(contactsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}.json`;
    fs.writeFileSync(
      path.join(contactsDir, filename),
      JSON.stringify({ name, email, message, createdAt: timestamp }, null, 2)
    );

    const mdContent = `---
    name: ${name}
    email: ${email}
    date: ${timestamp}
    ---

${message}
`;
    fs.writeFileSync(path.join(contactsDir, `${timestamp}.md`), mdContent);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan server";
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}