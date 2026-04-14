//IMPORT LIBRARY
const express = require("express"); // Framework untuk membuat server & routing
const cors = require("cors"); // Mengizinkan frontend mengakses backend (beda port)
const dotenv = require("dotenv"); // Membaca file .env (tempat API key tersimpan)
const path = require("path"); // Utility bawaan Node.js untuk menangani path file

//KONFIGURASI
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

// Membuat instance Express (ini adalah "server" kita)
const app = express();

// Menentukan port. Bisa diatur di .env, tapi default-nya 3000.
const PORT = process.env.PORT || 3000;

// Mengambil API Key dan membersihkan karakter tak terlihat (seperti \r dari Windows)
const API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const AI_MODEL = (process.env.OPENAI_MODEL || "openai/gpt-4o-mini").trim();

// Debug: Menampilkan potongan API key untuk memastikan terbaca dengan benar
if (API_KEY.length > 14) {
    console.log(
        `API Key terdeteksi: ${API_KEY.substring(0, 10)}...${API_KEY.substring(API_KEY.length - 4)} (${API_KEY.length} karakter)`
    );
} else {
    console.log("WARNING: API Key KOSONG atau terlalu pendek! Cek file .env Anda.");
}

//MIDDLEWARE
app.use(cors()); // Mengizinkan semua origin (frontend) untuk mengakses server ini
app.use(express.json()); // Mengizinkan server membaca body request berformat JSON

// Ini yang membuat server kita "monolit" - backend & frontend dilayani dari 1 server
app.use(express.static(path.join(__dirname, "../frontend")));

//SYSTEM PROMPT
const SYSTEM_PROMPT = `Kamu adalah CeritAIn, seorang teman bercerita yang hangat, penuh empati, dan pendengar yang baik.

Panduan perilaku:
- Selalu merespons dengan hangat dan penuh perhatian
- Gunakan bahasa Indonesia yang natural dan santai, seperti ngobrol dengan teman dekat
- Berikan respons yang thoughtful dan bermakna, bukan sekadar basa-basi
- Jika seseorang bercerita tentang masalah, dengarkan dulu dengan empati sebelum memberikan saran
- Boleh menggunakan emoji secukupnya untuk membuat percakapan lebih hidup 😊
- Jangan pernah menghakimi cerita atau perasaan pengguna
- Jika ditanya siapa kamu, jawab bahwa kamu adalah CeritAIn, teman AI yang siap mendengarkan cerita kapan saja
- Batasi panjang respons agar tetap nyaman dibaca (2-4 paragraf maksimal)`;

//ROUTE / ENDPOINT (STREAMING)
app.post("/api/chat", async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: "Format pesan tidak valid. Kirimkan array 'messages'.",
            });
        }

        // Memanggil OpenRouter API dengan mode STREAMING (stream: true)
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "CeritAIn",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...messages,
                ],
                temperature: 0.8,
                max_tokens: 1024,
                stream: true, // Mengaktifkan mode streaming!
            }),
        });

        // Cek error sebelum mulai streaming
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Error dari OpenRouter:", errorData);
            return res.status(response.status).json({
                error: "Maaf, terjadi kesalahan dari layanan AI.",
                detail: errorData.error?.message || JSON.stringify(errorData),
            });
        }

        // Set header agar browser tahu ini adalah stream (Server-Sent Events / SSE)
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Membaca stream dari OpenRouter dan meneruskannya ke frontend
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode potongan data & teruskan langsung ke frontend
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
        }

        res.end();
    } catch (error) {
        console.error("Error memanggil OpenRouter:", error.message);

        // Jika header belum terkirim, kirim error JSON biasa
        if (!res.headersSent) {
            res.status(500).json({
                error: "Maaf, terjadi kesalahan saat memproses pesan kamu.",
                detail: error.message,
            });
        } else {
            res.end();
        }
    }
});

// GET / - Jika ada yang mengakses root URL, arahkan ke index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

//START SERVER
if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`\nCeritAIn server berjalan di http://localhost:${PORT}`);
        console.log(`Menyajikan frontend dari: ${path.join(__dirname, "../frontend")}`);
        console.log(`Model AI: ${AI_MODEL}\n`);
    });
}

// Export app untuk Vercel
module.exports = app;