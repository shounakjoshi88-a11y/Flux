# Flux Details

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 + Framer Motion |
| Backend | Express 5 + TypeScript |
| Database | PostgreSQL 14+ with pgvector + Prisma 7 ORM |
| Auth | Supabase Auth (GitHub + Google OAuth) |
| Desktop | Electron 35 |
| Hosting | Vercel (frontend) + Azure Container Apps (backend) |
| AI | NVIDIA NIM API |

---

## AI Models (19+)

### General Purpose
- Mistral Large 3
- GLM 5.2
- Kimi K2.6
- Nemotron 3 / 4
- DeepSeek V4 Flash / Pro
- Qwen 3.5
- Step 3.7 Flash / Pro
- MiniMax M2.7 / M3
- Sarvam-M 2.0
- Stockmark 2.2
- Llama 4 Maverick

### Vision Models
- Nemotron Nano 12B V2 VL
- Kimi K2.6
- MiniMax M3
- DeepSeek V4 Pro

### Smart Model Management
- Circuit breaker — marks unhealthy after 3 failures in 5 min, auto-rotates
- Query routing — simple queries → cheap model, complex → expensive
- Vision detection — auto-routes image inputs to vision-capable models
- Model fallback chain — tries next healthy model on failure

---

## Chat Systems

### SSE Transport (`/flux_ask`)
- Fetch with ReadableStream
- 30+ custom SSE event types (status, thought, file, tool_call, agent_status, permission, etc.)
- Offline message queue via IndexedDB
- Message editing and retry

### WebSocket Transport (`/agent`)
- 9-state session machine (idle → connecting → warming_up → ready → processing → awaiting_permission → cooldown → error → finished)
- 4 agent modes: default, plan, yolo
- Multi-agent team sessions
- Permission approval system (localStorage-backed)
- O(1) message index

---

## Agent Tools (21)

| Tool | Description |
|---|---|
| `web_search` | Live web search via Tavily API |
| `read_skill` | Load skill markdown files for guided generation |
| `generate_document` | Generate PDF, DOCX, PPTX, XLSX, CSV, TSV, MD, JSON, SQL, HTML |
| `get_weather` | Real-time weather data |
| `generate_image` | Image generation via Bonsai diffusion model |
| `run_python` | Execute Python in E2B sandbox |
| `run_bash` | Execute shell commands in E2B sandbox |
| `read_file` | Read files from sandbox |
| `write_file` | Write files to sandbox |
| `edit_file` | Edit files in sandbox |
| `list_files` | List files in sandbox |
| `install_package` | Install packages in sandbox |
| `wiki_search` | Search knowledge graph |
| `create_project` | Scaffold new projects in sandbox |
| `start_app` | Host web apps from sandbox |
| `stop_app` | Stop hosted apps |
| `list_apps` | List running apps |
| `get_app_logs` | Get app logs |
| `get_url` | Get app URL |
| `get_generated_file` | Fetch generated files |
| `read_url` | Read and parse URL content |

### Google Integrations
- Gmail: search, read, send, list threads
- Calendar: list events, create events
- Drive: search files, read files, list folders

---

## Document Generation

| Format | Details |
|---|---|
| PDF | 4 templates (Corporate, Minimal, Creative, Report), CJK font support |
| DOCX | Rich Word documents |
| PPTX | PowerPoint presentations with slides |
| XLSX | Excel spreadsheets |
| CSV / TSV | Tabular data |
| MD | Markdown |
| JSON / SQL / HTML | Structured formats |

---

## Long-Term Memory

- Automatic fact extraction (5 categories: preference, project, personal, decision, feedback)
- BGE-M3 embeddings (1024-dim via ONNX worker thread)
- pgvector HNSW index for similarity search
- Importance scoring and deduplication
- Context injection into system prompt
- Memory pruning (junk/duplicate cleanup)

---

## Knowledge Graph (Wiki)

- Automatic concept extraction from conversations
- 9 relationship types between concepts
- Graph CRUD operations
- Rebuild from conversation history
- 3D visualization (Three.js / react-three-fiber)

---

## Code Execution Sandbox

- E2B Firecracker microVMs (per-conversation persistence)
- Python data science stack (numpy, pandas, matplotlib, etc.)
- File operations (read, write, edit, list)
- Package installation
- Web app hosting with public URLs
- Project scaffolding

---

## Long-Running Task System

- Intent classification (SIMPLE / COMPLEX / LONG_TASK)
- Multi-step DAG planning with dependency resolution
- Sequential step execution with sandbox tools
- Heartbeat monitoring and automatic recovery
- Pause / resume / cancel
- Persistence across server restarts

---

## Orchestrator Engine

- Multi-phase workflow execution
- Planner — decomposes queries into phases
- Verifier — validates phase results
- Automatic load skill → research → generate document/image/weather

---

## Agent Communication Protocol (WebSocket)

- 9 session states
- 4 agent modes (default, plan, yolo, team)
- 20+ message types
- Multi-agent team orchestration
- Permission request/response system
- Model selector per session

---

## News Aggregation

- Multi-source RSS feeds (BBC, NPR, Reuters, CNN, Ars Technica, Wired, etc.)
- HackerNews Firebase API integration
- Categorized feeds
- News search via Tavily

---

## Voice I/O

- Browser Speech Recognition (speech-to-text)
- Edge TTS (cloud voices)
- Piper TTS (local, on-device)
- Audio waveform animation in chat input

---

## Content Analysis

- Article summarization via AI
- Web proxy (strips CSP and X-Frame-Options)
- Source reputation scoring (70+ domains)
- File analysis: code symbol extraction, file category detection, smart context sampling

---

## Conversation Management

- Full-text search across conversations
- Auto-titling
- Message editing and deletion
- Undo delete
- Artifacts gallery
- File attachments (images, documents, code)
- Cross-device sync via Supabase Realtime

---

## Caching & Offline

### Multi-Tier Caching
- In-memory LRU cache (45-second TTL)
- IndexedDB with Segmented LRU eviction
- Gzip compression via native CompressionStream
- Storage quota estimation and budget allocation
- Content-hashed filenames (long-term CDN caching)

### Offline Support
- IndexedDB offline message queue
- Auto-flush on connectivity restore
- Service Worker (PWA)

---

## Performance

- Performance context provider (high/low tier)
- Adaptive quality settings
- Conditional Framer Motion disabling on low tier
- Backdrop blur disabling on low tier
- Hover animation disabling on low tier
- GPU acceleration hints (will-change, transform Z)

---

## Design System

- Warm cream + coral palette
- 3 surface modes (cream canvas, light cream cards, dark navy)
- Serif headings (Cormorant Garamond), sans body (Inter/Geist)
- Monospace code (JetBrains Mono)
- Complete token architecture in dashboard.css

---

## Desktop App (Electron)

- Single instance lock
- Deep link support (`flux://`)
- Window state persistence
- Splash screen
- System tray icon
- Close-to-tray behavior
- Auto-updater (GitHub releases)
- Navigation guard (blocks off-domain URLs)
- Offline fallback page
- Custom title bar

---

## Security

- Supabase JWT authentication
- Rate limiting (global, AI, new conversation)
- SSRF protection (DNS-level private IP blocking)
- CSP headers (Helmet)
- Content Security Policy via Electron
- Tool permission approval system
- Hallucination guards on search results

---

## Deployment

- Frontend: Vercel (SPA with Bun build)
- Backend: Azure Container Apps (Docker)
- Desktop: electron-builder (Windows NSIS, macOS DMG, Linux AppImage)
- GitHub Releases for auto-update

---

## Database Schema (PostgreSQL + pgvector)

| Model | Key Fields |
|---|---|
| User | email, provider, supabaseId |
| Conversation | title, slug, compaction |
| Message | content, role, sources, generatedFiles, parts |
| Memory | fact, category, embedding (vector(1024)), importance |
| DocumentChunk | text, embedding (vector(1024)), searchVector (tsvector) |
| Task | status, goal, sandboxId, plan, maxDurationSecs |
| TaskStep | index, status, dependsOn, toolCalls, retryCount |
| WikiNode | label, description, type, position |
| WikiEdge | sourceId, targetId, relationship, weight |
| UserGoogleToken | accessToken, refreshToken, scope |

---

## Frontend Architecture

| Area | Details |
|---|---|
| State | React hooks + Context (no Redux) |
| Routing | React Router v7 with lazy-loaded pages |
| UI | shadcn/ui (Radix primitives, CVA variants) |
| Animations | Framer Motion |
| Virtual List | react-virtuoso (message list) |
| Markdown | react-markdown + rehype-katex + remark-gfm |
| Charts | recharts + d3 + mermaid |
| 3D | Three.js + react-three-fiber |
| Icons | Lucide, Iconify, IconPark |
| Math | KaTeX |
| Code | Monaco Editor, CodeMirror, react-syntax-highlighter |
| Files | docx, pptxgenjs, xlsx, pdf-lib, mammoth, officeparser |

---

## Backend Architecture

| Area | Details |
|---|---|
| Framework | Express 5 |
| ORM | Prisma 7 |
| AI SDK | Vercel AI SDK (streamText, generateText, tool) |
| WebSocket | ws library |
| Real-time | Supabase Realtime Broadcast |
| Embeddings | @xenova/transformers (bge-m3 ONNX) |
| Image Gen | Python Bonsai diffusion service |
| PDF Parsing | Python pymupdf4llm |
| File Generation | pdf-lib, docx, pptxgenjs, xlsx |
| Voice | Piper TTS binary, Edge TTS |
| Search | Tavily API |
| Sandbox | E2B code-interpreter |
