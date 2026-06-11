<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%23cc785c' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 16C5 6 8 18 11 10S17 6 22 12' /%3E%3C/svg%3E">
    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%23cc785c' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 16C5 6 8 18 11 10S17 6 22 12' /%3E%3C/svg%3E" width="80" height="80" alt="Flux">
  </picture>
  <br>
  <h1 style="margin: 0; font-size: 3em; font-weight: 400; letter-spacing: -1px;">Flux</h1>
  <p style="font-size: 1.15em; color: #6c6a64; margin-top: 4px;">
    <em>Multi-model AI chat · Document generation · Web search · Long-term memory</em>
  </p>
</div>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/Explore_Features-%23cc785c?style=flat-square" alt="Features"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-%23141413?style=flat-square" alt="Quick Start"></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Architecture-%23141413?style=flat-square" alt="Architecture"></a>
  <a href="#api-reference"><img src="https://img.shields.io/badge/API_Reference-%23141413?style=flat-square" alt="API Reference"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Bun-%23cc785c?logo=bun&style=flat-square" alt="Bun">
  <img src="https://img.shields.io/badge/LLM-NVIDIA_NIM-76b900?logo=nvidia&style=flat-square" alt="NVIDIA NIM">
  <img src="https://img.shields.io/badge/database-PostgreSQL_%2B_pgvector-4169e1?logo=postgresql&style=flat-square" alt="PostgreSQL + pgvector">
  <img src="https://img.shields.io/badge/auth-Supabase-3ecf8e?logo=supabase&style=flat-square" alt="Supabase">
  <img src="https://img.shields.io/badge/frontend-React_19-61dafb?logo=react&style=flat-square" alt="React 19">
  <img src="https://img.shields.io/badge/css-Tailwind_CSS-06b6d4?logo=tailwindcss&style=flat-square" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/search-Tavily-ff6b6b?style=flat-square" alt="Tavily">
  <img src="https://img.shields.io/badge/deploy-Vercel-black?logo=vercel&style=flat-square" alt="Vercel">
</p>

---

<h2 id="preview">📸 Preview</h2>

<table>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20162613.png" alt="Flux Dashboard" width="100%">
      <br><em>Main chat interface with warm design system</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163312.png" alt="Flux Chat UI" width="100%">
      <br><em>Smooth Chat UI</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20162914.png" alt="Flux News" width="100%">
      <br><em>Live News section with AI summary on article click</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/AI%20news%20Summary.png" alt="Flux AI News Summary" width="100%">
      <br><em>AI news summary for any article</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/image%20generation%20capability.png" alt="Flux Image Generation" width="100%">
      <br><em>AI-powered image generation capability</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20162856.png" alt="Flux Artifacts" width="100%">
      <br><em>Artifacts Section — browse all uploaded & generated files</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" colspan="2">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163321.png" alt="Flux Links" width="50%">
      <br><em>Links stored per prompt within a thread</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163412.png" alt="Flux Prompt History Card Open" width="100%">
      <br><em>Prompt History card — quick access to past prompts</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163423.png" alt="Flux Prompt History Closed" width="100%">
      <br><em>Prompt History card closed — minimal UI</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163449.png" alt="Flux Settings" width="100%">
      <br><em>Settings Panel — theme, model prefs & more</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163459.png" alt="Flux Session Management" width="100%">
      <br><em>Session management implementation</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163511.png" alt="Flux Memory" width="100%">
      <br><em>Memory management — view all stored memories</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/shounakjoshi88-a11y/Flux/raw/main/screenshots/Screenshot%202026-06-11%20163527.png" alt="Flux Memory Types" width="100%">
      <br><em>Memories grouped by type</em>
    </td>
  </tr>
</table>

---

**Flux** is a full-stack AI chat application that connects you to 20+ large language models via NVIDIA NIM, with built-in document generation, real-time web search, long-term memory, voice I/O, news aggregation, and image generation — all wrapped in a warm, responsive interface inspired by Anthropic's design language.

Whether you need a quick answer, a polished presentation deck, an Excel spreadsheet, a code review, or a deep research brief, Flux orchestrates tool use across multiple AI models to get it done.

---

<h2 id="features">✨ Features</h2>

<details open>
<summary><strong>🤖 Multi-Model Chat</strong></summary>
<br>
Switch between 20+ models from a unified chat interface:

| Category | Models |
|----------|--------|
| **General Purpose** | Llama 4 Maverick, Mistral Large 675B, Nemotron 3 Ultra 550B, DeepSeek V4 Flash, Qwen 3.5 397B, GLM 5.1, Kimi K2.6, Step 3.7 Flash, MiniMax M2.7, Command R+ |
| **Vision** | Nemotron Nano 12B V2 VL, Kimi K2.6 — handle image attachments |
| **Coding** | Specialized models for code generation and review |

Each model streams responses in real-time via SSE, with visible thought process and source attribution.
</details>

<details>
<summary><strong>📄 Document Generation</strong></summary>
<br>
Generate professional documents from plain English descriptions:

| Format | Templates | Library |
|--------|-----------|---------|
| **PDF** | Corporate (navy/blue), Minimal (clean white), Creative (teal/indigo), Report (academic) | pdf-lib |
| **DOCX** | Professional headings & body sections | docx |
| **PPTX** | Dark-theme slide decks with title, bullet, comparison, and section layouts | pptxgenjs |
| **XLSX / CSV / TSV** | Formatted spreadsheets and delimited data | xlsx |
| **Markdown / JSON / SQL / HTML** | Structured text documents | — |

Documents are built server-side by LLM-driven generation with format-specific skill prompts, retry logic, and fallback data generation.
</details>

<details>
<summary><strong>🔧 Agentic Tool System</strong></summary>
<br>
The AI autonomously orchestrates tool calls to answer your queries:

- **Web Search** — Real-time search via Tavily with source attribution
- **Document Generation** — Create files in 10 formats from natural language
- **Weather Lookup** — Current conditions via OpenWeatherMap + Open-Meteo
- **Image Generation** — Produce images via local Bonsai inference service
- **Skill Reading** — Load format-specific skill prompts for better output quality

Up to 8 autonomous reasoning steps per query, with dynamic system prompting and forced answer fallback.
</details>

<details>
<summary><strong>🧠 Long-Term Memory</strong></summary>
<br>
Flux remembers what matters:

- **Automatic Extraction** — LLM extracts key facts from conversations in the background
- **Vector Storage** — 1024-dimensional embeddings via BGE-M3 (local, Xenova Transformers)
- **Similarity Search** — pgvector `<=>` operator for fast semantic retrieval
- **Importance Scoring** — Memories ranked by relevance; low-importance junk gets pruned
- **Deduplication** — Near-duplicate detection using embedding distance thresholds
- **Context Injection** — Relevant memories automatically injected into system prompts
</details>

<details>
<summary><strong>🎤 Voice I/O</strong></summary>
<br>

- **Speech-to-Text** — NVIDIA ASR (Parakeet 1.1B multilingual) for transcribing voice input
- **Text-to-Speech** — Microsoft Edge TTS with 100+ voices across languages
- **Browser Recording** — In-browser speech recognition via the Web Speech API
</details>

<details>
<summary><strong>📰 News Aggregation</strong></summary>
<br>
Multi-source news reader built right in:

- **Sources** — BBC, NPR, Reuters, CNN, Ars Technica, Wired, HackerNews, and more
- **Categories** — All, World, Tech, Business, Science, Politics
- **Caching** — Server-side RSS caching with configurable TTL
- **HackerNews Integration** — Top stories fetched via the official Firebase API
</details>

<details>
<summary><strong>🔍 RAG & Content Safety</strong></summary>
<br>

- **RAG Search** — NVIDIA Nemo Retriever models for embedding (`llama-3.2-nemoretriever-1b-vlm-embed-v1`) and reranking (`llama-3.2-nemoretriever-500m-rerank-v2`)
- **Content Safety** — NVIDIA Nemotron content safety classification filters unsafe inputs before they reach the model
- **Article Summarization** — Summarize any URL with optional full-text extraction
- **Web Proxy** — In-app iframe preview of articles with CSP stripping and paywall/cookie notice hiding
</details>

<details>
<summary><strong>💬 Conversation Management</strong></summary>
<br>

- **Searchable History** — Full-text search across all conversations with PostgreSQL FTS + trigram fuzzy matching
- **Auto-Titling** — Conversations are automatically renamed based on content
- **Time Grouping** — Sidebar groups conversations by Today, Yesterday, This Week, etc.
- **Undo Delete** — Deleted conversations can be restored via toast notification
- **Artifacts Gallery** — Browse every generated file across all conversations in one place
</details>

<details>
<summary><strong>🎨 Design & UX</strong></summary>
<br>

- **Warm Design System** — Cream canvas (`#faf9f5`), coral primary (`#cc785c`), slab-serif display typography
- **Dark Mode** — Dark navy surfaces on warm dark canvas with automatic theme detection
- **Responsive** — Adaptive layout for desktop and tablet with animated sidebar (framer-motion spring)
- **Auth** — Google and GitHub OAuth via Supabase with session management
- **Settings** — Theme toggle, model preferences, and more in a slide-out panel
- **Keyboard Navigation** — Search modal, quick actions, and keyboard shortcuts throughout
</details>

---

<h2 id="quick-start">⚡ Quick Start</h2>

### Prerequisites

- [Bun](https://bun.sh) v1.2+
- A PostgreSQL database (or [Supabase](https://supabase.com) project)
- API keys (see configuration below)

### Installation

```bash
# Clone the repository
git clone https://github.com/shounakjoshi88-a11y/Flux.git
cd Flux

# Install all dependencies
cd backend && bun install
cd ../frontend && bun install

# Generate Prisma client
cd ../backend && bunx prisma generate
```

### Environment Variables

Create `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# Auth
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
SUPABASE_API_SECRET=your_supabase_service_role_key

# AI Providers
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_key
NIM_API_KEY=your_nvidia_nim_api_key

# Search & Data
TAVILY_API_KEY=your_tavily_api_key
OPENWEATHER_API_KEY=your_openweathermap_api_key

# Image Generation
IMAGE_SERVICE_URL=http://127.0.0.1:8001
BONSAI_MODELS_DIR=./image_generation_backend/models
```

### Run Locally

```bash
# Terminal 1 — Backend (Express on Bun)
cd backend && bun index.ts
# → http://localhost:3001

# Terminal 2 — Frontend (Bun dev server with HMR)
cd frontend && bun dev
# → http://localhost:3000
```

### Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

The `vercel.json` configuration handles Bun installation, frontend build with Tailwind, serverless function routing, and static file serving.

### Database Setup

Flux requires PostgreSQL with `pgvector` extension for embeddings:

**Option A: Supabase (Recommended)**
1. Create a project on [Supabase](https://supabase.com)
2. Copy the connection string to `DATABASE_URL` in `backend/.env`
3. Run `bunx prisma migrate dev --name init`

**Option B: Local PostgreSQL**
```bash
# Install PostgreSQL 14+
# Enable pgvector extension
createdb flux
psql flux -c "CREATE EXTENSION IF NOT EXISTS vector"

# Set DATABASE_URL
export DATABASE_URL="postgresql://postgres:password@localhost:5432/flux"

# Run migrations
bunx prisma migrate dev --name init
```

---

<h2 id="architecture">🏗️ Architecture</h2>

```
                    ┌─────────────────────────┐
                    │      React 19 SPA       │
                    │  Dashboard · Auth ·      │
                    │  Sidebar · Settings ·    │
                    │  Artifacts · News        │
                    └───────────┬─────────────┘
                                │ HTTP / SSE
                    ┌───────────┴─────────────┐
                    │     Express 5 (Bun)     │
                    │                         │
                    │  POST /flux_ask ◄───────┼── Agentic loop (max 8 steps)
                    │  GET  /conversations    │     ├ web_search (Tavily)
                    │  POST /conversations/new│     ├ generate_document
                    │  GET  /news             │     ├ get_weather
                    │  GET  /memories         │     ├ generate_image (Bonsai)
                    │  GET  /artifacts        │     └ read_skill
                    │  POST /summarize        │
                    │  POST /api/tts          │
                    └───────┬─────────────────┘
                            │
          ┌─────────────────┼─────────────────────┐
          │                 │                     │
   ┌──────┴──────┐  ┌──────┴──────┐  ┌───────────┴───────┐
   │  PostgreSQL  │  │ NVIDIA NIM │  │     Tavily        │
   │  + pgvector  │  │ 20+ models │  │   Web Search API  │
   │  + Prisma    │  │ + RAG/Safe │  │                   │
   └──────┬───────┘  └────────────┘  └───────────────────┘
          │
   ┌──────┴───────┐
   │   Supabase   │
   │  Auth (OAuth)│
   └──────────────┘
```

**Request flow:**

1. User types a message → frontend sends `POST /flux_ask` with query, model ID, conversation history, and optional attachments
2. Server constructs a system prompt with memory context, datetime, location, and relevant skill files
3. The LLM (via NVIDIA NIM) responds with streaming text, interleaved with tool call requests
4. The server executes tool calls (web search, document generation, weather, image gen) and feeds results back to the model
5. After up to 8 agentic steps, the final answer streams to the frontend with sources, thought process, follow-up questions, and any generated files
6. Messages and metadata are persisted to PostgreSQL; memories are extracted asynchronously

### Agentic Loop Details

The `/flux_ask` endpoint orchestrates up to 8 reasoning steps:

1. **Plan** — Analyze user intent and select tools
2. **Execute** — Run web search, document generation, weather, image gen, or read skills
3. **Verify** — Check if results meet criteria (has sources, files, or sufficient content)
4. **Iterate** — If verification fails, retry the same tool or try alternatives
5. **Finalize** — Stream final answer with sources, follow-up questions, and artifacts

**SSE Events Streamed:**
- `status` — Tool execution status (`searching`, `generating_document`, etc.)
- `thought` — Visible reasoning process
- `message` — Text chunks (streamed character-by-character)
- `sources` — URLs with trust scores
- `file` — Generated artifacts (PDF, PPTX, XLSX, etc.)
- `follow_ups` — Suggested follow-up questions

---

<h2 id="api-reference">📡 API Reference</h2>

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/flux_ask` | Streaming AI chat with tool use — returns SSE events (`status`, `thought`, `file`, `sources`, `follow_ups`, `message_id`, text chunks) |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/conversations` | List user conversations (paginated, 50 per page) |
| `POST` | `/conversations/new` | Create a new conversation |
| `POST` | `/conversation/:id` | Load a conversation's messages |
| `GET` | `/conversations/search?q=` | Full-text search across conversations |
| `DELETE` | `/conversations/:id` | Delete a conversation (cascade) |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/memories` | List all memories for the authenticated user |
| `DELETE` | `/memories/:id` | Delete a specific memory |

### Content

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/artifacts` | List all generated files across conversations |
| `GET` | `/news` | Aggregated news with optional `?category=` filter |
| `POST` | `/summarize` | Summarize a URL or text block |
| `GET` | `/proxy` | Web proxy for embedding articles in iframes |

### Voice

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tts` | Text-to-speech synthesis (returns audio stream) |
| `GET` | `/api/tts/voices` | List available Edge TTS voices |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/skills/:name` | Serve skill markdown files for the frontend |
| `GET` | `/health` | Health check (protected with timing-safe comparison) |

---

<h2 id="project-structure">📁 Project Structure</h2>

```
flux/
├── api/
│   └── index.ts                        # Vercel serverless entry (wraps backend)
│
├── backend/
│   ├── index.ts                        # Express 5 server — all routes, tool system, SSE (3034 lines)
│   ├── agent-tools.ts                  # Document builders (PDF, DOCX, PPTX, XLSX, CSV, TSV, MD, JSON, SQL, HTML)
│   ├── prompt.ts                       # System prompt templates with placeholders
│   ├── generationPrompt.ts             # Document gen prompt schemas
│   ├── memory.ts                       # Vector memory extraction, retrieval, pruning
│   ├── retriever.ts                    # NVIDIA Nemo RAG (embed + rerank)
│   ├── safety.ts                       # NVIDIA Nemotron content safety classifier
│   ├── voice-client.ts                 # NVIDIA ASR (Parakeet) + Edge TTS
│   ├── local-embedder.ts               # BGE-M3 local embeddings (Xenova Transformers)
│   ├── middleware.ts                    # Supabase JWT verification + user upsert
│   ├── client.ts                       # Supabase admin client (service_role)
│   ├── db.ts                           # Prisma client singleton
│   ├── nim-client.ts                   # NVIDIA NIM OpenAI-compatible client
│   ├── nim-openai-client.ts            # Raw OpenAI client for NIM (fallback)
│   ├── orchestrator/
│   │   ├── index.ts                    # Re-exports
│   │   ├── orchestrator.ts             # Plan-execute-verify agentic loop
│   │   ├── planner.ts                  # Intent analysis + execution plans
│   │   ├── verifier.ts                 # Phase result verification
│   │   └── types.ts                    # Phase, ExecutionPlan, StreamWriter types
│   ├── skills/                         # LLM skill prompts for document generation
│   │   ├── SKILL.md                    # Master prompt with all skills
│   │   ├── pdf-skill.md                # PDF generation prompt (layout, fonts, colors)
│   │   ├── docx-skill.md               # DOCX generation prompt
│   │   ├── pptx-skill.md               # PowerPoint generation prompt
│   │   ├── xlsx-skill.md               # Excel spreadsheet generation prompt
│   │   ├── csv-skill.md, tsv-skill.md  # Delimited data generation
│   │   ├── md-skill.md, json-skill.md, sql-skill.md, html-skill.md
│   │   └── tech-writer-skill.md, finance-skill.md, coder-skill.md, creative-skill.md, legal-skill.md
│   │       # Domain-specific prompts for specialized document generation
│   ├── prisma/
│   │   ├── schema.prisma                # 4 models: User, Conversation, Message, Memory (vector)
│   │   ├── migrations/                  # SQL migration history
│   │   ├── add_artifacts_indexes.sql
│   │   └── apply_indexes_now.sql
│   ├── fonts/
│   │   └── NotoSansSC-Regular.ttf       # CJK font for PDF generation
│   ├── image_generation_backend/        # Local Bonsai diffusion service (Python/Flask)
│   │   ├── image_service.py
│   │   └── setup_image_models.py
│   ├── package.json, tsconfig.json, Dockerfile, prisma.config.ts
│   └── express.d.ts, .npmrc
│
├── frontend/
│   ├── src/
│   │   ├── frontend.tsx                 # React entry point (createRoot + HMR)
│   │   ├── App.tsx                      # Router: "/" Dashboard, "/auth" Auth
│   │   ├── index.ts                     # Bun dev server (static serve + SPA catch-all)
│   │   ├── index.html                   # HTML shell (Inter, Newsreader, theme script)
│   │   ├── index.css                    # Base CSS + Tailwind import
│   │   ├── types.ts                     # TS definitions (Message, Source, ConversationListItem, etc.)
│   │   ├── APITester.tsx                # Dev/debug API testing tool
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx            # Main chat (832 lines — auth, CRUD, SSE, tabs, previews)
│   │   │   └── Auth.tsx                 # Login (Google + GitHub OAuth)
│   │   ├── hooks/
│   │   │   ├── useChat.ts               # SSE stream handler (537 lines)
│   │   │   ├── useTheme.ts              # Dark/light theme detection + toggle
│   │   │   └── useSessionRevocationListener.ts  # Auto-redirect on session revoke
│   │   ├── components/
│   │   │   ├── ChatInput.tsx            # Markdown editor, model selector, file attach, voice, search toggle
│   │   │   ├── MessageList.tsx          # Streaming messages with Answer/Links/Images tabs
│   │   │   ├── MessageItem.tsx          # Single message — typewriter, thoughts, sources, files (1202 lines)
│   │   │   ├── MessageRenderer.tsx      # Rich renderer — markdown, code, math, mermaid, charts
│   │   │   ├── Sidebar.tsx              # Animated sidebar — search, conv groups, settings, news
│   │   │   ├── SidebarThread.tsx        # Individual conversation thread item
│   │   │   ├── Settings.tsx             # Account, Preferences, TTS, Sessions tabs
│   │   │   ├── ArtifactsModal.tsx       # File gallery with cache, prefetch, pagination
│   │   │   ├── NewsModal.tsx            # Multi-source news reader (1784 lines)
│   │   │   ├── PeekPanel.tsx            # URL/PDF/DOCX/PPTX/XLSX/MD preview panel
│   │   │   ├── PptxPreview.tsx          # In-browser PPTX renderer (JSZip)
│   │   │   ├── XlsxPreview.tsx          # In-browser XLSX renderer
│   │   │   ├── MarkdownPreview.tsx       # Markdown file preview
│   │   │   ├── FileDownloadButton.tsx    # Download + preview for generated files
│   │   │   ├── SourceCard.tsx            # Source citation with trust score
│   │   │   ├── StatusMessage.tsx         # Tool status (searching, generating…)
│   │   │   ├── SuggestedActions.tsx      # Category-based suggestion prompts
│   │   │   ├── TodoList.tsx              # Dynamic todo list component
│   │   │   ├── PromptHistoryCard.tsx     # Scrollable user prompt history
│   │   │   ├── ToolsDropdown.tsx         # Answer/Links/Images dropdown
│   │   │   ├── ChartBlock.tsx            # Recharts bar, line, pie, doughnut charts
│   │   │   ├── InputSeparator.tsx        # "Flux can make mistakes" divider
│   │   │   └── ui/                      # Shadcn-style primitives
│   │   │       ├── button.tsx, card.tsx, input.tsx, label.tsx
│   │   │       ├── select.tsx, textarea.tsx
│   │   ├── lib/
│   │   │   ├── config.ts                # BACKEND_URL, UNSPLASH_ACCESS_KEY
│   │   │   ├── client.ts                # Supabase browser client
│   │   │   ├── server.ts                # Supabase SSR client (Vite)
│   │   │   ├── chat-utils.ts            # Parse assistant content (sources, follow-ups)
│   │   │   └── utils.ts                 # cn() helper (clsx + tailwind-merge)
│   │   ├── data/
│   │   │   └── suggestions.ts           # Categorized prompts (5 categories, 10 each)
│   │   ├── utils/
│   │   │   ├── TrustScore.ts            # Domain-based URL trust scoring
│   │   │   └── MathRenderer.tsx         # KaTeX inline/display math components
│   │   ├── manifest.json                 # PWA manifest
│   │   ├── sw.js                         # Service worker (network-first)
│   │   └── icon-*.svg / *.png            # PWA icons (192, 512, maskable)
│   ├── styles/
│   │   ├── globals.css                  # Tailwind v4 + CSS custom properties
│   │   └── dashboard.css                # Dashboard-specific dark/light styles
│   ├── scripts/
│   │   └── generate-icons.ts            # PWA icon generation script
│   ├── dist/                            # Built output (deployed)
│   ├── package.json, tsconfig.json, build.ts, bunfig.toml
│   └── components.json, tailwind.config.js
│
├── api/index.ts                         # Vercel serverless entry
├── vercel.json                          # Vercel deployment config
├── flux.bat / flux.ps1                  # Dev launcher scripts (both servers)
├── dashboard.txt                        # Dashboard.tsx snapshot reference
└── .gitignore
```

---

<h2 id="design">🎨 Design System</h2>

Flux uses a warm, humanist design language inspired by Anthropic's Claude interface:

| Token | Value | Usage |
|-------|-------|-------|
| Canvas | `#faf9f5` | Tinted cream background — deliberately warm |
| Primary | `#cc785c` | Coral accent — CTAs, links, key highlights |
| Ink | `#141413` | Near-black for headings |
| Body | `#3d3d3a` | Warm dark gray for body text |
| Surface | `#efe9de` | Card and panel backgrounds |
| Surface Dark | `#181715` | Dark mode surfaces |

**Typography:**
- **Display:** Copernicus / Tiempos Headline (slab-serif) for headings
- **Body:** Inter / StyreneB (humanist sans) for UI text
- **Code:** JetBrains Mono for code blocks
- **Chat:** Newsreader (serif) for conversation messages

**Principles:**
- Cream canvas is mandatory — never use cool grays
- Coral is scarce and intentional
- Color-block layouts over box-shadows
- Spring animations with purposeful micro-interactions

---

<h2 id="tech-stack">🛠️ Tech Stack</h2>

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | [Bun](https://bun.sh) | JS/TS runtime, package manager, bundler, dev server |
| **Backend** | Express 5 + TypeScript | REST API, SSE streaming, middleware |
| **Frontend** | React 19 + TypeScript | SPA with router, hooks, component system |
| **Styling** | Tailwind CSS + Radix UI + framer-motion | Utility CSS, accessible primitives, spring animations |
| **Database** | PostgreSQL + Prisma + pgvector | Relational data, ORM, vector embeddings |
| **Auth** | Supabase | OAuth (Google, GitHub), JWT sessions |
| **AI** | NVIDIA NIM | 20+ LLMs via OpenAI-compatible API |
| **Search** | Tavily | Real-time web search API |
| **Voice** | NVIDIA ASR + Edge TTS | Speech recognition + synthesis |
| **Image Gen** | Bonsai | Local diffusion model inference |
| **Embeddings** | Xenova Transformers | BGE-M3: local 1024-dim embeddings |
| **RAG** | NVIDIA Nemo Retriever | Embed + rerank for retrieval-augmented generation |
| **Safety** | NVIDIA Nemotron | Content safety classification |
| **Deployment** | Vercel | Serverless functions + static hosting |

---

## 🤝 Contributing

This is a personal project, but contributions are welcome!

**Contribution Guidelines:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to your branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Areas for contribution:**
- New LLM tools (e.g., code execution, file analysis)
- Document format generators (e.g., Markdown → PDF templates)
- UI/UX improvements
- Performance optimizations
- Bug fixes and tests

**Questions?** Open an issue or reach out to [@shounakjoshi88-a11y](https://github.com/shounakjoshi88-a11y)

---

<p align="center">
  <sub>Built with Bun · React · PostgreSQL · NVIDIA NIM · Supabase · Tailwind CSS</sub>
  <br>
  <sub>Design language inspired by Anthropic's warm cream + coral palette</sub>
</p>
