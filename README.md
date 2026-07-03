<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/src/logo.svg">
    <img src="frontend/src/logo.svg" width="80" height="80" alt="Flux">
  </picture>
  <br>
  <h1 style="margin: 0; font-size: 3em; font-weight: 400; letter-spacing: -1px;">Flux</h1>
  <p style="font-size: 1.15em; color: #6c6a64; margin-top: 4px;">
    <em>Multi-model AI chat · Agentic tools · Code sandbox · Knowledge graph · Long-term memory</em>
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

<h2 id="features">✨ Features</h2>

<details open>
<summary><strong>🤖 Multi-Model Chat</strong></summary>
<br>
Switch between 19+ models from a unified chat interface with automatic fallback and query routing:

| Category | Models |
|----------|--------|
| **General Purpose** | Mistral Large 3 675B, GLM 5.1, Kimi K2.6, Nemotron 3 Ultra 550B, Nemotron 3 Super 120B, Nemotron 3 Nano Omni 30B, Mistral Medium 3.5 128B, DeepSeek V4 Flash/Pro, Qwen 3.5 397B, Step 3.7 Flash, Step 3.5 Flash, MiniMax M2.7/M3, Sarvam-M, Stockmark 2 100B |
| **Vision** | Nemotron Nano 12B V2 VL, Kimi K2.6, MiniMax M3, DeepSeek V4 Pro — handle image attachments |
| **Planning** | Kimi K2.6 — multi-step task decomposition |

- **Model fallback chain** — Primary → healthy models → unhealthy models with circuit breaker (3 failures in 5min triggers cooldown)
- **Smart query routing** — Simple queries auto-routed to `step-3.7-flash` (cheap), complex queries stay on expensive models
- **Thinking support** — DeepSeek R1 and V4 Flash with native thinking enabled
- **Real-time streaming** — 30+ SSE event types including tool calls, code execution, task progress
</details>

<details>
<summary><strong>🔧 21 Agent Tools</strong></summary>
<br>
The AI autonomously orchestrates tool calls with a permission system and approval store:

| Tool | Description |
|------|-------------|
| `web_search` | Tavily real-time search with full-page content extraction, query relevance filters, anti-hallucination guards, search caching |
| `read_skill` | Load format-specific skill prompts (17 skills) |
| `generate_document` | Create files in 10 formats with skill-enhanced generation |
| `get_weather` | Current conditions via OpenWeatherMap + Open-Meteo fallback |
| `generate_image` | Bonsai diffusion model inference |
| `run_python` | Execute Python code in isolated E2B sandbox |
| `run_bash` | Run bash commands in sandbox |
| `read_file` | Read files from sandbox |
| `write_file` | Create new files in sandbox |
| `edit_file` | Surgical string replacement in existing files |
| `list_files` | List directory contents |
| `install_package` | Install Python packages via pip |
| `wiki_search` | Search knowledge graph |
| `create_project` | Scaffold multi-file projects |
| `start_app` | Start background web apps |
| `stop_app` | Stop running apps |
| `list_apps` | List all running apps |
| `get_app_logs` | Get app stdout/stderr |
| `get_app_url` | Get public HTTPS URL for web apps |
| `get_generated_file` | Download files from sandbox |
| `read_url` | Fetch and extract readable text from URLs (HTML, PDF, DOCX) |

- **Permission system** — Per-session pending permissions (60s timeout), auto-approve fallback, localStorage-persistent "always allow" store
- **Hallucination guards** — Query relevance token overlap check, proper noun extraction, weather intent guard, search loop guard (max 1 auto + 1 re-search)
- **Search caching** — In-memory LRU cache with 5-min TTL, seeded from conversation history on startup
</details>

<details>
<summary><strong>📄 Document Generation</strong></summary>
<br>
Generate professional documents from plain English descriptions. Built server-side by LLM-driven generation with format-specific skill prompts, retry logic, and fallback data generation.

| Format | Capabilities |
|--------|-------------|
| **PDF** | 4 templates: Corporate (navy/blue), Minimal (clean white), Creative (teal/indigo), Report (academic) — cover pages, auto-TOC, headers/footers, tables, lists, DejaVu fonts with CJK support |
| **DOCX** | Professional headings & body sections with structured paragraph styling |
| **PPTX** | Dark-theme wide-format slide decks with title, bullet, comparison, and section layouts |
| **XLSX / CSV / TSV** | Formatted spreadsheets and delimited data |
| **Markdown / JSON / SQL / HTML** | Structured text documents |

All generated files are downloadable, previewable in-browser, and browsable in the artifacts gallery.
</details>

<details>
<summary><strong>🧠 Long-Term Memory</strong></summary>
<br>
Flux remembers what matters with vector-based memory extraction and retrieval:

- **Automatic Extraction** — LLM extracts key facts from conversations in 5 categories: `preference`, `project`, `personal`, `decision`, `feedback`
- **Vector Storage** — 1024-dimensional embeddings via BGE-M3 (local, Xenova Transformers ONNX worker thread)
- **Similarity Search** — pgvector `<=>` operator with HNSW index for fast semantic retrieval
- **Importance Scoring** — Memories ranked by `importance * 0.7 + min(accessCount/10, 1) * 0.3`; low-importance junk gets pruned
- **Deduplication** — Near-duplicate detection using cosine distance threshold (< 0.12), keeps higher-importance copy
- **Context Injection** — Relevant memories auto-injected into tool calls (personalized search queries, style-aware document generation)
</details>

<details>
<summary><strong>🔬 Content Tools</strong></summary>
<br>

- **Article Summarization** — AI-powered summary of any URL with Tavily extraction
- **Web Proxy** — In-app iframe preview with CSP stripping and paywall/cookie notice hiding
- **Source Reputation Scoring** — 70+ trusted domains (`.gov`, `.edu`, reuters, arxiv, github, etc.) scored 0-100
</details>

<details>
<summary><strong>🧩 Knowledge Graph (Wiki)</strong></summary>
<br>
Flux builds a persistent knowledge graph from conversations:

- **Automatic Concept Extraction** — LLM extracts concepts and relationships from every conversation turn
- **9 Relationship Types** — `mentions`, `related_to`, `contradicts`, `supports`, `defines`, `is_part_of`, `used_by`, `depends_on`, `generates`
- **3D Interactive Visualization** — Three.js/react-three-fiber with orbit controls, force-directed layout, node type color coding (concept/person/event/article), relationship edge display
- **Full Rebuild** — Option to rebuild the entire graph from all conversation history with progress tracking
- **Search** — Real-time concept search as you type
</details>

<details>
<summary><strong>💻 Code Execution & Sandbox</strong></summary>
<br>
Run code in isolated E2B Firecracker microVMs with a full Python data science stack:

- **Languages** — Python (pandas, numpy, matplotlib, seaborn, plotly, scipy, scikit-learn, pillow, requests) and Bash
- **App Hosting** — Start, stop, list, and get public HTTPS URLs for running web apps
- **File Operations** — Read, write, edit, list, and download files
- **Project Scaffolding** — Create multi-file projects with one tool call
- **Lifecycle** — Per-conversation sandboxes with 4-min idle cleanup, health checks, 5-min timeout
- **Frontend** — Terminal-style code execution blocks with live stdout/stderr streaming, exit code, duration, and generated file display
</details>

<details>
<summary><strong>🔄 Agent Communication Protocol</strong></summary>
<br>
Full WebSocket-based agent protocol with session management and team orchestration:

- **9 Session States** — idle → connecting → warming_up → ready → processing ↔ awaiting_permission → cooldown → error/finished
- **4 Agent Modes** — `default`, `plan` (show plan before executing), `yolo` (auto-approve all), `bypass_permissions`
- **20 Message Types** — text, thinking, tool_call, tool_result, tool_group, permission_request, plan, agent_status, context_usage, and more
- **Multi-Agent Teams** — Leader-teammate architecture with LLM-powered task breakdown, parallel/sequential delegation, and result synthesis
- **Custom Agents** — User-registered agents with custom commands, args, env variables, and skill directories
- **SSE-to-WebSocket Bridging** — Proxies `/flux_ask` SSE stream to WebSocket messages
</details>

<details>
<summary><strong>📋 Long-Running Task System</strong></summary>
<br>
Autonomous multi-step task execution for complex workflows:

- **Task Intent Classification** — 3-tier (SIMPLE/COMPLEX/LONG_TASK) using heuristics + LLM fallback via nemotron-nano
- **Multi-Step Planning** — Kimi K2.6 generates 3-15 step plans with sequential dependencies
- **Sandbox Execution** — Each step runs in E2B sandbox with file change tracking (SHA1 snapshots)
- **Heartbeat & Recovery** — 10s heartbeat, stale task detection, automatic recovery on server restart
- **Lifecycle** — Create, pause, resume, cancel, with SSE progress streaming
- **Persistence** — Full Task/TaskStep models in PostgreSQL with status tracking
</details>

<details>
<summary><strong>🎤 Voice I/O</strong></summary>
<br>

- **Speech-to-Text** — NVIDIA ASR (Parakeet 1.1B multilingual) for transcribing voice input
- **Text-to-Speech** — NVIDIA Magpie TTS multilingual (cloud) + Piper TTS offline fallback with auto-download from HuggingFace
- **Browser TTS** — Read-aloud button on messages via Web Speech API
</details>

<details>
<summary><strong>📰 News Aggregation</strong></summary>
<br>
Multi-source news reader built right in:

- **Sources** — BBC, NPR, Reuters, CNN, Ars Technica, Wired, Al Jazeera, ScienceDaily, NASA, HackerNews (Firebase API)
- **Categories** — All, World, Tech, Business, Science, Politics — with auto category detection
- **Search** — Full news search via Tavily news API
- **Caching** — Server-side RSS caching with 2-min TTL
</details>

<details>
<summary><strong>💬 Conversation Management</strong></summary>
<br>

- **Searchable History** — Full-text search across all conversations with PostgreSQL FTS
- **Auto-Titling** — Conversations automatically renamed via Llama 4 Maverick with 5–10 word titles (prefixes with doc type if applicable)
- **Message Editing** — Edit and resend any message
- **Undo Delete** — Deleted conversations restored via toast notification
- **Artifacts Gallery** — Browse every generated file across all conversations with search, filtering, and pagination
- **File Attachments** — Text, images, video (10MB), PDF, DOCX (2MB text) with type detection and size limits
- **Share Conversation** — Web Share API / clipboard link sharing
</details>

<details>
<summary><strong>🖥️ Electron Desktop App</strong></summary>
<br>

- **Single-instance lock** — Prevents duplicate app instances
- **Deep link support** — `flux://` protocol handler
- **Window state persistence** — Remembers position, size, and maximized state
- **System tray** — Minimizes to tray with context menu (show/hide, maximize, open in browser, quit)
- **Auto-updater** — Checks GitHub releases and shows update dialog
- **Splash screen** — Custom loading window while app loads
- **Custom titlebar** — Frameless design with window controls and drag region
- **PWA** — Installable with service worker, manifest, and maskable icons
</details>

<details>
<summary><strong>🔍 File Analysis</strong></summary>
<br>
When you upload files, Flux can analyze them:

- **Code Symbol Extraction** — Extracts imports, routes, classes, interfaces, functions, and components from code files
- **File Category Detection** — Classifies files as code, document, data, or config
- **Smart Context Sampling** — Strategic file reading: header + query-relevant body + tail with TF-based relevance scoring
- **Design Skill Auto-Loading** — Automatically loads frontend-design skill when you ask to improve UI of uploaded files
</details>

<details>
<summary><strong>💡 Smart Model Management</strong></summary>
<br>

- **Query Router** — Classifies queries as simple or complex (20+ regex patterns), routes simple to cheap models
- **Circuit Breaker** — Per-model health tracking: 3 failures in 5min triggers cooldown, dynamic timeout (10s healthy / 3s degraded)
- **Model Fallback Chain** — Proxy pattern: tries primary → healthy models → unhealthy models before failing
- **Vision Detection** — 4 vision-capable models with automatic image attachment handling
- **Provider Options** — Thinking mode enabled for DeepSeek models
</details>

<details>
<summary><strong>🎨 Design & UX</strong></summary>
<br>

- **Warm Design System** — Cream canvas (`#faf9f5`), coral primary (`#cc785c`), slab-serif display typography
- **Dark Mode** — Dark navy surfaces on warm dark canvas with automatic system preference detection
- **Responsive** — Adaptive layout with animated sidebar (framer-motion spring)
- **Auth** — Google and GitHub OAuth via Supabase with session management and auto-refresh
- **Settings** — Theme toggle, font selection (5 options), model preferences, profile management
- **Model Selector** — Dropdown with models grouped by category
- **Copy / Edit / Retry** — Per-message action buttons
- **Thumbs Up/Down** — Local toggle feedback with animated icon fill/scale
- **Prompt History** — Physics-based inertial scrolling card showing recent prompts
- **Keyboard Navigation** — Search modal, quick actions, keyboard shortcuts
- **Citation System** — Domain-labeled citations with reputation scoring and hover preview
- **Read-Aloud** — TTS button on each message with natural voice selection
</details>

---

<h2 id="quick-start">⚡ Quick Start</h2>

### Prerequisites

- [Bun](https://bun.sh) v1.2+ (or Node.js 18+)
- PostgreSQL 14+ with pgvector (or [Supabase](https://supabase.com) project)
- **NVIDIA NIM API Key** — Get from [NVIDIA NIM](https://build.nvidia.com/nim)
- **Tavily API Key** — Web search (get from [Tavily](https://tavily.com))
- **Supabase Project** — Auth + PostgreSQL (get from [Supabase](https://supabase.com))
- Optional: OpenWeatherMap API key, E2B sandbox key, Bonsai for image generation, HuggingFace API key

### Installation

```bash
# Clone and navigate
git clone https://github.com/shounakjoshi88-a11y/Flux.git
cd Flux

# Install backend dependencies
cd backend && bun install

# Set up database
bunx prisma migrate dev --name init  # Creates database schema
bunx prisma generate                  # Generates Prisma client

# Install frontend dependencies
cd ../frontend && bun install

# You're ready!
cd ../
```

### Environment Variables

Create `backend/.env`:

```env
# ===== DATABASE =====
DATABASE_URL=postgresql://postgres:password@localhost:5432/flux

# ===== SUPABASE (Auth) =====
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_API_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ===== OAUTH =====
GITHUB_OAUTH_CLIENT_ID=your_github_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_oauth_client_secret
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret

# ===== LLM & AI =====
NIM_API_KEY=your_nvidia_nim_api_key
NIM_BASE_URL=https://integrate.api.nvidia.com/v1
HF_API_KEY=your_huggingface_api_key        # Optional fallback

# ===== WEB SEARCH =====
TAVILY_API_KEY=your_tavily_api_key

# ===== WEATHER =====
OPENWEATHER_API_KEY=your_openweathermap_api_key

# ===== SANDBOX (Code Execution) =====
E2B_API_KEY=your_e2b_api_key

# ===== IMAGE GENERATION =====
IMAGE_SERVICE_URL=http://127.0.0.1:8001
BONSAI_MODELS_DIR=./image_generation_backend/models

# ===== FRONTEND =====
BACKEND_URL=http://localhost:3001
UNSPLASH_ACCESS_KEY=your_unsplash_api_key
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

### Database Setup

Flux requires PostgreSQL with `pgvector` extension for embeddings:

**Option A: Supabase (Recommended)**
1. Create a project on [Supabase](https://supabase.com)
2. Copy the connection string to `DATABASE_URL`
3. Run `bunx prisma migrate dev --name init`

**Option B: Local PostgreSQL**
```bash
createdb flux
psql flux -c "CREATE EXTENSION IF NOT EXISTS vector"
bunx prisma migrate dev --name init
```

---

<h2 id="architecture">🏗️ Architecture</h2>

```mermaid
flowchart LR
    subgraph frontend[React 19 SPA]
        Dashboard[Dashboard - Chat - Sources - Tabs]
        Sidebar[Sidebar - Search - History - News - Wiki]
        Auth[Auth - Google / GitHub OAuth]
        Settings[Settings - Theme - Fonts - Models]
        Peek[PeekPanel - Preview PDF/PPTX/XLSX/DOCX/MD/Web]
        ThreeDG[WikiGraph - 3D Knowledge Graph]
        Artifacts[Artifacts - Generated files gallery]
    end

    subgraph backend[Express 5 - Bun - 6200+ lines]
        Chat[POST /flux_ask - SSE streaming - 30+ events]
        Conv[REST - Conversations CRUD]
        Memory[REST - Memories + Extraction]
        News[REST - News + Summarize + Search]
        Voice[STT/TTS - Parakeet + Magpie + Piper]
        Wiki[Wiki - Knowledge Graph API]
        Tools[Tool System - 21 registered tools]
        Tasks[Task System - Multi-step planning + E2B sandbox]
        ACP[Agent Protocol - WebSocket state machine]
        Team[Team Orchestration - Leader/teammate]
        Files[File Analysis - Code symbols + structured context]
        Safety[Safety - Nemotron content filter]
        Models[Model Router - Query routing + circuit breaker]
    end

    subgraph agentic[Agentic Loop - Orchestrator]
        Plan[Planner - Intent analysis]
        Execute[Execute - Tool calls with permission]
        Verify[Verifier - Result criteria checks]
        Retry[Retry - 3 attempts with fallback]
    end

    subgraph sandbox[E2B Firecracker MicroVM]
        Python[Python - pandas/numpy/matplotlib]
        Bash[Bash - Shell commands]
        Apps[Web Apps - Start/stop/URL]
        Files[File System - Read/write/project scaffold]
    end

    subgraph nim[NVIDIA NIM]
        LLM[19+ LLMs - Mistral - DeepSeek - Qwen - Nemotron - GLM - Kimi - Step]

        ASR[Parakeet - Speech-to-text]
        TTS[Magpie - Text-to-speech]
    end

    subgraph storage[PostgreSQL + pgvector]
        Prisma[Prisma ORM - User - Conversation - Message]
        Vector[pgvector - 1024-dim HNSW index]
        WikiDB[WikiNode + WikiEdge - Knowledge graph]
        TaskDB[Task + TaskStep - Long-running tasks]
    end

    subgraph services[External Services]
        Tavily[Tavily - Search + Extract]
        Supabase[Supabase - Auth OAuth]
        Bonsai[Bonsai - Image generation]
        Weather[OpenWeatherMap + Open-Meteo]
        EdgeTTS[Edge TTS - 100+ voices]
    end

    frontend -->|chat + JWT| backend
    backend -->|SSE + WS| frontend
    backend -->|agentic loop| agentic
    backend -->|code execution| sandbox
    backend -->|LLM calls| nim
    backend -->|persist + vector| storage
    backend -->|tool execution| services
```

**Complete Request Flow:**

1. User types a message → frontend sends `POST /flux_ask` with query, model ID, conversation history, and optional file attachments
2. Server verifies JWT → upserts user → loads conversation → retrieves relevant memories (pgvector) → builds system prompt with datetime, location, skills, memory context
3. Query router classifies complexity → routes to appropriate model tier (cheap vs expensive)
4. LLM responds with streaming text, interleaved with tool call requests via 30+ SSE event types
5. Server executes tool calls in the orchestrator: web search (with relevance guard, anti-hallucination, caching), document generation, code execution (E2B sandbox), weather, image gen, wiki search, file ops
6. Each phase is verified against criteria (has_sources, has_file, etc.) and retried up to 3 times
7. After up to 30 reasoning steps, final answer streams with reputation-scored sources, thought process, follow-up questions, and artifacts
8. Messages persist to PostgreSQL; memories extract asynchronously; wiki graph updates in background
9. Long-running tasks (>1 min) run autonomously via the Task System with heartbeat monitoring, pause/resume, and server restart recovery

### Agentic Loop Details

The `/flux_ask` endpoint orchestrates up to 30 reasoning steps through the orchestrator:

1. **Plan** — Analyze user intent and select workflow (research, code, weather, document, image, simple QA, file analysis, computer mode)
2. **Execute** — Run tools with permission checks, approval store, hallucination guards, and caching
3. **Verify** — Validate results against criteria (has_sources, has_file, has_text_output, semantic_match)
4. **Iterate** — Retry failed phases (up to 3 attempts) with fallback strategies
5. **Finalize** — Stream final answer with deduplication, answer synthesis fallback, and CJK deglitching

**SSE Events Streamed (30+):**
- `status` — Tool execution status with progress
- `thought` — Visible reasoning process
- `replace_text` — Synthesis replaces partial stream
- `tool_call` / `tool_group` / `tool_result` — Tool lifecycle
- `permission` — Permission approval requests
- `agent_status` — Agent state transitions
- `file` / `file_generated` — Generated artifacts
- `code_execution` / `code_output` / `code_done` — Sandbox execution
- `sources` — Search results with URLs and snippets
- `follow_ups` — 3 suggested follow-up questions
- `message_id` — Saved message database ID
- `wiki_update` — Knowledge graph update notification
- `todos` — Task list items
- `plan` — Execution plan display
- `task_created` / `task_step_started` / `task_step_completed` / `task_step_failed` / `task_completed` — Task system events
- `terminal` — Terminal output
- `DONE` — Stream completion

---

<h2 id="api-reference">📡 API Reference</h2>

### Chat & AI

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/flux_ask` | Main SSE streaming AI chat — 30+ event types, full agentic loop |
| `POST` | `/api/chat-sdk` | AI SDK compatible streaming endpoint |
| `POST` | `/api/tasks` | Create long-running task (returns 202 + `taskId`) |
| `GET` | `/api/tasks` | List user's 50 most recent tasks |
| `GET` | `/api/tasks/:id` | Get task with all steps |
| `GET` | `/api/tasks/:id/stream` | SSE stream for task execution progress |
| `POST` | `/api/tasks/:id/cancel` | Cancel a running task |
| `POST` | `/api/tasks/:id/pause` | Pause a running task |
| `POST` | `/api/tasks/:id/resume` | Resume a paused task |
| `POST` | `/summarize` | AI article or text summary |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/conversations` | List user conversations (paginated, 50 per page) |
| `POST` | `/conversations/new` | Create a new conversation (rate-limited: 30/15min) |
| `POST` | `/conversation/:id` | Load a conversation's messages |
| `GET` | `/conversations/search?q=` | Full-text search across conversations |
| `DELETE` | `/conversations/:id` | Delete conversation (cascade: tasks, messages, sandbox) |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/memories` | List all memories for authenticated user |
| `DELETE` | `/memories/:id` | Delete a specific memory |

### Knowledge Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/wiki` | Get user's full knowledge graph (nodes + edges) |
| `DELETE` | `/api/wiki/node/:id` | Delete a wiki node (cascading edges) |
| `GET` | `/api/wiki/search?q=` | Search wiki concepts |
| `GET` | `/api/wiki/rebuild/progress` | Get wiki rebuild progress |
| `POST` | `/api/wiki/rebuild` | Trigger full wiki rebuild from all conversations |

### Content

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/artifacts` | List all generated files and uploads (paginated, 24 per page) |
| `GET` | `/api/assets/:messageId/:type/:index` | Get individual file asset |
| `GET` | `/news` | Aggregated news with `?category=` filter |
| `GET` | `/news/search?q=` | News search via Tavily |
| `GET` | `/proxy?url=` | Web proxy for embedding articles in iframes |
| `GET` | `/preview?url=` | Text snippet preview of a URL |

### Voice

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tts/local` | Local Piper TTS synthesis (returns WAV audio) |

### Agent Protocol

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/acp/capabilities` | ACP handshake — capabilities, supported modes, tools |
| WebSocket | `/agent` | Bidirectional agent session (auth → session_start → user_message → ...) |
| `GET` | `/api/agents/custom` | List user's custom agents |
| `POST` | `/api/agents/custom` | Create custom agent |
| `DELETE` | `/api/agents/custom/:id` | Delete custom agent |

### Tools & Permissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tools` | List all registered tools |
| `POST` | `/api/permissions/respond` | Approve/deny a pending tool permission request |
| `POST` | `/api/sandbox/upload` | Upload file to sandbox |
| `GET` | `/api/sandbox/download/:conversationId/:filename` | Download file from sandbox |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/skills/:name` | Serve skill markdown files |
| `GET` | `/api/models` | List all available models grouped by category |
| `GET` | `/health` | Health check (timing-safe secret comparison + DB test) |
| `GET` | `/ping` | Basic health ping |
| `GET` | `/whoami` | User identity (appUserId, supabaseUserId, email) |

---

<h2 id="project-structure">📁 Project Structure</h2>

```
flux/
├── api/
│   ├── index.ts                        # Vercel serverless entry (wraps backend)
│   └── tsconfig.json
│
├── backend/
│   ├── index.ts                        # Express 5 server — 6200+ lines, all routes
│   ├── agent-tools.ts                  # Document builders (PDF/DOCX/PPTX/XLSX/CSV/TSV/MD/JSON/SQL/HTML)
│   ├── prompt.ts                       # System prompt templates
│   ├── generationPrompt.ts             # Document gen prompt schemas
│   ├── memory.ts                       # Vector memory extraction, retrieval, pruning
│   ├── memory-enhanced.ts              # Memory-aware tool execution
│   ├── local-embedder.ts               # BGE-M3 embeddings via ONNX worker thread
│   ├── embedder-worker.ts              # Worker thread for embedding inference

│   ├── voice-client.ts                 # NVIDIA ASR (Parakeet) + TTS (Magpie)
│   ├── tts-local.ts                    # Piper TTS offline fallback
│   ├── nim-client.ts                   # NVIDIA NIM OpenAI-compatible client
│   ├── nim-openai-client.ts            # Raw OpenAI client for NIM
│   ├── huggingface-client.ts           # HuggingFace API client
│   ├── query-router.ts                 # Smart query classification + model routing
│   ├── model-health.ts                 # Rolling-window model health circuit breaker
│   ├── search-cache.ts                 # In-memory search result cache
│   ├── tool-registry.ts                # Central MCP-like tool registration (18 tools)
│   ├── task-detector.ts                # Task intent classifier (SIMPLE/COMPLEX/LONG_TASK)
│   ├── task-routes.ts                  # Long-running task REST API
│   ├── task-loop.ts                    # Multi-step task execution loop
│   ├── middleware.ts                   # Supabase JWT verification + user upsert
│   ├── client.ts                       # Supabase admin client
│   ├── db.ts                           # Prisma client singleton
│   ├── prisma.config.ts                # Prisma configuration
│   ├── express.d.ts                    # Express type augmentation
│   │
│   ├── orchestrator/                   # Multi-phase workflow engine
│   │   ├── index.ts                    # Re-exports
│   │   ├── orchestrator.ts             # Plan-execute-verify agentic loop (11 phase types)
│   │   ├── planner.ts                  # Intent analysis + execution plans (8 workflow kinds)
│   │   ├── verifier.ts                 # Phase result verification (6 criteria)
│   │   └── types.ts                    # Phase, ExecutionPlan, StreamWriter types
│   │
│   ├── agent-protocol/                 # WebSocket Agent Communication Protocol
│   │   ├── index.ts                    # Re-exports
│   │   ├── types.ts                    # 9 states, 20 message types, 4 modes
│   │   ├── session.ts                  # State machine + session lifecycle
│   │   ├── team.ts                     # Multi-agent team orchestration
│   │   ├── websocket.ts                # WebSocket handler + SSE bridge
│   │   ├── model-selector.ts           # 18-model selector + fallback chain
│   │   └── errors.ts                   # Structured error hierarchy
│   │
│   ├── wiki/
│   │   └── wikiManager.ts              # Knowledge graph LLM extraction + CRUD
│   │
│   ├── sandbox/
│   │   └── sandboxManager.ts           # E2B sandbox lifecycle manager
│   │
│   ├── tools/
│   │   └── codeExecutor.ts             # Python/Bash execution + app management
│   │
│   ├── skills/                         # Skill prompts for document generation (17 files)
│   │   ├── SKILL.md, pdf-skill.md, pptx-skill.md, docx-skill.md
│   │   ├── xlsx-skill.md, csv-skill.md, tsv-skill.md
│   │   ├── md-skill.md, json-skill.md, sql-skill.md, html-skill.md
│   │   ├── tech-writer-skill.md, finance-skill.md, coder-skill.md
│   │   ├── creative-skill.md, legal-skill.md
│   │
│   ├── prisma/
│   │   ├── schema.prisma               # 8 models: User, Conversation, Message, Memory,
│   │   │                                #   WikiNode, WikiEdge, Task, TaskStep
│   │   ├── migrations/                 # 13 migration folders
│   │   └── generated/                  # Auto-generated Prisma client
│   │
│   ├── fonts/
│   │   └── NotoSansSC-Regular.ttf      # CJK font for PDF generation
│   │
│   └── image_generation_backend/       # Local Bonsai diffusion service (Python/Flask)
│       ├── image_service.py
│       └── setup_image_models.py
│
├── frontend/
│   ├── src/
│   │   ├── frontend.tsx                # React entry point
│   │   ├── App.tsx                     # Router: /, /c/:slug, /new, /auth, /privacy, /terms
│   │   ├── index.ts                    # Bun dev server (static serve + SPA catch-all)
│   │   ├── index.html                  # HTML shell
│   │   ├── types.ts                    # TypeScript definitions (Message, MessagePart, 14 part types)
│   │   ├── i18n.ts                     # Internationalization
│   │   ├── APITester.tsx               # API test component
│   │   ├── declarations.d.ts           # Ambient type declarations
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx           # Main app shell (1361 lines)
│   │   │   ├── Auth.tsx                # Marketing landing + OAuth (Google + GitHub)
│   │   │   ├── Privacy.tsx             # Privacy policy (1012 lines)
│   │   │   └── Terms.tsx               # Terms of service (973 lines)
│   │   │
│   │   ├── components/
│   │   │   ├── ChatInput.tsx           # Rich input with voice, file attach, model select, slash commands
│   │   │   ├── MessageList.tsx         # Streaming messages with Answer/Links/Images tabs
│   │   │   ├── MessageItem.tsx         # Single message (1690 lines) — typewriter, edit, retry, copy, TTS, thumbs
│   │   │   ├── MessageRenderer.tsx     # Rich renderer (1405 lines) — markdown, KaTeX, Mermaid, charts, SMILES
│   │   │   ├── Sidebar.tsx             # Animated sidebar (973 lines) — search, conv groups, settings, news, wiki
│   │   │   ├── SidebarThread.tsx       # Conversation thread item
│   │   │   ├── Settings.tsx            # Profile, Appearance (5 fonts), Account
│   │   │   ├── ArtifactsModal.tsx      # File gallery with cache, prefetch, pagination
│   │   │   ├── NewsModal.tsx           # Multi-source news reader with categories + search
│   │   │   ├── PeekPanel.tsx           # URL/PDF/DOCX/PPTX/XLSX/MD/HTML preview panel
│   │   │   ├── PptxPreview.tsx         # Custom in-browser PPTX renderer (text, tables, shapes, images)
│   │   │   ├── XlsxPreview.tsx         # Spreadsheet viewer with sheet tabs, search, pagination
│   │   │   ├── MarkdownPreview.tsx     # Rendered markdown preview
│   │   │   ├── FileDownloadButton.tsx  # Download + preview for generated files
│   │   │   ├── SourceCard.tsx          # Citation with reputation score + favicon
│   │   │   ├── StatusMessage.tsx       # Tool status (2121 lines) — thoughts, searches, code exec, weather
│   │   │   ├── SuggestedActions.tsx    # 5 categories × 10 prompts
│   │   │   ├── TodoList.tsx            # Animated task list
│   │   │   ├── PromptHistoryCard.tsx   # Physics-based inertial scroll prompt history
│   │   │   ├── ToolsDropdown.tsx       # Answer/Links/Images tab switcher
│   │   │   ├── ChartBlock.tsx          # Recharts (bar, line, area, pie, doughnut, scatter)
│   │   │   ├── CodeOutputBlock.tsx     # Terminal-style code execution with live streaming
│   │   │   ├── WikiGraph.tsx           # 3D knowledge graph (Three.js, 967 lines)
│   │   │   ├── CustomAgentsPanel.tsx   # Custom agent registration
│   │   │   ├── AgentStatusBar.tsx      # Agent session status + mode switcher
│   │   │   ├── PermissionDialog.tsx    # Tool approval dialog with "remember choice"
│   │   │   ├── TeamPanel.tsx           # Multi-agent team orchestration
│   │   │   ├── ToolSummary.tsx         # Tool call summary display
│   │   │   ├── InputSeparator.tsx      # "Flux can make mistakes" divider
│   │   │   └── ui/                     # shadcn-style primitives
│   │   │       ├── button.tsx, card.tsx, input.tsx, label.tsx, select.tsx, textarea.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useChat.ts              # SSE stream handler (843 lines) — 25+ event types, edit, retry, abort
│   │   │   ├── useAgentSession.ts      # WebSocket agent session (641 lines) — state machine, reconnect
│   │   │   ├── useModels.ts            # Dynamic model discovery with 30s polling
│   │   │   ├── useCustomAgents.ts     # Custom agent CRUD
│   │   │   ├── useTheme.ts             # Dark/light toggle with system preference
│   │   │   └── useSessionRevocationListener.ts
│   │   │
│   │   ├── lib/
│   │   │   ├── config.ts               # Dynamic BACKEND_URL resolution
│   │   │   ├── client.ts               # Supabase browser client
│   │   │   ├── server.ts               # Supabase SSR client
│   │   │   ├── chat-utils.ts           # Parse assistant content (sources, follow-ups, thought blocks)
│   │   │   ├── utils.ts                # cn() helper
│   │   │   ├── tool-normalizer.ts      # Tool call normalization
│   │   │   ├── message-index.ts        # O(1) message index for streaming performance
│   │   │   └── approval-store.ts       # localStorage-persistent tool approval cache
│   │   │
│   │   ├── data/
│   │   │   └── suggestions.ts          # 50 categorized prompts (5 categories × 10 each)
│   │   │
│   │   ├── utils/
│   │   │   ├── ReputationScore.ts      # 70+ domain reputation scoring (0-100)
│   │   │   └── MathRenderer.tsx        # KaTeX inline/display with SMILES support
│   │   │
│   │   └── __tests__/
│   │       └── eldritch-horror.test.ts # LaTeX rendering tests (228 lines)
│   │
│   ├── styles/
│   │   ├── globals.css                 # Tailwind v4 + CSS custom properties
│   │   └── dashboard.css               # Dashboard-specific dark/light styles (434 lines)
│   │
│   ├── scripts/
│   │   └── generate-icons.ts           # PWA icon generation
│   │
│   ├── manifest.json                   # PWA manifest
│   ├── sw.js                           # Service worker (network-first)
│   ├── build.ts                        # Custom Bun build script
│   └── package.json, tsconfig.json, bunfig.toml, components.json
│
├── electron/                           # Desktop app
│   ├── main.ts                         # Main process (518 lines) — tray, deep links, updates, splash
│   ├── preload.ts                      # Context bridge — window controls, version, update check
│   └── tsconfig.json
│
├── shared/
│   └── flux-common/                    # (empty — moved to respective dirs)
│
├── data/skills/                        # AI agent skill definitions
│   ├── analyze-bundle/                 # JS/TS bundle analysis
│   ├── bun*, bun-development*, bun-runtime/
│   ├── copilotkit/                     # Comprehensive CopilotKit (~40 files)
│   ├── frontend-design/
│   ├── logo-creator/                   # AI logo creation with Python scripts
│   ├── mcp-builder/
│   ├── multi-agent-orchestration/
│   ├── web-design-guidelines/
│   └── websocket-engineer/, websocket-implementation/
│
├── screenshots/                        # App screenshots (13)
├── scripts/
│   └── make-ico.cjs                    # Windows icon generator
├── build/
│   └── icon.ico                        # Windows app icon
├── certs/                              # TLS certs for local HTTPS
├── release/                            # Packaged Electron builds
├── vercel.json                         # Vercel deployment config
├── electron-builder.yml                # Electron packaging config
├── fix_sections.mjs                    # Utility script
├── FLUX_CODE_INTERPRETER_PROMPT.md     # Code interpreter instructions
├── system.md                           # Long-running task design doc
├── AGENTS.md                           # AI assistant instructions
├── DESIGN.md                           # Design system documentation
├── FluxMap.md                          # Full project map (1988 lines)
├── flux.bat / flux.ps1                 # Windows dev launchers
└── README.md                           # This file
```

---

<h2 id="tech-stack">🛠️ Tech Stack</h2>

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | [Bun](https://bun.sh) | JS/TS runtime, package manager, bundler, dev server |
| **Backend** | Express 5 + TypeScript | REST API, SSE streaming, WebSocket, middleware |
| **Frontend** | React 19 + TypeScript | SPA with router, hooks, component system |
| **Styling** | Tailwind CSS 4 + Radix UI + framer-motion | Utility CSS, accessible primitives, spring animations |
| **Database** | PostgreSQL + Prisma 7 + pgvector | Relational data, ORM, vector embeddings (1024-dim HNSW) |
| **Auth** | Supabase | OAuth (Google, GitHub), JWT sessions, SSR |
| **AI** | NVIDIA NIM | 19+ LLMs via OpenAI-compatible API |
| **Search** | Tavily | Real-time web search API |
| **Voice** | NVIDIA Parakeet + Magpie TTS + Piper + Web Speech API | Speech recognition + synthesis + browser TTS |
| **Image Gen** | Bonsai | Local diffusion model inference |
| **Sandbox** | E2B Code Interpreter | Isolated Firecracker microVMs for code execution |
| **Embeddings** | Xenova Transformers (ONNX) | BGE-M3: local 1024-dim embeddings via worker thread |

| **Desktop** | Electron 35 + electron-builder | Cross-platform desktop app with tray, deep links, auto-update |
| **Charts** | Recharts | Bar, line, area, pie, doughnut, scatter |
| **Math** | KaTeX | Inline/display math with 70+ custom LaTeX macros |
| **Graphs** | Mermaid + Three.js | Diagrams + 3D knowledge graph |
| **Deployment** | Vercel | Serverless functions + static hosting |

---

## 🔧 Troubleshooting

### Database Connection Error
```bash
psql $DATABASE_URL -c "SELECT 1"
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector"
```

### NVIDIA NIM Not Responding
- Verify `NIM_API_KEY` is set and valid
- Check `NIM_BASE_URL` is correct
- The system auto-falls back through healthy models, then HuggingFace

### Frontend Not Loading
```bash
cd frontend
rm -rf node_modules dist
bun install
bun dev
```

### Prisma Migration Issues
```bash
cd backend
bunx prisma migrate reset    # ⚠️ deletes all data
bunx prisma db push           # push schema directly
```

### Sandbox Not Working
- Verify `E2B_API_KEY` is set
- Check sandbox limits: Hobby = 20 concurrent, 1hr max session
- Sandbox auto-cleanup runs every 2 minutes (4-min idle kill)

---

## 📖 Development Guide

### Local Development

```bash
# Terminal 1 — Backend
cd backend && bun index.ts
# → http://localhost:3001

# Terminal 2 — Frontend
cd frontend && bun dev
# → http://localhost:3000

# Terminal 3 — Electron (optional)
npm run electron:dev
```

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `NIM_API_KEY` | ✅ Yes | NVIDIA NIM API key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase service role key |
| `TAVILY_API_KEY` | ✅ Yes | Tavily web search API key |
| `E2B_API_KEY` | ❌ No | Code execution sandbox |
| `HF_API_KEY` | ❌ No | HuggingFace fallback |
| `OPENWEATHER_API_KEY` | ❌ No | Weather tool |
| `IMAGE_SERVICE_URL` | ❌ No | Bonsai image generation |
| `UNSPLASH_ACCESS_KEY` | ❌ No | Image search in frontend |

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
- New LLM tools and tool integrations
- Additional document format generators
- UI/UX improvements and new components
- Performance optimizations
- Bug fixes and tests

**Questions?** Open an issue or reach out to [@shounakjoshi88-a11y](https://github.com/shounakjoshi88-a11y)

---

<p align="center">
  <sub>🚀 Built with Bun · React 19 · PostgreSQL · NVIDIA NIM · Supabase · Tailwind CSS · E2B · Electron</sub>
  <br>
  <sub>📍 Flux — AI research companion with agentic tools, code sandbox, knowledge graph, and long-term memory</sub>
  <br>
  <sub><strong>Status:</strong> Active Development | <strong>License:</strong> MIT (coming soon)</sub>
</p>
