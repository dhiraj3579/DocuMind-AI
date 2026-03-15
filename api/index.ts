import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Lazy load pdf-parse to prevent boot errors on Vercel
let pdfParser: any = null;
async function getPdfParser() {
  if (!pdfParser) {
    try {
      const require = createRequire(import.meta.url);
      pdfParser = require("pdf-parse");
    } catch (e) {
      console.error("Failed to load pdf-parse:", e);
      throw new Error("PDF processing library failed to load. Please contact support.");
    }
  }
  return pdfParser;
}

// In-memory vector store
interface DocumentChunk {
  id: string;
  docId: string;
  fileName: string;
  text: string;
  embedding: number[];
}

let vectorStore: DocumentChunk[] = [];
let uploadedDocuments: { id: string; name: string; type: string; size: number }[] = [];

// Initialize Gemini
let ai: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

function getAI() {
  const rawKey = process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  const cleanKey = rawKey.trim().replace(/^["']|["']$/g, "");

  if (!cleanKey || cleanKey === "YOUR_API_KEY") {
    throw new Error("Gemini API key is not configured. Please set CUSTOM_GEMINI_API_KEY in the Vercel Environment Variables.");
  }

  if (!ai || cleanKey !== currentApiKey) {
    ai = new GoogleGenAI({ apiKey: cleanKey });
    currentApiKey = cleanKey;
  }
  return ai;
}

// Multer setup for in-memory uploads
const upload = multer({ storage: multer.memoryStorage() });

// Helper: Chunk text
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

// Helper: Cosine Similarity
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// API Routes
app.get("/api/health", (req, res) => {
  const key = process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  res.json({ 
    status: "ok", 
    apiKeyMissing: !key || key === "YOUR_API_KEY",
    env: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL
  });
});

app.get("/api/documents", (req, res) => {
  res.json(uploadedDocuments);
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    let text = "";

    if (file.mimetype === "application/pdf") {
      const pdf = await getPdfParser();
      const pdfData = await pdf(file.buffer);
      text = pdfData.text;
    } else if (file.mimetype.startsWith("text/")) {
      text = file.buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Unsupported file type. Please upload PDF or Text files." });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: "Could not extract text from file." });
    }

    const docId = Math.random().toString(36).substring(7);
    const chunks = chunkText(text);
    
    const aiClient = getAI();
    const result = await aiClient.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: chunks,
    });

    const embeddings = result.embeddings;
    if (!embeddings || embeddings.length !== chunks.length) {
      throw new Error("Failed to generate embeddings for all chunks");
    }

    const newChunks: DocumentChunk[] = chunks.map((chunkText, i) => ({
      id: `${docId}-${i}`,
      docId,
      fileName: file.originalname,
      text: chunkText,
      embedding: embeddings[i].values,
    }));

    vectorStore.push(...newChunks);
    
    const docInfo = {
      id: docId,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
    };
    uploadedDocuments.push(docInfo);

    res.json({ success: true, document: docInfo, chunksProcessed: chunks.length });
  } catch (error: any) {
    console.error("Upload error:", error);
    const errorMessage = error.error?.message || error.message || "Failed to process document";
    res.status(500).json({ error: errorMessage });
  }
});

app.post("/api/query", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    if (vectorStore.length === 0) {
      return res.json({ answer: "I don't have any documents loaded yet. Please upload some documents first.", sources: [] });
    }

    const aiClient = getAI();
    
    const queryEmbedResult = await aiClient.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [query],
    });
    
    const queryEmbedding = queryEmbedResult.embeddings?.[0]?.values;
    if (!queryEmbedding) {
      throw new Error("Failed to generate query embedding");
    }

    const scoredChunks = vectorStore.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }));
    
    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 5);

    const contextText = topChunks.map(c => `[Source: ${c.fileName}]\n${c.text}`).join("\n\n---\n\n");
    
    const prompt = `You are an intelligent document assistant. Your goal is to provide helpful, accurate answers based on the provided context. 
    
    Guidelines:
    1. Use the provided context to answer the question. 
    2. If the user asks for a summary, list, or "top" items, synthesize the most relevant information from the context to provide a helpful response.
    3. If the answer is not explicitly stated but can be reasonably inferred or summarized from the context, do so.
    4. If the information is completely absent from the context, politely state that you cannot find that information in the provided documents.
    5. Always cite or mention which document the information came from if multiple are provided.

Context:
${contextText}

Question: ${query}

Answer:`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    res.json({
      answer: response.text,
      sources: topChunks.map(c => ({ fileName: c.fileName, text: c.text, score: c.score }))
    });

  } catch (error: any) {
    console.error("Query error:", error);
    const errorMessage = error.error?.message || error.message || "Failed to process query";
    res.status(500).json({ error: errorMessage });
  }
});

app.post("/api/clear", (req, res) => {
  vectorStore = [];
  uploadedDocuments = [];
  res.json({ success: true });
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else if (!process.env.VERCEL) {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global error:", err);
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  } else {
    next(err);
  }
});

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
