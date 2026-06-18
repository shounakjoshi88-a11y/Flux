# MASTER BUILD PROMPT — Claude-Style AI Assistant (Flux-Based)
> Give this entire document to GLM 5.2 as context. It is your single source of truth.

---

## 0. YOUR ROLE & MISSION

You are an expert full-stack AI engineer. Your job is to help build a production-grade, Claude-style AI chat application called **[PROJECT NAME]** from scratch, using the existing **Flux** codebase as your architectural reference and pattern library.

You will write real, working, production-quality TypeScript/React code — not pseudocode, not placeholders, not "you can add X later." Every file you write must be immediately runnable.

When in doubt about implementation details, refer to Flux's patterns described in this document. Do not hallucinate libraries or APIs. If you are unsure whether something works, say so explicitly.

---

## 1. FLUX CODEBASE — FULL ARCHITECTURE REFERENCE

This is the existing project (Flux) whose patterns, structure, and code you will reuse and adapt. Study this carefully.

### 1.1 Tech Stack (Exact Versions)
```
Runtime:        Bun v1.2+
Backend:        Express 5 + TypeScript
Frontend:       React 19 + TypeScript + Vite
Styling:        Tailwind CSS v4 (CSS custom properties, no JIT config)
Animation:      Framer Motion
Database:       PostgreSQL + Prisma ORM + pgvector extension
Auth:           Supabase (JWT-based, middleware verification)
Embeddings:     BGE-M3 via @xenova/transformers (LOCAL, zero API cost)
LLM Models:     NVIDIA NIM API (free tier, OpenAI-compatible endpoint)
Web Search:     Tavily API (free tier)
Image Search:   Unsplash API (free tier)
Image Gen:      FastAPI microservice (separate Python service, Bonsai model)
Deployment:     Vercel (frontend) + Bun server (backend)
```

### 1.2 Backend Structure (`backend/`)
```
backend/
├── index.ts                  # Main Express 5 server (~3000+ lines)
├── orchestrator/
│   ├── agenticLoop.ts        # 8-step Plan-Execute-Verify loop
│   ├── planner.ts            # Generates structured plan from user query
│   ├── executor.ts           # Executes individual tool calls
│   └── verifier.ts           # Validates responses before streaming
├── skills/                   # 16 LLM skill prompts for document generation
│   ├── pptxSkill.ts
│   ├── pdfSkill.ts
│   ├── docxSkill.ts
│   └── ... (one per file type)
├── tools/
│   ├── webSearch.ts          # Tavily integration
│   ├── imageSearch.ts        # Unsplash integration
│   ├── memoryTool.ts         # Vector similarity search
│   └── calculatorTool.ts
├── memory/
│   ├── memoryManager.ts      # Importance scoring + GC
│   └── embeddings.ts         # BGE-M3 via Xenova (local)
└── prisma/
    └── schema.prisma
```

### 1.3 Frontend Structure (`frontend/src/`)
```
frontend/src/
├── pages/
│   ├── Dashboard.tsx         # Main chat page (~832 lines)
│   └── Auth.tsx              # Login/signup page
├── components/
│   ├── MessageItem.tsx       # Individual message renderer (~1200 lines)
│   ├── MessageRenderer.tsx   # Rich content: KaTeX, code, markdown
│   ├── InlineStatusTimeline.tsx  # Agentic loop status UI
│   ├── Sidebar.tsx           # Conversation list + navigation
│   ├── ChatInput.tsx         # Message input with voice/file
│   ├── ArtifactsPanel.tsx    # Generated files section
│   ├── NewsModal.tsx         # Live news with AI summaries
│   ├── PeekPanel.tsx         # Link preview panel
│   ├── SettingsPanel.tsx     # Model prefs, memory, TTS
│   ├── PptxPreview.tsx       # In-browser PPTX preview
│   └── XlsxPreview.tsx       # In-browser Excel preview
├── hooks/
│   ├── useChat.ts            # Core chat state + SSE parsing
│   ├── useTheme.ts           # Dark/light mode
│   └── useSessionRevocationListener.ts
└── lib/
    ├── api.ts                # API client
    └── supabase.ts           # Supabase client
```

### 1.4 Database Schema (Prisma)
```prisma
model User {
  id            String         @id @default(uuid())
  supabaseId    String         @unique
  email         String         @unique
  createdAt     DateTime       @default(now())
  conversations Conversation[]
  memories      Memory[]
}

model Conversation {
  id        String    @id @default(uuid())
  userId    String
  title     String    @default("New Chat")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
  user      User      @relation(fields: [userId], references: [id])
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  role           String       // "user" | "assistant" | "system"
  content        String
  metadata       Json?        // artifacts, tool calls, sources
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

model Memory {
  id          String   @id @default(uuid())
  userId      String
  content     String
  embedding   Unsupported("vector(1024)")  // BGE-M3 dimensions
  importance  Float    @default(0.5)       // 0.0 to 1.0
  accessCount Int      @default(0)
  createdAt   DateTime @default(now())
  lastAccessed DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
}
```

### 1.5 Design System (EXACT VALUES — DO NOT DEVIATE)
```css
/* Light Mode */
--bg-primary:     #faf9f5;   /* Warm cream canvas */
--bg-secondary:   #f5f3ee;   /* Slightly darker cream */
--bg-tertiary:    #eceae3;   /* Card backgrounds */
--accent-primary: #cc785c;   /* Coral — buttons, links, highlights */
--accent-hover:   #b8644a;   /* Darker coral on hover */
--text-primary:   #2c2c2c;   /* Near-black for body text */
--text-secondary: #6b6560;   /* Muted warm grey */
--border-color:   #e0ddd6;   /* Subtle warm border */

/* Dark Mode */
--bg-primary:     #1a1917;
--bg-secondary:   #201f1c;
--bg-tertiary:    #2a2925;
--text-primary:   #f0ede6;
--text-secondary: #9b9690;
--border-color:   #3a3830;

/* Typography */
body font:    Inter (UI elements, sidebar, inputs)
chat font:    Newsreader (serif — chat messages only, feels premium)
code font:    JetBrains Mono
```

### 1.6 NVIDIA NIM Integration Pattern
```typescript
// NIM uses OpenAI-compatible API — this exact pattern works
const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: modelId,          // e.g. "deepseek-ai/deepseek-r1"
    messages: messages,
    stream: true,            // Always stream
    temperature: 0.7,
    max_tokens: 4096,
  })
});
```

**Available NIM Models (free tier — use these exactly):**
```
deepseek-ai/deepseek-r1                    # Best for reasoning/agentic tasks
deepseek-ai/deepseek-r1-distill-llama-70b  # Faster reasoning
meta/llama-3.3-70b-instruct               # General purpose, fast
meta/llama-3.1-8b-instruct                # Lightweight, quick responses
microsoft/phi-4                            # Good for structured outputs
google/gemma-3-27b-it                      # Creative tasks
nvidia/llama-3.1-nemotron-ultra-253b-v1   # Most capable (slow)
mistralai/mistral-small-3.1-24b-instruct  # Balanced speed/quality
```

### 1.7 SSE Streaming Pattern (Critical — Get This Right)
```typescript
// Backend SSE setup in Express 5
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');
res.flushHeaders();

// Send SSE events like this:
const sendEvent = (event: string, data: any) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

// Event types used in Flux:
sendEvent('thinking_start', { step: 1, action: 'Planning response...' });
sendEvent('tool_call', { tool: 'web_search', query: 'user query' });
sendEvent('tool_result', { tool: 'web_search', result: {...} });
sendEvent('thinking_end', { step: 1 });
sendEvent('text_delta', { content: 'token chunk here' });
sendEvent('artifact', { type: 'pptx', filename: 'file.pptx', url: '...' });
sendEvent('done', { usage: { tokens: 500 } });
sendEvent('error', { message: 'Something went wrong' });

// Frontend SSE parsing (useChat.ts pattern):
const eventSource = new EventSource(`/api/chat/${conversationId}/stream`);
// OR use fetch + ReadableStream for POST requests (Flux uses this):
const response = await fetch('/api/chat', { method: 'POST', body: JSON.stringify(payload) });
const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        handleSSEEvent(data);
      } catch (e) { /* incomplete chunk, continue */ }
    }
  }
}
```

### 1.8 Agentic Loop — 8-Step Plan-Execute-Verify (Core Logic)
```typescript
// agenticLoop.ts — exact pattern from Flux
async function runAgenticLoop(
  userMessage: string,
  conversationHistory: Message[],
  userId: string,
  sendEvent: (event: string, data: any) => void,
  maxSteps: number = 8
) {
  let step = 0;
  let context = '';
  let thinkingContent = '';

  while (step < maxSteps) {
    step++;
    sendEvent('thinking_start', { step, total: maxSteps });

    // 1. PLAN — Ask model what to do next
    const plan = await planner.generatePlan({
      userMessage,
      history: conversationHistory,
      context,
      step,
      availableTools: TOOL_REGISTRY
    });

    // 2. CHECK if model wants to respond directly or use a tool
    if (plan.action === 'respond') {
      sendEvent('thinking_end', { step });
      // Stream final response
      await streamFinalResponse(plan.content, sendEvent);
      break;
    }

    // 3. EXECUTE the tool
    sendEvent('tool_call', { tool: plan.tool, input: plan.toolInput, step });
    const toolResult = await executor.executeTool(plan.tool, plan.toolInput, userId);
    sendEvent('tool_result', { tool: plan.tool, result: toolResult, step });

    // 4. VERIFY the result is useful
    const verification = await verifier.verify(toolResult, userMessage);
    
    if (verification.sufficient) {
      context += `\n\nTool: ${plan.tool}\nResult: ${JSON.stringify(toolResult)}`;
    }

    sendEvent('thinking_end', { step });

    // 5. FORCE answer if max steps reached
    if (step >= maxSteps) {
      await streamFinalResponse(`Based on my research: ${context}`, sendEvent);
      break;
    }
  }
}

// Tool Registry pattern:
const TOOL_REGISTRY = {
  web_search: {
    description: 'Search the web for current information',
    parameters: { query: 'string' }
  },
  memory_search: {
    description: 'Search user memory for relevant past context',
    parameters: { query: 'string' }
  },
  image_search: {
    description: 'Search for relevant images',
    parameters: { query: 'string' }
  },
  calculator: {
    description: 'Perform mathematical calculations',
    parameters: { expression: 'string' }
  },
  generate_document: {
    description: 'Generate a file (pptx, pdf, docx, xlsx, csv, md)',
    parameters: { type: 'string', content: 'object', filename: 'string' }
  }
};
```

### 1.9 Memory System Pattern
```typescript
// memoryManager.ts — how Flux handles memory
class MemoryManager {
  // Extract facts from conversation and store with embeddings
  async extractAndStore(userId: string, conversation: Message[]) {
    const facts = await this.extractFacts(conversation);  // LLM call
    
    for (const fact of facts) {
      const embedding = await generateEmbedding(fact);    // BGE-M3 local
      const importance = await this.scoreImportance(fact); // 0.0-1.0
      
      await prisma.memory.create({
        data: { userId, content: fact, embedding, importance }
      });
    }
  }

  // Semantic search using pgvector
  async search(userId: string, query: string, limit: number = 5) {
    const queryEmbedding = await generateEmbedding(query);
    
    return await prisma.$queryRaw`
      SELECT content, importance,
             1 - (embedding <=> ${queryEmbedding}::vector) as similarity
      FROM "Memory"
      WHERE "userId" = ${userId}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;
  }

  // Garbage collect low-importance, old memories
  async garbageCollect(userId: string) {
    await prisma.memory.deleteMany({
      where: {
        userId,
        importance: { lt: 0.2 },
        lastAccessed: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }
    });
  }
}
```

### 1.10 BGE-M3 Local Embeddings Pattern
```typescript
// embeddings.ts — zero cost local embeddings
import { pipeline } from '@xenova/transformers';

let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/bge-m3', {
      quantized: true  // Smaller model size
    });
  }
  return embedder;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
```

### 1.11 Security Patterns (From Flux Security Audit)
```typescript
// index.ts — security setup that MUST be included
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

app.use(helmet({
  contentSecurityPolicy: false,  // Adjust as needed for SSE
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Supabase JWT middleware — verify every protected route
async function verifySupabaseJWT(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  
  req.user = user;
  next();
}
```

---

## 2. WHAT WE'RE BUILDING — PROJECT SPECIFICATION

### 2.1 Core Vision
A production-grade AI chat assistant with:
- **Claude-quality UI** — clean, minimal, warm design (use Flux's design system exactly)
- **True agentic behavior** — thinks, uses tools, verifies before answering
- **Multi-model support** — user can switch between NIM models
- **Persistent memory** — remembers users across sessions using vector search
- **Live wiki knowledge graph** — as user chats, builds a visual knowledge graph from conversation + documents + web search (THIS IS THE KEY DIFFERENTIATOR)
- **Zero cost** — entire stack runs on free tiers

### 2.2 Key Features (Priority Order)
```
P0 — Must have day 1:
  ✅ Auth (Supabase login/signup)
  ✅ Chat interface with SSE streaming
  ✅ Sidebar with conversation history
  ✅ Agentic loop (Plan-Execute-Verify, max 8 steps)
  ✅ Web search tool (Tavily)
  ✅ Multi-model selector (NIM models)
  ✅ Markdown + code block rendering
  ✅ Persistent conversations (PostgreSQL)
  ✅ Memory system (BGE-M3 + pgvector)

P1 — Core differentiators:
  ✅ Live wiki visualizer (D3.js force graph — nodes = concepts, edges = relationships)
  ✅ Graph builds automatically from conversation + search results
  ✅ Document upload → parsed → added to knowledge graph
  ✅ Click node to see source context
  ✅ Graph persists per conversation

P2 — Polish:
  ✅ Dark/light mode
  ✅ Image search (Unsplash)
  ✅ File generation (MD, CSV, JSON inline)
  ✅ Settings panel (model, temperature, memory toggle)
  ✅ Mobile-responsive
  ✅ KaTeX math rendering
```

### 2.3 What Makes This Different from Flux
- **Wiki Visualizer** is the entire new feature — Flux has no graph visualization
- Flux is a general assistant; this is a **research-focused** assistant
- The knowledge graph is the UI centerpiece, not just a sidebar feature
- Every web search result, document chunk, and concept mentioned becomes a node
- Edges represent relationships (A "mentions" B, A "is related to" B, A "contradicts" B)

---

## 3. PROJECT STRUCTURE — BUILD EXACTLY THIS

```
project-root/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express 5 server entry
│   │   ├── orchestrator/
│   │   │   ├── agenticLoop.ts
│   │   │   ├── planner.ts
│   │   │   ├── executor.ts
│   │   │   └── verifier.ts
│   │   ├── tools/
│   │   │   ├── webSearch.ts      # Tavily
│   │   │   ├── imageSearch.ts    # Unsplash
│   │   │   ├── memoryTool.ts
│   │   │   └── calculator.ts
│   │   ├── graph/
│   │   │   ├── graphManager.ts   # Build/update knowledge graph
│   │   │   ├── nodeExtractor.ts  # LLM extracts concepts as nodes
│   │   │   └── edgeExtractor.ts  # LLM extracts relationships as edges
│   │   ├── memory/
│   │   │   ├── memoryManager.ts
│   │   │   └── embeddings.ts
│   │   ├── routes/
│   │   │   ├── chat.ts
│   │   │   ├── conversations.ts
│   │   │   ├── graph.ts          # GET graph for a conversation
│   │   │   ├── memory.ts
│   │   │   └── upload.ts
│   │   └── middleware/
│   │       ├── auth.ts           # Supabase JWT verification
│   │       └── errorHandler.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx     # Main layout
│   │   │   └── Auth.tsx
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatArea.tsx
│   │   │   │   ├── MessageItem.tsx
│   │   │   │   ├── MessageRenderer.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   └── AgenticStatusRow.tsx   # Inline tool call status
│   │   │   ├── wiki/
│   │   │   │   ├── WikiGraph.tsx          # D3.js force graph
│   │   │   │   ├── NodeDetail.tsx         # Clicked node info panel
│   │   │   │   └── GraphControls.tsx      # Zoom, filter, reset
│   │   │   └── ui/
│   │   │       ├── ModelSelector.tsx
│   │   │       ├── SettingsPanel.tsx
│   │   │       └── ThemeToggle.tsx
│   │   ├── hooks/
│   │   │   ├── useChat.ts
│   │   │   ├── useGraph.ts        # Poll/subscribe to graph updates
│   │   │   ├── useTheme.ts
│   │   │   └── useConversations.ts
│   │   └── lib/
│   │       ├── api.ts
│   │       └── supabase.ts
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## 4. DATABASE SCHEMA — FULL PRISMA SCHEMA

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

model User {
  id            String         @id @default(uuid())
  supabaseId    String         @unique
  email         String         @unique
  createdAt     DateTime       @default(now())
  conversations Conversation[]
  memories      Memory[]
}

model Conversation {
  id        String    @id @default(uuid())
  userId    String
  title     String    @default("New Chat")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
  nodes     WikiNode[]
  edges     WikiEdge[]
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  role           String
  content        String
  metadata       Json?
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}

model Memory {
  id           String   @id @default(uuid())
  userId       String
  content      String
  embedding    Unsupported("vector(1024)")
  importance   Float    @default(0.5)
  accessCount  Int      @default(0)
  createdAt    DateTime @default(now())
  lastAccessed DateTime @default(now())
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

// ——— WIKI GRAPH SCHEMA (NEW — not in Flux) ———

model WikiNode {
  id             String     @id @default(uuid())
  conversationId String
  label          String     // Concept name e.g. "Machine Learning"
  description    String?    // Brief description
  type           String     @default("concept") // concept | entity | source | document
  sourceType     String?    // "web_search" | "document" | "conversation"
  sourceUrl      String?    // URL if from web
  metadata       Json?      // Extra data
  x              Float?     // Last known graph position X
  y              Float?     // Last known graph position Y
  createdAt      DateTime   @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sourceEdges    WikiEdge[] @relation("EdgeSource")
  targetEdges    WikiEdge[] @relation("EdgeTarget")

  @@unique([conversationId, label])  // No duplicate concepts per conversation
}

model WikiEdge {
  id             String   @id @default(uuid())
  conversationId String
  sourceId       String
  targetId       String
  relationship   String   // "mentions", "related_to", "contradicts", "supports", "defines"
  weight         Float    @default(1.0)
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  source         WikiNode @relation("EdgeSource", fields: [sourceId], references: [id], onDelete: Cascade)
  target         WikiNode @relation("EdgeTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([sourceId, targetId, relationship])
}
```

---

## 5. BACKEND — DETAILED IMPLEMENTATION

### 5.1 Main Server (index.ts)
```typescript
// Structure to follow — write the full implementation
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

// Routes
import chatRouter from './routes/chat';
import conversationsRouter from './routes/conversations';
import graphRouter from './routes/graph';
import memoryRouter from './routes/memory';
import uploadRouter from './routes/upload';

export const prisma = new PrismaClient();
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const app = express();

// Security middleware (exact order matters)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Routes
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/graph', graphRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/upload', uploadRouter);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(3000, () => console.log('Server running on port 3000'));
```

### 5.2 Chat Route with SSE (routes/chat.ts)
```typescript
// This is the most critical route — SSE streaming with agentic loop
router.post('/', verifySupabaseJWT, async (req, res) => {
  const { message, conversationId, modelId } = req.body;
  const userId = req.user.id;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    // 1. Save user message to DB
    await prisma.message.create({
      data: { conversationId, role: 'user', content: message }
    });

    // 2. Get conversation history
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20  // Last 20 messages for context
    });

    // 3. Search relevant memories
    const memories = await memoryManager.search(userId, message);
    sendEvent('memories_loaded', { count: memories.length });

    // 4. Run agentic loop
    let fullResponse = '';
    await runAgenticLoop(message, history, userId, modelId, memories, {
      onThinkingStart: (step) => sendEvent('thinking_start', { step }),
      onToolCall: (tool, input) => sendEvent('tool_call', { tool, input }),
      onToolResult: (tool, result) => sendEvent('tool_result', { tool, result }),
      onThinkingEnd: (step) => sendEvent('thinking_end', { step }),
      onTextDelta: (delta) => {
        fullResponse += delta;
        sendEvent('text_delta', { content: delta });
      },
      onGraphUpdate: (nodes, edges) => sendEvent('graph_update', { nodes, edges }),
    });

    // 5. Save assistant response
    await prisma.message.create({
      data: { conversationId, role: 'assistant', content: fullResponse }
    });

    // 6. Update conversation title if first message
    await updateConversationTitle(conversationId, message);

    // 7. Extract and store memories async (don't block response)
    memoryManager.extractAndStore(userId, [...history, 
      { role: 'user', content: message },
      { role: 'assistant', content: fullResponse }
    ]).catch(console.error);

    sendEvent('done', { success: true });
    res.end();

  } catch (error) {
    sendEvent('error', { message: error.message });
    res.end();
  }
});
```

### 5.3 Knowledge Graph Manager (graph/graphManager.ts)
```typescript
// This is the NEW feature — build wiki graph from conversation
export class GraphManager {
  
  // Called after each assistant response with the response text + sources
  async updateGraph(
    conversationId: string,
    responseText: string,
    sources: WebSearchResult[],
    userQuery: string
  ): Promise<{ nodes: WikiNode[], edges: WikiEdge[] }> {
    
    // 1. Extract concepts from the response using LLM
    const concepts = await this.extractConcepts(responseText, userQuery);
    
    // 2. Extract relationships between concepts
    const relationships = await this.extractRelationships(concepts, responseText);
    
    // 3. Add source nodes from web search results
    const sourceNodes = sources.map(source => ({
      label: source.title,
      type: 'source',
      sourceUrl: source.url,
      description: source.snippet
    }));

    // 4. Upsert all nodes (avoid duplicates per conversation)
    const createdNodes = await this.upsertNodes(conversationId, [
      ...concepts.map(c => ({ label: c.name, description: c.description, type: 'concept' })),
      ...sourceNodes
    ]);

    // 5. Create edges
    const createdEdges = await this.upsertEdges(conversationId, relationships, createdNodes);

    return { nodes: createdNodes, edges: createdEdges };
  }

  private async extractConcepts(text: string, query: string): Promise<Array<{name: string, description: string}>> {
    // NIM LLM call to extract key concepts
    const prompt = `Extract the key concepts, entities, and topics from this text.
Return ONLY a JSON array with format: [{"name": "Concept Name", "description": "brief description"}]
Limit to 8 most important concepts.
Text: ${text.slice(0, 2000)}`;
    
    const response = await callNIM(prompt, 'meta/llama-3.1-8b-instruct');
    return JSON.parse(response);
  }

  private async extractRelationships(
    concepts: Array<{name: string}>,
    text: string
  ): Promise<Array<{source: string, target: string, relationship: string}>> {
    // NIM LLM call to find relationships between concepts
    const conceptNames = concepts.map(c => c.name).join(', ');
    const prompt = `Given these concepts: ${conceptNames}
Find relationships between them from this text.
Return ONLY a JSON array: [{"source": "A", "target": "B", "relationship": "related_to"}]
Relationship types: mentions, related_to, contradicts, supports, defines, is_part_of
Text: ${text.slice(0, 2000)}`;
    
    const response = await callNIM(prompt, 'meta/llama-3.1-8b-instruct');
    return JSON.parse(response);
  }

  private async upsertNodes(conversationId: string, nodes: any[]): Promise<WikiNode[]> {
    const results = [];
    for (const node of nodes) {
      const result = await prisma.wikiNode.upsert({
        where: { conversationId_label: { conversationId, label: node.label } },
        update: { description: node.description },
        create: { conversationId, ...node }
      });
      results.push(result);
    }
    return results;
  }

  private async upsertEdges(
    conversationId: string,
    relationships: any[],
    nodes: WikiNode[]
  ): Promise<WikiEdge[]> {
    const nodeMap = Object.fromEntries(nodes.map(n => [n.label, n.id]));
    const results = [];
    
    for (const rel of relationships) {
      const sourceId = nodeMap[rel.source];
      const targetId = nodeMap[rel.target];
      if (!sourceId || !targetId) continue;
      
      const result = await prisma.wikiEdge.upsert({
        where: { sourceId_targetId_relationship: { sourceId, targetId, relationship: rel.relationship } },
        update: { weight: { increment: 0.1 } },  // Strengthen existing edges
        create: { conversationId, sourceId, targetId, relationship: rel.relationship }
      });
      results.push(result);
    }
    return results;
  }
}
```

---

## 6. FRONTEND — DETAILED IMPLEMENTATION

### 6.1 Layout (Dashboard.tsx)
```
Layout structure (use CSS Grid):

┌─────────────────────────────────────────────────────────┐
│                     HEADER (60px)                        │
├──────────────┬──────────────────────┬────────────────────┤
│   SIDEBAR    │      CHAT AREA       │   WIKI GRAPH       │
│   (280px)    │    (flex: 1)         │   (380px)          │
│              │                      │                    │
│ Conversations│  Messages + Input    │  D3.js Force Graph │
│ New Chat btn │                      │  Node Detail Panel │
│ Model select │                      │  Graph Controls    │
│ Settings     │                      │                    │
└──────────────┴──────────────────────┴────────────────────┘

Mobile: Stack vertically, wiki graph becomes a modal/drawer
```

### 6.2 WikiGraph Component (components/wiki/WikiGraph.tsx)
```typescript
// D3.js Force-Directed Graph — the key visual differentiator
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';

interface GraphData {
  nodes: WikiNode[];
  edges: WikiEdge[];
}

export function WikiGraph({ conversationId }: { conversationId: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<WikiNode | null>(null);

  // Poll for graph updates every 3 seconds while chat is active
  useEffect(() => {
    const fetchGraph = async () => {
      const res = await fetch(`/api/graph/${conversationId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const data = await res.json();
      setGraphData(data);
    };
    
    fetchGraph();
    const interval = setInterval(fetchGraph, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  // D3 force simulation
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();  // Clear on re-render

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Simulation
    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.edges).id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Zoom behavior
    const zoom = d3.zoom().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoom as any);

    const g = svg.append('g');

    // Draw edges
    const link = g.append('g')
      .selectAll('line')
      .data(graphData.edges)
      .join('line')
      .attr('stroke', 'var(--border-color)')
      .attr('stroke-width', (d: any) => Math.sqrt(d.weight))
      .attr('stroke-opacity', 0.6);

    // Edge labels
    const edgeLabel = g.append('g')
      .selectAll('text')
      .data(graphData.edges)
      .join('text')
      .attr('font-size', '9px')
      .attr('fill', 'var(--text-secondary)')
      .text((d: any) => d.relationship);

    // Draw nodes
    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .join('circle')
      .attr('r', (d: any) => d.type === 'source' ? 8 : 14)
      .attr('fill', (d: any) => {
        switch(d.type) {
          case 'concept': return 'var(--accent-primary)';   // Coral
          case 'source':  return '#6366f1';                  // Indigo
          case 'entity':  return '#10b981';                  // Green
          default:        return 'var(--accent-primary)';
        }
      })
      .attr('stroke', 'var(--bg-primary)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => setSelectedNode(d))
      .call(d3.drag()
        .on('start', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d: any) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }) as any);

    // Node labels
    const label = g.append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .join('text')
      .attr('font-size', '11px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('fill', 'var(--text-primary)')
      .attr('text-anchor', 'middle')
      .attr('dy', '2.5em')
      .text((d: any) => d.label.length > 15 ? d.label.slice(0, 12) + '...' : d.label);

    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      
      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);
      
      label
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
      
      edgeLabel
        .attr('x', (d: any) => ((d.source.x + d.target.x) / 2))
        .attr('y', (d: any) => ((d.source.y + d.target.y) / 2));
    });

    return () => simulation.stop();
  }, [graphData]);

  return (
    <div className="wiki-graph-container" style={{ 
      width: '100%', height: '100%', 
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-color)',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Knowledge Graph
        </h3>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {graphData.nodes.length} concepts · {graphData.edges.length} relationships
        </p>
      </div>

      {/* Graph */}
      {graphData.nodes.length === 0 ? (
        <div style={{ 
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 'calc(100% - 60px)', color: 'var(--text-secondary)',
          fontSize: '13px', textAlign: 'center', padding: '20px'
        }}>
          Start chatting to build your knowledge graph
        </div>
      ) : (
        <svg ref={svgRef} style={{ width: '100%', height: 'calc(100% - 60px)' }} />
      )}

      {/* Node detail panel */}
      {selectedNode && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-color)',
          padding: '12px 16px',
          maxHeight: '200px', overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13px', color: 'var(--accent-primary)' }}>
              {selectedNode.label}
            </strong>
            <button onClick={() => setSelectedNode(null)} style={{ 
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '16px'
            }}>×</button>
          </div>
          {selectedNode.description && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {selectedNode.description}
            </p>
          )}
          {selectedNode.sourceUrl && (
            <a href={selectedNode.sourceUrl} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: '11px', color: 'var(--accent-primary)', display: 'block', marginTop: '6px' }}>
              View source →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
```

### 6.3 Agentic Status Row (components/chat/AgenticStatusRow.tsx)
```typescript
// Shows inline status during agentic loop execution
// e.g. "🔍 Searching web for quantum computing..." 
//      "🧠 Analyzing 3 sources..."
//      "✅ Found relevant information"

interface AgenticEvent {
  type: 'thinking_start' | 'tool_call' | 'tool_result' | 'thinking_end';
  step?: number;
  tool?: string;
  input?: any;
  result?: any;
}

export function AgenticStatusRow({ events }: { events: AgenticEvent[] }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '4px',
      padding: '8px 12px',
      background: 'var(--bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginBottom: '8px'
    }}>
      {events.map((event, i) => (
        <StatusLine key={i} event={event} />
      ))}
    </div>
  );
}

function StatusLine({ event }: { event: AgenticEvent }) {
  const getIcon = () => {
    if (event.type === 'tool_call') {
      switch(event.tool) {
        case 'web_search': return '🔍';
        case 'memory_search': return '🧠';
        case 'image_search': return '🖼️';
        case 'calculator': return '🔢';
        default: return '⚙️';
      }
    }
    if (event.type === 'tool_result') return '✅';
    if (event.type === 'thinking_start') return '💭';
    return '•';
  };

  const getText = () => {
    if (event.type === 'tool_call' && event.tool === 'web_search') {
      return `Searching for "${event.input?.query}"`;
    }
    if (event.type === 'tool_call' && event.tool === 'memory_search') {
      return 'Checking memory...';
    }
    if (event.type === 'tool_result') {
      return `Got results from ${event.tool?.replace('_', ' ')}`;
    }
    if (event.type === 'thinking_start') {
      return `Step ${event.step}: Planning...`;
    }
    return '';
  };

  return (
    <div style={{ 
      display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '12px', color: 'var(--text-secondary)'
    }}>
      <span>{getIcon()}</span>
      <span>{getText()}</span>
    </div>
  );
}
```

### 6.4 Sidebar (components/layout/Sidebar.tsx)
```typescript
// Claude-style sidebar with conversation list
// Features:
// - "New Chat" button at top
// - Search conversations
// - Group by Today / Yesterday / Last 7 days / Older
// - Active conversation highlighted with coral accent
// - Hover to show delete button
// - Model selector at bottom
// - Settings gear icon at bottom

// Design: width 280px, dark bg in dark mode (--bg-secondary)
// Conversations list items: 
//   - Title (truncated to 1 line)
//   - Timestamp (relative: "2 hours ago")
//   - On hover: show delete X button
// Active item: left border 2px solid var(--accent-primary), 
//              bg: var(--bg-tertiary)
```

---

## 7. KEY ENVIRONMENT VARIABLES

```env
# Backend .env
DATABASE_URL=postgresql://...
NVIDIA_NIM_API_KEY=nvapi-...
TAVILY_API_KEY=tvly-...
UNSPLASH_ACCESS_KEY=...
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
FRONTEND_URL=http://localhost:5173

# Frontend .env
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3000
```

---

## 8. BUILD ORDER — FOLLOW THIS EXACTLY

Build in this sequence. Do not skip ahead. Each phase must fully work before starting next.

### Phase 1: Foundation (Day 1-2)
1. Init Bun + Express 5 backend with TypeScript
2. Set up Prisma schema + migrations (include WikiNode/WikiEdge tables)
3. Set up Supabase auth middleware
4. Basic NIM API wrapper (test with simple completion)
5. SSE endpoint skeleton (returns "hello" events)
6. React 19 + Vite + Tailwind v4 frontend setup
7. Supabase auth UI (login/signup pages)
8. Basic layout: Sidebar + ChatArea (no wiki graph yet)

### Phase 2: Core Chat (Day 3-4)
1. Full SSE streaming chat endpoint
2. Message persistence (save user + assistant messages)
3. Conversation CRUD (create, list, delete, auto-title)
4. MessageRenderer: markdown, code blocks
5. ChatInput with send functionality
6. useChat hook (SSE parsing, state management)
7. Conversation switching in sidebar

### Phase 3: Agentic Loop (Day 5-6)
1. Planner (NIM call → structured plan)
2. Executor (route to correct tool)
3. Web search tool (Tavily)
4. Verifier (check if result sufficient)
5. Full agenticLoop.ts tying it together
6. AgenticStatusRow component (show tool calls inline)
7. Test end-to-end: ask a question requiring web search

### Phase 4: Memory (Day 7)
1. BGE-M3 embeddings via Xenova (local)
2. pgvector setup in PostgreSQL
3. MemoryManager (extract, store, search, GC)
4. Wire memory into agentic loop context
5. Memory route (view/delete memories)

### Phase 5: Wiki Graph (Day 8-9) ← THE DIFFERENTIATOR
1. NodeExtractor (NIM call → concepts JSON)
2. EdgeExtractor (NIM call → relationships JSON)
3. GraphManager (upsert nodes/edges to DB)
4. Graph API route (GET /api/graph/:conversationId)
5. Wire graph updates into chat route (after each response)
6. WikiGraph component (D3.js force graph)
7. NodeDetail panel
8. Real-time polling (3s interval)

### Phase 6: Polish (Day 10-11)
1. Dark/light mode toggle
2. Model selector UI (switch between NIM models mid-chat)
3. Settings panel (temperature, memory toggle)
4. Mobile responsive layout
5. KaTeX math rendering
6. Error states and loading skeletons
7. README + deployment

---

## 9. CODING STANDARDS — NON-NEGOTIABLE

1. **Full TypeScript** — no `any` unless absolutely necessary, always type properly
2. **No incomplete code** — every function must be fully implemented, no `// TODO` placeholders
3. **Error handling** — every async function must have try/catch
4. **SSE safety** — always check `!res.writableEnded` before writing to response
5. **No memory leaks** — clean up D3 simulations, intervals, event listeners on unmount
6. **Tailwind v4** — use CSS custom properties (`var(--accent-primary)`), not hardcoded colors
7. **Framer Motion** — use for all panel open/close, message appear animations
8. **React 19** — use proper hooks, no class components
9. **Bun** — use `Bun.serve` patterns where appropriate, not Node-specific APIs
10. **Design system** — use EXACT hex values from section 1.5, no deviations

---

## 10. ZERO-COST CONSTRAINTS

Every external service must have a free tier. Never suggest paid-only solutions.

```
✅ NVIDIA NIM API     — free tier (rate limited but sufficient)
✅ Supabase           — free tier (500MB DB, 50k MAU)
✅ Tavily             — free tier (1000 searches/month)
✅ Unsplash           — free tier (50 requests/hour)
✅ Vercel             — free tier (frontend hosting)
✅ BGE-M3 embeddings  — completely free (runs locally via Xenova)
✅ D3.js              — open source library
✅ PostgreSQL         — self-hosted or Supabase free tier
❌ OpenAI API         — DO NOT USE (costs money)
❌ Pinecone           — DO NOT USE (use pgvector instead)
❌ LangChain          — DO NOT USE (build own agentic loop)
❌ Vercel AI SDK      — DO NOT USE (build own SSE)
```

---

## 11. WHAT TO ASK ME (GLM) — CONVERSATION PROTOCOL

When we start building, give me one phase at a time. Say:

**"Start Phase 1. Write the complete backend setup: package.json, tsconfig.json, prisma schema, index.ts server, and auth middleware. All files complete, no placeholders."**

I will write every file in full. Do not ask me to summarize or skip sections. If a file is too long, ask me to continue. After each phase is complete and tested locally, move to the next phase.

If something breaks, paste the exact error message and I will debug it.

If you want to change something from this spec, tell me explicitly and I will adapt.

---

## 12. QUICK REFERENCE — MOST COMMON PATTERNS

### NIM completion (non-streaming):
```typescript
async function callNIM(prompt: string, model: string = 'meta/llama-3.1-8b-instruct'): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.NVIDIA_NIM_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
      stream: false
    })
  });
  const data = await res.json();
  return data.choices[0].message.content;
}
```

### Tavily web search:
```typescript
async function webSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'basic',
      max_results: 5
    })
  });
  const data = await res.json();
  return data.results;
}
```

### Safe JSON parse from LLM:
```typescript
function safeParseJSON(text: string, fallback: any = []) {
  try {
    // Strip markdown code blocks if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}
```

---

*End of Master Build Prompt. Give this entire document to GLM 5.2 as your first message, then follow the build order in section 8.*
