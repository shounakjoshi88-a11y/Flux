import { Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;
const INNER_EASE = [0.16, 1, 0.3, 1] as const;

export default function Privacy() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => { document.title = "Privacy"; }, []);

  useEffect(() => {
    document.documentElement.classList.add("custom-scrollbar");
    return () => document.documentElement.classList.remove("custom-scrollbar");
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = useCallback(() => window.scrollTo({ top: 0, behavior: "smooth" }), []);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Reading progress bar */}
      <motion.div className="fixed top-0 left-0 right-0 h-0.5 bg-primary/80 z-50 origin-left" style={{ scaleX }} />

      {/* Back to top button */}
      {showBackToTop && (
        <motion.button
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 size-10 rounded-full bg-primary/90 text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
        </motion.button>
      )}

      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-primary/4 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-teal-500/4 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
          className="mb-14"
        >
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-all font-mono tracking-wider mb-8"
          >
            <svg className="transition-transform group-hover:-translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Back to Flux
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[10px] text-primary tracking-[0.3em]">PRIVACY</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <h1 className="font-serif text-5xl sm:text-6xl tracking-tight text-foreground mb-4">
            Privacy Policy
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="font-mono">Version 1.0</span>
            <span className="size-1 rounded-full bg-border" />
            <span className="font-mono">Last Updated: June 27, 2026</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
          className="mb-14 p-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 text-sm leading-relaxed text-muted-foreground"
        >
          <div className="flex items-start gap-3">
            <svg className="size-5 text-amber-500/70 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <strong className="text-amber-500/90 block mb-1">DISCLAIMER:</strong>
              THIS DOCUMENT IS PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND DOES NOT CONSTITUTE LEGAL ADVICE. THIS PRIVACY POLICY IS DRAFTED BASED ON THE ACTUAL FUNCTIONALITY OF THE FLUX SOFTWARE AS OF THE EFFECTIVE DATE. YOU SHOULD CONSULT WITH LICENSED LEGAL COUNSEL IN YOUR JURISDICTION TO ENSURE COMPLIANCE WITH ALL APPLICABLE LAWS AND REGULATIONS BEFORE RELYING ON THIS POLICY. NEITHER THE FLUX PROJECT NOR ITS MAINTAINERS ASSUME ANY LIABILITY ARISING FROM THE USE OF OR RELIANCE UPON THIS DOCUMENT.
            </div>
          </div>
        </motion.div>

        <div className="space-y-16 text-sm leading-relaxed text-muted-foreground">

          {/* ── 1. INTRODUCTION ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">01</span>
              Introduction
            </h2>
            <p className="mb-3">
              This Privacy Policy (the "<strong className="text-foreground">Policy</strong>") describes how Flux ("
              <strong className="text-foreground">we</strong>," "<strong className="text-foreground">us</strong>," or "
              <strong className="text-foreground">our</strong>") collects, uses, processes, stores, discloses, and protects 
              Personal Data of individuals ("<strong className="text-foreground">you</strong>" or "
              <strong className="text-foreground">User</strong>") who access or use the Flux application, its associated 
              web interface, backend API services, and any related software or functionality (collectively, the "
              <strong className="text-foreground">Service</strong>").
            </p>
            <p className="mb-3">
              This Policy is intended to comply with the General Data Protection Regulation (EU) 2016/679 ("
              <strong className="text-foreground">GDPR</strong>"), the California Consumer Privacy Act of 2018 as 
              amended by the California Privacy Rights Act of 2020 (collectively, "<strong className="text-foreground">CCPA</strong>"), 
              the Digital Personal Data Protection Act, 2023 of India ("<strong className="text-foreground">DPDPA</strong>"), 
              and other applicable data protection laws. Capitalized terms used but not defined herein shall have the 
              meanings ascribed to them in the Terms of Service.
            </p>
            <p>
              By accessing or using the Service, you acknowledge that you have read and understood this Policy. 
              If you do not agree with any provision herein, you shall immediately discontinue use of the Service.
            </p>
          </motion.div>

          {/* ── 2. DEFINITIONS ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">02</span>
              Definitions
            </h2>
            <p className="mb-3">For the purposes of this Policy, the following terms shall have the meanings set forth below:</p>
            <div className="space-y-2 pl-4 border-l border-border/60">
              <p><strong className="text-foreground">"Personal Data"</strong> means any information relating to an identified or identifiable natural person as defined under applicable data protection laws, including but not limited to GDPR Article 4(1), CCPA Section 1798.140(v), and DPDPA Section 2(t).</p>
              <p><strong className="text-foreground">"Processing"</strong> means any operation or set of operations performed on Personal Data, whether or not by automated means, including collection, recording, organization, structuring, storage, adaptation, retrieval, consultation, use, disclosure, dissemination, erasure, or destruction.</p>
              <p><strong className="text-foreground">"Data Subject"</strong> means the identified or identifiable natural person to whom Personal Data relates.</p>
              <p><strong className="text-foreground">"Controller"</strong> means the natural or legal person which, alone or jointly with others, determines the purposes and means of the Processing of Personal Data.</p>
              <p><strong className="text-foreground">"Processor"</strong> means a natural or legal person which Processes Personal Data on behalf of the Controller.</p>
              <p><strong className="text-foreground">"Subprocessor"</strong> means any third-party Processor engaged by us to assist in Processing Personal Data.</p>
              <p><strong className="text-foreground">"Service"</strong> means the Flux application, including its frontend web interface (hosted at the designated URL), backend API services, WebSocket endpoints, and any associated infrastructure.</p>
              <p><strong className="text-foreground">"User Content"</strong> means any data, text, files, documents, code, images, or other materials submitted, uploaded, or generated by you through the Service.</p>
              <p><strong className="text-foreground">"Conversation Data"</strong> means the record of interactions between you and the Service, including prompts, responses, tool calls, file attachments, generated files, metadata, and associated timestamps.</p>
              <p><strong className="text-foreground">"Memory Data"</strong> means facts, preferences, project details, decisions, and feedback extracted from your conversations and stored as vector embeddings for the purpose of personalization.</p>
              <p><strong className="text-foreground">"Knowledge Graph Data"</strong> means the nodes (concepts, entities, topics) and edges (relationships) derived from your usage and stored to enable graph-based information retrieval.</p>
              <p><strong className="text-foreground">"Local Storage Data"</strong> means data stored exclusively on your device via the browser's localStorage API, as further described in Section 8.</p>
              <p><strong className="text-foreground">"Special Category Data"</strong> means personal data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, trade-union membership, genetic data, biometric data for unique identification, data concerning health, or data concerning a natural person's sex life or sexual orientation, as defined under GDPR Article 9.</p>
            </div>
          </motion.div>

          {/* ── 3. DATA CONTROLLER ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">03</span>
              Data Controller and Contact Information
            </h2>
            <p className="mb-3">
              Flux is provided as an open-source project. The project maintainers act as the Data Controller with 
              respect to Personal Data processed through the hosted version of the Service. For the purposes of 
              the GDPR (Article 4(7)), CCPA (Section 1798.140(c)), and DPDPA (Section 2(i)), the Controller is:
            </p>
            <div className="p-4 rounded-lg bg-card/60 border border-border/60 mb-3">
              <p className="text-foreground"><strong>Flux Project</strong></p>
              <p>Email: via GitHub Issues (github.com/anomalyco/Flux/issues)</p>
              <p>Response Time: We shall make commercially reasonable efforts to respond to inquiries within thirty (30) calendar days.</p>
            </div>
            <p>
              For purposes of GDPR Article 27, the Controller does not maintain an establishment in the European 
              Union. A representative within the EU may be designated upon request. For purposes of the DPDPA, 
              the Controller is based in India.
            </p>
          </motion.div>

          {/* ── 4. CATEGORIES OF PERSONAL DATA COLLECTED ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">04</span>
              Categories of Personal Data Collected
            </h2>
            <p className="mb-4">We collect and Process the following categories of Personal Data:</p>

            <h3 className="font-medium text-foreground mb-2">4.1 Identity and Authentication Data (mandatory)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Email Address:</strong> Collected from your Google or GitHub OAuth provider upon sign-in. Stored in both Supabase Auth (as <code className="text-primary text-xs bg-primary/10 px-1 rounded">auth.users.email</code>) and our PostgreSQL database via Prisma (User model: <code className="text-primary text-xs bg-primary/10 px-1 rounded">email</code> field).</p>
              <p><strong className="text-foreground">Full Name:</strong> Collected from your OAuth provider (<code className="text-primary text-xs bg-primary/10 px-1 rounded">user_metadata.full_name</code> or <code className="text-primary text-xs bg-primary/10 px-1 rounded">name</code>). Stored in the User model's <code className="text-primary text-xs bg-primary/10 px-1 rounded">name</code> field.</p>
              <p><strong className="text-foreground">OAuth Provider Identifier:</strong> The provider name ("github" or "google") as extracted from <code className="text-primary text-xs bg-primary/10 px-1 rounded">app_metadata.provider</code>. Stored in the User model's <code className="text-primary text-xs bg-primary/10 px-1 rounded">provider</code> field as an AuthProvider enum.</p>
              <p><strong className="text-foreground">Supabase User ID (UUID):</strong> The unique identifier assigned by Supabase Auth. Stored in the User model's <code className="text-primary text-xs bg-primary/10 px-1 rounded">supabaseId</code> field with a unique constraint.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">4.2 Conversation Data (mandatory for service operation)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Message Content:</strong> The full text of your questions, prompts, and uploaded file contents. Stored in the Message model's <code className="text-primary text-xs bg-primary/10 px-1 rounded">content</code> field.</p>
              <p><strong className="text-foreground">Message Role:</strong> Whether the message was sent by you ("User") or generated by the AI ("Assistant"), stored as a MessageRole enum.</p>
              <p><strong className="text-foreground">Conversation Metadata:</strong> Titles, slugs, timestamps (createdAt), and conversation-to-user associations stored in the Conversation model.</p>
              <p><strong className="text-foreground">File Attachments:</strong> Files you upload are stored as JSON blobs in the Message model's <code className="text-primary text-xs bg-primary/10 px-1 rounded">fileAttachment</code> field, containing file name, MIME type, and base64-encoded content.</p>
              <p><strong className="text-foreground">Generated Files:</strong> Documents, code, tables, and other artifacts created by the AI at your request are stored as JSON in the <code className="text-primary text-xs bg-primary/10 px-1 rounded">generatedFiles</code> field with filename, MIME type, and base64 content.</p>
              <p><strong className="text-foreground">Source Citations:</strong> URLs, domains, titles, and content summaries of web sources retrieved during research are stored as JSON in the <code className="text-primary text-xs bg-primary/10 px-1 rounded">sources</code> field.</p>
              <p><strong className="text-foreground">Thought Process:</strong> Step-by-step reasoning traces, search status events, and tool execution logs are stored as JSON in the <code className="text-primary text-xs bg-primary/10 px-1 rounded">thoughtProcess</code> field.</p>
              <p><strong className="text-foreground">Follow-Up Questions:</strong> Suggested follow-up questions generated by the AI are stored as JSON in the <code className="text-primary text-xs bg-primary/10 px-1 rounded">followUps</code> field.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">4.3 Memory Data (optional — enabled by default)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Memory Facts:</strong> Extracted facts, preferences, and project details stored as text in the Memory model's <code className="text-primary text-xs bg-primary/10 px-1 rounded">fact</code> field.</p>
              <p><strong className="text-foreground">Memory Categories:</strong> Classified as one of: <code className="text-primary text-xs bg-primary/10 px-1 rounded">preference</code>, <code className="text-primary text-xs bg-primary/10 px-1 rounded">project</code>, <code className="text-primary text-xs bg-primary/10 px-1 rounded">personal</code>, <code className="text-primary text-xs bg-primary/10 px-1 rounded">decision</code>, or <code className="text-primary text-xs bg-primary/10 px-1 rounded">feedback</code>.</p>
              <p><strong className="text-foreground">Vector Embeddings:</strong> 1024-dimensional vector representations of memory facts stored using the pgvector PostgreSQL extension for semantic similarity search.</p>
              <p><strong className="text-foreground">Memory Metadata:</strong> Importance score (float, default 0.5), access count, last accessed timestamp, and source conversation ID.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">4.4 Knowledge Graph Data (optional — enabled by default)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Wiki Nodes:</strong> Concepts, entities, and topics extracted from your conversations, stored with labels, descriptions, types (default "concept"), source URLs, and spatial coordinates (x, y) for graph visualization.</p>
              <p><strong className="text-foreground">Wiki Edges:</strong> Relationships between nodes with relationship labels (e.g., "related_to", "contradicts", "generates"), weights (default 1.0), and creation timestamps.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">4.5 Local Storage Data (client-side only)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Theme Preference:</strong> Stored under key <code className="text-primary text-xs bg-primary/10 px-1 rounded">flux-theme</code> with values "dark" or "light".</p>
              <p><strong className="text-foreground">Conversation Cache:</strong> Stored under key <code className="text-primary text-xs bg-primary/10 px-1 rounded">flux-conversations</code> as a JSON array of conversation summaries for rapid sidebar rendering.</p>
              <p><strong className="text-foreground">Active Conversation ID:</strong> Stored under key <code className="text-primary text-xs bg-primary/10 px-1 rounded">flux-active-conversation</code>.</p>
              <p><strong className="text-foreground">Message Parts:</strong> Individual message tool calls, responses, and state stored under keys <code className="text-primary text-xs bg-primary/10 px-1 rounded">flux-parts-{'{msgId}'}</code>.</p>
              <p><strong className="text-foreground">Tool Approval State:</strong> Stored under key <code className="text-primary text-xs bg-primary/10 px-1 rounded">flux-approvals</code>.</p>
              <p><strong className="text-foreground">TTS Preferences:</strong> Stored under keys <code className="text-primary text-xs bg-primary/10 px-1 rounded">tts_provider</code> and <code className="text-primary text-xs bg-primary/10 px-1 rounded">tts_voice</code>.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">4.6 Technical Data (automatically collected)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Request Metadata:</strong> IP address, request URL, HTTP method, origin header, and timestamp are captured in server access logs for operational purposes (logged via console at <code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts:47</code>).</p>
              <p><strong className="text-foreground">Internal User Identifiers:</strong> A local database UUID (<code className="text-primary text-xs bg-primary/10 px-1 rounded">appUserId</code>) is assigned to each user during the first authenticated request via Prisma user upsert (<code className="text-primary text-xs bg-primary/10 px-1 rounded">middleware.ts:42-46</code>).</p>
              <p><strong className="text-foreground">Search Query Cache:</strong> Anonymized or truncated search query texts (first 60 characters) may be cached in an in-memory cache for deduplication purposes (<code className="text-primary text-xs bg-primary/10 px-1 rounded">search-cache.ts</code>).</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">4.7 Special Category Data</h3>
            <p>
              We do not intentionally collect Special Category Data as defined under GDPR Article 9. Users are 
              instructed not to submit sensitive personal data through the Service. However, because the Service 
              processes free-form text (conversations, memories, file uploads), you may inadvertently include 
              Special Category Data in your User Content. We rely on your explicit consent (GDPR Article 9(2)(a)) 
              or the necessity of processing for the establishment, exercise, or defense of legal claims 
              (GDPR Article 9(2)(f)) to the extent such data is processed. You shall not submit Special Category 
              Data unless you have obtained all necessary consents and legal bases.
            </p>
          </motion.div>

          {/* ── 5. PURPOSES AND LEGAL BASES ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">05</span>
              Purposes of Processing and Legal Bases
            </h2>
            <p className="mb-4">We Process Personal Data for the following purposes and on the following legal bases:</p>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-4 font-medium text-foreground">Purpose</th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">Categories of Data</th>
                    <th className="text-left py-2 font-medium text-foreground">Legal Basis (GDPR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr><td className="py-2 pr-4 align-top">Authentication and Account Management</td><td className="py-2 pr-4 align-top">Identity and Authentication Data</td><td className="py-2 align-top">Performance of a contract (GDPR Art. 6(1)(b)); legitimate interest in secure access (GDPR Art. 6(1)(f))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Generating AI Responses</td><td className="py-2 pr-4 align-top">Conversation Data</td><td className="py-2 align-top">Performance of a contract (GDPR Art. 6(1)(b)); your consent (GDPR Art. 6(1)(a))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Long-Term Memory and Personalization</td><td className="py-2 pr-4 align-top">Memory Data</td><td className="py-2 align-top">Your consent (GDPR Art. 6(1)(a)); legitimate interest in service improvement (GDPR Art. 6(1)(f))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Knowledge Graph</td><td className="py-2 pr-4 align-top">Knowledge Graph Data</td><td className="py-2 align-top">Your consent (GDPR Art. 6(1)(a)); legitimate interest in enhanced information retrieval (GDPR Art. 6(1)(f))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Web Search and Research</td><td className="py-2 pr-4 align-top">Search queries (as Conversation Data)</td><td className="py-2 align-top">Performance of a contract (GDPR Art. 6(1)(b))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Code Execution</td><td className="py-2 pr-4 align-top">Uploaded code (as Conversation Data)</td><td className="py-2 align-top">Performance of a contract (GDPR Art. 6(1)(b))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Document Generation</td><td className="py-2 pr-4 align-top">Generated files (as Conversation Data)</td><td className="py-2 align-top">Performance of a contract (GDPR Art. 6(1)(b))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Content Safety Moderation</td><td className="py-2 pr-4 align-top">Conversation Data (processed by safety model)</td><td className="py-2 align-top">Legal obligation (GDPR Art. 6(1)(c)); legitimate interest in preventing abuse (GDPR Art. 6(1)(f))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Service Operations and Debugging</td><td className="py-2 pr-4 align-top">Technical Data, truncated query logs</td><td className="py-2 align-top">Legitimate interest in service maintenance (GDPR Art. 6(1)(f))</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Compliance and Legal Obligations</td><td className="py-2 pr-4 align-top">Identity and Authentication Data</td><td className="py-2 align-top">Legal obligation (GDPR Art. 6(1)(c))</td></tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground/70">
              Under the CCPA, we collect the categories of Personal Data listed in Section 4 for the business 
              purposes described above. We do not "sell" Personal Data as defined under CCPA Section 1798.140(t)(1). 
              Under the DPDPA, the purposes listed above constitute the "purpose" for which consent is obtained 
              from Data Principals (DPDPA Section 4).
            </p>
          </motion.div>

          {/* ── 6. THIRD-PARTY SUBPROCESSORS ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">06</span>
              Third-Party Subprocessors and Data Sharing
            </h2>
            <p className="mb-4">
              We engage the following Subprocessors to assist in providing the Service. Each Subprocessor has 
              access to Personal Data only to the extent necessary to perform its function and is contractually 
              bound to maintain adequate security and confidentiality.
            </p>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-4 font-medium text-foreground">Subprocessor</th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">Service Provided</th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">Data Accessed</th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground">Processing Location</th>
                    <th className="text-left py-2 font-medium text-foreground">Data Retention by Subprocessor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className="py-2 pr-4 align-top">Supabase Inc. (US)</td>
                    <td className="py-2 pr-4 align-top">Authentication (Auth), Database hosting (PostgreSQL), Row-Level Security</td>
                    <td className="py-2 pr-4 align-top">All Identity Data, all Conversation Data, all Memory Data, all Knowledge Graph Data. Stored via Prisma ORM and Supabase JS SDK.</td>
                    <td className="py-2 pr-4 align-top">Google Cloud Platform (us-central1 and other regions)</td>
                    <td className="py-2 align-top">Data retained per our retention policy (Section 7); Supabase does not independently retain data. See supabase.com/privacy</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">NVIDIA Corporation (US) — NIM</td>
                    <td className="py-2 pr-4 align-top">AI model inference (chat completion, summarization, content safety, embedding generation, reranking)</td>
                    <td className="py-2 pr-4 align-top">Message content, system prompts, tool call inputs, and context data sent during each API request to <code className="text-primary text-xs bg-primary/10 px-1 rounded">integrate.api.nvidia.com/v1</code></td>
                    <td className="py-2 pr-4 align-top">NVIDIA cloud infrastructure (US); see nvidia.com/privacy</td>
                    <td className="py-2 align-top">NVIDIA does not retain prompt or response data after inference completion. See NVIDIA NIM API documentation and privacy policy.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">Tavily (US)</td>
                    <td className="py-2 pr-4 align-top">Web search API — retrieves real-time information from the public internet in response to user queries</td>
                    <td className="py-2 pr-4 align-top">Search query text, search configuration parameters. Accessed via <code className="text-primary text-xs bg-primary/10 px-1 rounded">@tavily/core</code> SDK.</td>
                    <td className="py-2 pr-4 align-top">US; see tavily.com/privacy</td>
                    <td className="py-2 align-top">Per Tavily's privacy policy. Query data may be retained for service improvement.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">E2B Inc. (US)</td>
                    <td className="py-2 pr-4 align-top">Sandboxed code interpretation — executes user code in isolated cloud sandboxes via <code className="text-primary text-xs bg-primary/10 px-1 rounded">@e2b/code-interpreter</code></td>
                    <td className="py-2 pr-4 align-top">Code submitted for execution, execution output, environment state. Sandboxes are ephemeral by default.</td>
                    <td className="py-2 pr-4 align-top">US and other regions; see e2b.dev/privacy</td>
                    <td className="py-2 align-top">Ephemeral sandboxes are destroyed after execution (default 5-minute timeout). See E2B documentation.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">Hugging Face Inc. (US)</td>
                    <td className="py-2 pr-4 align-top">Alternative AI model inference via <code className="text-primary text-xs bg-primary/10 px-1 rounded">api-inference.huggingface.co/v1</code></td>
                    <td className="py-2 pr-4 align-top">Message content and context sent during API inference requests (only when Hugging Face model is selected)</td>
                    <td className="py-2 pr-4 align-top">US and EU; see huggingface.co/privacy</td>
                    <td className="py-2 align-top">Per Hugging Face's privacy policy. Prompt data not retained after inference.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">OpenWeatherMap Ltd (UK)</td>
                    <td className="py-2 pr-4 align-top">Weather data API — provides current conditions and forecasts</td>
                    <td className="py-2 pr-4 align-top">Location-based query parameters (city name or coordinates). No Personal Data transmitted.</td>
                    <td className="py-2 pr-4 align-top">UK; see openweathermap.org/privacy</td>
                    <td className="py-2 align-top">Per OpenWeatherMap's privacy policy.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 align-top">Google LLC (US) — Favicon Service</td>
                    <td className="py-2 pr-4 align-top">Serves favicon images for source URLs displayed in search results (via <code className="text-primary text-xs bg-primary/10 px-1 rounded">www.google.com/s2/favicons</code>)</td>
                    <td className="py-2 pr-4 align-top">Domain name extracted from source URLs. No Personal Data transmitted.</td>
                    <td className="py-2 pr-4 align-top">US; see policies.google.com/privacy</td>
                    <td className="py-2 align-top">Per Google's privacy policy.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mb-2"><strong className="text-foreground">Subprocessor Updates:</strong> We may engage additional Subprocessors to support the Service. We shall update this Policy to reflect any new Subprocessors. You may subscribe to notifications of Subprocessor changes by watching the Flux GitHub repository.</p>
            <p className="mb-2"><strong className="text-foreground">No Sale of Personal Data:</strong> We do not sell Personal Data as defined under the CCPA (Section 1798.140(t)(1)), the GDPR, or the DPDPA. We do not share Personal Data for cross-context behavioral advertising.</p>
            <p><strong className="text-foreground">No Automated Decision-Making:</strong> We do not engage in automated decision-making as defined under GDPR Article 22 that produces legal effects concerning you or similarly significantly affects you.</p>
          </motion.div>

          {/* ── 7. INTERNATIONAL DATA TRANSFERS ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">07</span>
              International Data Transfers
            </h2>
            <p className="mb-3">
              Your Personal Data may be transferred to and processed in countries other than your country of 
              residence, including the United States, where our Subprocessers (Section 6) are based.
            </p>
            <p className="mb-3">
              <strong className="text-foreground">Adequacy Decisions and Safeguards.</strong> For transfers of Personal 
              Data from the European Economic Area (EEA), Switzerland, or the United Kingdom to countries that 
              have not received an adequacy determination from the European Commission, we rely on: (i) Standard 
              Contractual Clauses (SCCs) as approved by the European Commission Implementing Decision 2021/914, 
              where our Subprocessors offer them; and (ii) Supplementary measures where required by the 
              Schrems II ruling (Case C-311/18).
            </p>
            <p className="mb-3">
              <strong className="text-foreground">Supabase Data Transfer.</strong> Supabase hosts data on Google Cloud 
              Platform. Google Cloud offers SCCs, a Data Processing Addendum (DPA), and maintains SOC 2 and 
              ISO 27001 certifications. Data may be stored in us-central1 or other GCP regions.
            </p>
            <p className="mb-3">
              <strong className="text-foreground">NVIDIA NIM Data Transfer.</strong> Inference requests are processed 
              in NVIDIA's cloud infrastructure located in the United States. NVIDIA is certified under the 
              EU-US Data Privacy Framework (DPF) and the UK Extension to the EU-US DPF.
            </p>
            <p className="mb-3">
              <strong className="text-foreground">India DPDPA Compliance.</strong> For Data Principals in India 
              (DPDPA Section 2(s)), data transfers outside India shall be subject to the restrictions and 
              conditions prescribed under DPDPA Section 16 and any subsequent rules. We shall ensure that 
              transfers to Subprocessors outside India are made only with your consent or under applicable 
              legal exemptions.
            </p>
            <p>
              <strong className="text-foreground">Your Rights Regarding Transfers.</strong> You may request a copy 
              of the appropriate safeguards used for international data transfers by contacting us as specified 
              in Section 3.
            </p>
          </motion.div>

          {/* ── 8. DATA RETENTION ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">08</span>
              Data Retention and Erasure
            </h2>
            <p className="mb-4">We retain Personal Data only as long as necessary to fulfill the purposes described in Section 5, subject to the following retention schedules:</p>

            <div className="overflow-x-auto custom-scrollbar mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 pr-4 font-medium text-foreground whitespace-nowrap">Data Category</th>
                    <th className="text-left py-2 pr-4 font-medium text-foreground whitespace-nowrap">Retention Period</th>
                    <th className="text-left py-2 font-medium text-foreground whitespace-nowrap">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr><td className="py-2 pr-4 align-top">Identity and Authentication Data</td><td className="py-2 pr-4 align-top">Duration of account + 90 days</td><td className="py-2 align-top">Legal obligation; account management</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Conversation Data</td><td className="py-2 pr-4 align-top">Until deleted by you or account termination</td><td className="py-2 align-top">Service functionality; user control</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Memory Data</td><td className="py-2 pr-4 align-top">Until deleted by you or pruned automatically</td><td className="py-2 align-top">Personalization; pruning occurs when count exceeds thresholds</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Knowledge Graph Data</td><td className="py-2 pr-4 align-top">Until deleted by you or account termination</td><td className="py-2 align-top">Service functionality</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Local Storage Data</td><td className="py-2 pr-4 align-top">Until cleared by you via browser settings</td><td className="py-2 align-top">Client-side only; not server-controlled</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Server Access Logs</td><td className="py-2 pr-4 align-top">Up to 90 days (rotating)</td><td className="py-2 align-top">Operational debugging and security</td></tr>
                  <tr><td className="py-2 pr-4 align-top">Backup Copies</td><td className="py-2 pr-4 align-top">Up to 30 days post-deletion</td><td className="py-2 align-top">Disaster recovery (residual data in backups)</td></tr>
                </tbody>
              </table>
            </div>

            <p className="mb-2"><strong className="text-foreground">User-Initiated Deletion.</strong> You may delete individual conversations through the Service interface at any time. When a conversation is deleted, all associated messages are permanently removed from the primary database (CASCADE delete). Memory items can be reviewed and deleted through the settings interface.</p>
            <p className="mb-2"><strong className="text-foreground">Account Deletion.</strong> To request complete account deletion, contact us through the mechanism specified in Section 3. Upon deletion, we shall remove your User record, all associated Conversations, Messages, Memories, WikiNodes, and WikiEdges from the active database. Residual copies may persist in encrypted backups for up to thirty (30) calendar days after deletion.</p>
            <p className="mb-2"><strong className="text-foreground">Automatic Pruning.</strong> The Memory system may automatically prune low-importance or infrequently accessed memories to maintain system performance. Pruned memories are permanently deleted.</p>
            <p><strong className="text-foreground">Right to Be Forgotten (GDPR Article 17).</strong> You have the right to obtain erasure of your Personal Data without undue delay where one of the grounds in GDPR Article 17(1) applies. To exercise this right, contact us as specified in Section 3. We shall respond within the timeframe required by applicable law.</p>
          </motion.div>

          {/* ── 9. COOKIES ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">09</span>
              Cookies and Similar Technologies
            </h2>
            <p className="mb-3">
              <strong className="text-foreground">9.1 Strictly Necessary Cookies.</strong> The Service uses only 
              server-side authentication cookies managed by Supabase SSR (<code className="text-primary text-xs bg-primary/10 px-1 rounded">@supabase/ssr</code>'s 
              <code className="text-primary text-xs bg-primary/10 px-1 rounded">createServerClient</code>) to maintain 
              your authenticated session. These cookies are strictly necessary for the Service to function and are 
              set only when you authenticate via OAuth. They are HTTP-only, Same-Site cookies and do not contain 
              tracking identifiers.
            </p>
            <p className="mb-3">
              <strong className="text-foreground">9.2 No Tracking or Analytics Cookies.</strong> We do not use any 
              tracking cookies, analytics cookies, advertising cookies, social media cookies, or third-party 
              cookies of any kind. We do not use web beacons, pixel tags, fingerprinting, or any other 
              client-side tracking technology.
            </p>
            <p className="mb-3">
              <strong className="text-foreground">9.3 Local Storage.</strong> As detailed in Section 4.5, we use the 
              browser's localStorage API (not cookies) to store user preferences and a cache of conversation data. 
              This data is not accessible to third parties and does not transmit data to our servers except where 
              it is part of your normal authenticated usage (e.g., cached conversations are independently stored 
              server-side).
            </p>
            <p className="mb-3">
              <strong className="text-foreground">9.4 Cookie Consent.</strong> Because we use only strictly necessary 
              cookies, a cookie consent banner is not required under the ePrivacy Directive (2002/58/EC) or 
              GDPR Article 5(3) (as interpreted by the EDPB Guidelines 3/2022). However, the Service includes a 
              CSS-based mechanism that automatically hides cookie consent banners rendered within proxied web 
              content during article summarization features (<code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts:5769</code>).
            </p>
            <p>
              <strong className="text-foreground">9.5 Managing Local Storage.</strong> You may clear localStorage at 
              any time through your browser's developer tools or privacy settings. Clearing localStorage will 
              not affect your authenticated session or server-side data, but may temporarily affect client-side 
              performance (e.g., slower sidebar rendering until the conversation list is re-fetched).
            </p>
          </motion.div>

          {/* ── 10. DATA SUBJECT RIGHTS ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">10</span>
              Data Subject Rights
            </h2>

            <h3 className="font-medium text-foreground mb-2">10.1 GDPR Rights (EEA, Swiss, and UK Data Subjects)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Right of Access (Article 15):</strong> You have the right to obtain confirmation as to whether Personal Data concerning you is being processed, and if so, access to that data and specified information including processing purposes, categories of data, recipients, retention periods, and your other rights.</p>
              <p><strong className="text-foreground">Right to Rectification (Article 16):</strong> You have the right to obtain the rectification of inaccurate Personal Data concerning you. Your name and email can be updated by re-authenticating through your OAuth provider.</p>
              <p><strong className="text-foreground">Right to Erasure (Article 17):</strong> As described in Section 8, you have the right to obtain erasure of your Personal Data.</p>
              <p><strong className="text-foreground">Right to Restriction of Processing (Article 18):</strong> You may obtain restriction of processing where you contest accuracy, the processing is unlawful, we no longer need the data but you require it for legal claims, or you have objected to processing.</p>
              <p><strong className="text-foreground">Right to Data Portability (Article 20):</strong> You have the right to receive your Personal Data in a structured, commonly used, and machine-readable format (e.g., JSON) and to transmit that data to another controller.</p>
              <p><strong className="text-foreground">Right to Object (Article 21):</strong> You may object to processing based on legitimate interests (Article 6(1)(f)), including profiling. We shall cease processing unless we demonstrate compelling legitimate grounds.</p>
              <p><strong className="text-foreground">Right to Withdraw Consent (Article 7(3)):</strong> Where processing is based on consent (e.g., Memory Data, Knowledge Graph Data), you may withdraw consent at any time without affecting the lawfulness of processing based on consent before its withdrawal. Memory and knowledge graph features can be disabled through the settings interface.</p>
              <p><strong className="text-foreground">Right to Lodge a Complaint (Article 77):</strong> You have the right to lodge a complaint with a supervisory authority in your Member State of habitual residence, place of work, or place of alleged infringement.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">10.2 CCPA Rights (California Residents)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Right to Know (Section 1798.110):</strong> You have the right to request that we disclose the categories and specific pieces of Personal Data we have collected about you, the categories of sources, the business purpose for collection, and the categories of third parties with whom we share data.</p>
              <p><strong className="text-foreground">Right to Delete (Section 1798.105):</strong> You have the right to request deletion of Personal Data we have collected from you, subject to certain exceptions (e.g., completing transactions, detecting security incidents, complying with legal obligations).</p>
              <p><strong className="text-foreground">Right to Opt-Out of Sale/Sharing (Section 1798.120):</strong> We do not sell or share Personal Data as defined under the CCPA. No opt-out is necessary.</p>
              <p><strong className="text-foreground">Right to Non-Discrimination (Section 1798.125):</strong> We shall not discriminate against you for exercising any of your CCPA rights.</p>
              <p><strong className="text-foreground">Right to Correct (Section 1798.106):</strong> You have the right to request correction of inaccurate Personal Data.</p>
              <p><strong className="text-foreground">Right to Limit Use of Sensitive Personal Data (Section 1798.121):</strong> We do not use sensitive personal data (as defined under CCPA) for purposes other than those necessary to provide the Service. Your conversation content may constitute sensitive personal data under the CCPA; we process it solely for the purpose of providing the Service you requested.</p>
              <p><strong className="text-foreground">Designated Methods for Requests:</strong> You may exercise your CCPA rights by contacting us through the mechanism specified in Section 3. We shall acknowledge receipt within ten (10) business days and respond substantively within forty-five (45) calendar days (extendable by an additional forty-five days with notice).</p>
              <p><strong className="text-foreground">Verification:</strong> We shall verify your identity using the email address associated with your account before processing requests. We may request additional information as reasonably necessary to confirm your identity.</p>
              <p><strong className="text-foreground">Authorized Agent:</strong> You may designate an authorized agent to make a request on your behalf. The agent must provide written authorization signed by you, and we may require you to verify your identity directly.</p>
            </div>

            <h3 className="font-medium text-foreground mb-2">10.3 DPDPA Rights (Indian Data Principals)</h3>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Right to Access (Section 11(1)):</strong> You have the right to obtain a summary of Personal Data processed by us and the processing activities undertaken.</p>
              <p><strong className="text-foreground">Right to Correction and Erasure (Section 11(2)):</strong> You have the right to correction of inaccurate or misleading Personal Data and completion of incomplete data. You also have the right to erasure of your Personal Data where the purpose for processing is no longer served.</p>
              <p><strong className="text-foreground">Right to Grievance Redressal (Section 13):</strong> You have the right to have any grievance regarding processing of your Personal Data addressed by us. We shall respond to grievances within the timeline prescribed under DPDPA rules.</p>
              <p><strong className="text-foreground">Right to Nominate (Section 14):</strong> You have the right to nominate another individual to exercise your data subject rights in the event of your death or incapacity, in accordance with DPDPA Section 14.</p>
              <p><strong className="text-foreground">Consent Manager (Section 6(5)):</strong> To the extent required by DPDPA rules, we may facilitate a Consent Manager platform through which you can manage, review, and withdraw consent.</p>
            </div>

            <p className="text-xs text-muted-foreground/70">
              All rights requests shall be processed free of charge, unless the request is manifestly unfounded, 
              excessive, or repetitive (GDPR Article 12(5); CCPA Section 1798.145(h)). In such cases, we may 
              charge a reasonable fee or refuse to act on the request.
            </p>
          </motion.div>

          {/* ── 11. SECURITY ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">11</span>
              Security Measures
            </h2>
            <p className="mb-4">We implement and maintain technical and organizational security measures in accordance with GDPR Article 32, CCPA Section 1798.81.5, and DPDPA Section 8(5) to protect Personal Data against accidental or unlawful destruction, loss, alteration, unauthorized disclosure, or access. These measures include:</p>

            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Encryption in Transit:</strong> All communications between the client and our servers are encrypted using TLS 1.2 or higher. The backend server is configured with HTTPS enabled (console output: "[TLS] HTTPS enabled" at server start).</p>
              <p><strong className="text-foreground">Authentication and Access Control:</strong> User authentication is managed through Supabase Auth using JWT tokens with automatic expiry and refresh. Every API request requiring authentication is validated against Supabase before processing (<code className="text-primary text-xs bg-primary/10 px-1 rounded">middleware.ts:28</code> — <code className="text-primary text-xs bg-primary/10 px-1 rounded">client.auth.getUser(token)</code>).</p>
              <p><strong className="text-foreground">HTTP Security Headers:</strong> The Service uses Helmet (<code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts</code> import) to set security-relevant HTTP headers including Content-Security-Policy, X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options, and others.</p>
              <p><strong className="text-foreground">Rate Limiting:</strong> The backend implements rate limiting via <code className="text-primary text-xs bg-primary/10 px-1 rounded">express-rate-limit</code> to mitigate abuse and brute-force attacks.</p>
              <p><strong className="text-foreground">CORS Restrictions:</strong> Cross-Origin Resource Sharing (CORS) is configured with an explicit allowlist of origins (<code className="text-primary text-xs bg-primary/10 px-1 rounded">process.env.CORS_ORIGINS</code> or default list in <code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts:58</code>).</p>
              <p><strong className="text-foreground">Input Validation:</strong> User inputs are validated using the Zod library (<code className="text-primary text-xs bg-primary/10 px-1 rounded">zod</code>) where applicable.</p>
              <p><strong className="text-foreground">Content Safety Filtering:</strong> A dedicated safety model (<code className="text-primary text-xs bg-primary/10 px-1 rounded">safety.ts</code>) processes inputs and outputs through NVIDIA NIM for content moderation.</p>
              <p><strong className="text-foreground">Database Security:</strong> The PostgreSQL database is hosted by Supabase with Row-Level Security (RLS) policies. Database connections are encrypted. The database password is stored as an environment variable (<code className="text-primary text-xs bg-primary/10 px-1 rounded">DATABASE_URL</code>) and not hard-coded.</p>
              <p><strong className="text-foreground">Secret Management:</strong> All API keys and secrets (NVIDIA NIM API key, Supabase secret, Tavily API key, E2B API key, Hugging Face API key, OpenWeatherMap API key) are stored as environment variables and never hard-coded in source files.</p>
              <p><strong className="text-foreground">Code Sandboxing:</strong> Code execution is performed in ephemeral, isolated sandboxes provided by E2B, which are destroyed after each execution session (default maximum runtime: 300 seconds / 5 minutes).</p>
              <p><strong className="text-foreground">Audit Logging:</strong> Server-side logging captures operational events. User IDs are logged in debug output for troubleshooting purposes (e.g., <code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts:86</code>, <code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts:3854</code>, <code className="text-primary text-xs bg-primary/10 px-1 rounded">index.ts:5256</code>). Full message content is logged only in the WebSocket debug path (<code className="text-primary text-xs bg-primary/10 px-1 rounded">websocket.ts:206</code>).</p>
            </div>

            <p>
              <strong className="text-foreground">Data Protection Impact Assessment (DPIA):</strong> Based on the nature, scope, context, and purposes of processing described in this Policy, a Data Protection Impact Assessment under GDPR Article 35 has not been conducted as the Service does not involve systematic profiling, large-scale processing of Special Category Data, or systematic monitoring of publicly accessible areas on a large scale. Users are advised to conduct their own risk assessment and consult with data protection authorities if required.
            </p>
          </motion.div>

          {/* ── 12. DATA BREACH ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">12</span>
              Data Breach Notification
            </h2>
            <p className="mb-3">
              In the event of a personal data breach (as defined under GDPR Article 4(12)), we shall:
            </p>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p>(i) Notify the relevant supervisory authority within seventy-two (72) hours of becoming aware of the breach, where feasible, as required under GDPR Article 33, unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons;</p>
              <p>(ii) Notify affected Data Subjects without undue delay where the breach is likely to result in a high risk to their rights and freedoms, as required under GDPR Article 34;</p>
              <p>(iii) Notify the Data Protection Board of India in accordance with DPDPA Section 8(6) and any applicable rules;</p>
              <p>(iv) Document all breaches, including the facts surrounding the breach, its effects, and the remedial action taken, as required under GDPR Article 33(5); and</p>
              <p>(v) Take all reasonably available measures to mitigate the adverse effects of the breach.</p>
            </div>
            <p>
              Notifications shall include the nature of the breach, the categories and approximate number of Data 
              Subjects and records concerned, the name and contact details of our point of contact, the likely 
              consequences, and the measures taken or proposed.
            </p>
          </motion.div>

          {/* ── 13. CHILDREN ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">13</span>
              Children's Privacy
            </h2>
            <p className="mb-3">
              The Service is not directed at, and we do not knowingly collect Personal Data from, children under 
              the age of thirteen (13) ("<strong className="text-foreground">Child</strong>" or "
              <strong className="text-foreground">Children</strong>"). If we become aware that a Child has provided 
              us with Personal Data, we shall take steps to delete such information promptly.
            </p>
            <p className="mb-3">
              In compliance with the Children's Online Privacy Protection Act (COPPA) (15 U.S.C. Sections 6501-6506), 
              we require verifiable parental consent before knowingly collecting Personal Data from Children under 
              13. Since we do not knowingly collect such data, we do not maintain a mechanism for parental consent.
            </p>
            <p>
              If you believe that a Child under 13 has provided us with Personal Data, please contact us immediately 
              through the mechanism specified in Section 3, and we shall expeditiously investigate and delete 
              such data.
            </p>
          </motion.div>

          {/* ── 14. POLICY CHANGES ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">14</span>
              Changes to This Privacy Policy
            </h2>
            <p className="mb-3">
              We reserve the right to update or modify this Policy at any time. When we make material changes, 
              we shall:
            </p>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p>(i) Update the "Last Updated" date at the top of this Policy;</p>
              <p>(ii) Notify you through the Service interface (e.g., a banner or modal) for material changes; and</p>
              <p>(iii) Where required by applicable law (e.g., GDPR Article 13(3)), notify you of material changes directly if we have your contact information.</p>
            </div>
            <p>
              Your continued use of the Service after the effective date of any modified Policy constitutes your 
              acceptance of the modified terms. If you do not agree to the modified Policy, you shall discontinue 
              use of the Service. We encourage you to review this Policy periodically.
            </p>
          </motion.div>

          {/* ── 15. GOVERNING LAW ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">15</span>
              Governing Law
            </h2>
            <p>
              This Policy shall be governed by and construed in accordance with the laws of India, without regard 
              to its conflict of laws principles. For Data Subjects in the European Union, this Policy shall 
              additionally be interpreted in accordance with the GDPR where it provides greater protection than 
              Indian law. For California residents, this Policy shall additionally be interpreted in accordance 
              with the CCPA where it provides greater protection.
            </p>
          </motion.div>

          {/* ── 16. COUNTRY-SPECIFIC DISCLOSURES ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
          >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-xs text-primary font-semibold tracking-widest tabular-nums">16</span>
              Country-Specific Disclosures
            </h2>
            <p className="mb-4">
              This Section 16 provides supplemental disclosures required by specific jurisdictions. The provisions 
              of this Section apply only to Data Subjects residing in the respective jurisdiction and shall be 
              interpreted in accordance with the laws of that jurisdiction. In the event of any conflict between 
              this Section 16 and the general provisions of this Policy, the provision affording greater protection 
              to the Data Subject shall prevail.
            </p>

            <h3 className="font-medium text-foreground mb-3">16.1 European Economic Area (EEA) — GDPR</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Data Controller Representation.</strong> As noted in Section 3, the Flux project does not maintain an establishment in the EEA. We have designated a representative in the EEA for purposes of GDPR Article 27. To contact our EEA representative, please use the contact mechanism in Section 3.</p>
              <p><strong className="text-foreground">Legal Bases.</strong> Our legal bases for processing are set forth in Section 5. Where we rely on legitimate interest (GDPR Article 6(1)(f)), we have conducted a legitimate interest assessment (LIA) balancing our interests against your rights and freedoms.</p>
              <p><strong className="text-foreground">Data Protection Officer.</strong> We have not designated a Data Protection Officer under GDPR Article 37 as we do not meet the criteria requiring mandatory appointment (large-scale systematic monitoring, large-scale processing of special categories of data, or processing of criminal convictions data).</p>
              <p><strong className="text-foreground">Automated Decision-Making.</strong> The Service does not engage in automated decision-making producing legal effects concerning Data Subjects (GDPR Article 22). AI-generated responses are provided as informational outputs and do not constitute automated decisions affecting legal rights.</p>
              <p><strong className="text-foreground">Profiling.</strong> The Memory feature may be considered profiling under GDPR Article 4(4). You may object to profiling based on legitimate interests at any time by disabling the memory feature through the settings interface.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> You have the right to lodge a complaint with the supervisory authority of your habitual residence, place of work, or place of alleged infringement. A list of EEA supervisory authorities is available at the European Data Protection Board (EDPB) website.</p>
              <p><strong className="text-foreground">Data Portability.</strong> Upon request, we shall provide your Personal Data in a structured, commonly used, machine-readable format (JSON) in accordance with GDPR Article 20.</p>
              <p><strong className="text-foreground">International Transfers.</strong> As described in Section 7, transfers of EEA Data Subjects' Personal Data to third countries are safeguarded by Standard Contractual Clauses (SCCs) under Commission Implementing Decision 2021/914, and supplementary measures where required.</p>
              <p><strong className="text-foreground">Right to Object to Direct Marketing.</strong> We do not engage in direct marketing. If we were to do so in the future, you would have an absolute right to object under GDPR Article 21(2).</p>
              <p><strong className="text-foreground">Processing of Special Categories.</strong> As noted in Section 4.7, we do not intentionally process Special Category Data (GDPR Article 9). Any inadvertent processing relies on your explicit consent or the necessity for the establishment, exercise, or defense of legal claims.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.2 United Kingdom — UK GDPR</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">UK Representative.</strong> The Flux project does not maintain an establishment in the United Kingdom. A UK representative under UK GDPR Article 27 may be designated upon request through our contact mechanism in Section 3.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The UK supervisory authority is the Information Commissioner's Office (ICO). You have the right to lodge a complaint with the ICO at ico.org.uk.</p>
              <p><strong className="text-foreground">International Transfers.</strong> Transfers of UK Data Subjects' Personal Data to third countries are safeguarded by the UK International Data Transfer Agreement (IDTA) or the UK Addendum to the EU SCCs, as applicable, and supplementary measures where required.</p>
              <p><strong className="text-foreground">Legal Bases.</strong> The legal bases for processing under the UK GDPR are materially identical to those set forth in Section 5 for the EU GDPR, with references to UK GDPR Articles where applicable.</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> All rights under UK GDPR Articles 15-22 apply as described in Section 10.1, with the ICO as the competent supervisory authority.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.3 United States — California (CCPA/CPRA) and State Laws</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">California Privacy Rights Act (CPRA) / CCPA.</strong> As described in Section 10.2, California residents have specific rights under the CCPA as amended by the CPRA. We provide the following additional disclosures:</p>
              <p><strong className="text-foreground">Categories of Personal Information Collected.</strong> We collect the following categories of Personal Information as defined under CCPA Section 1798.140(v): (i) Identifiers (name, email, OAuth ID); (ii) Commercial information (usage records, conversations); (iii) Internet or other electronic network activity information (usage data, technical data); (iv) Inferences drawn from any of the above (memory data, knowledge graph data). We do not collect protected classification characteristics, biometric information, or precise geolocation data.</p>
              <p><strong className="text-foreground">Categories of Sources.</strong> We collect Personal Information from: (i) you directly (through your conversations and file uploads); (ii) your OAuth Provider (Google or GitHub); and (iii) our Subprocessors (as described in Section 6).</p>
              <p><strong className="text-foreground">Business or Commercial Purpose for Collection.</strong> The business purposes for which we collect each category of Personal Information are set forth in Section 5.</p>
              <p><strong className="text-foreground">Categories of Third Parties.</strong> We disclose Personal Information to the categories of third parties identified in Section 6 (Subprocessors).</p>
              <p><strong className="text-foreground">Retention Periods.</strong> The retention periods for each category of Personal Information are set forth in Section 8.</p>
              <p><strong className="text-foreground">No Sale or Sharing.</strong> We do not sell Personal Information as defined under CCPA Section 1798.140(t)(1). We do not share Personal Information for cross-context behavioral advertising as defined under CCPA Section 1798.140(ah)(1). We have no actual knowledge of selling or sharing Personal Information of minors under 16 years of age.</p>
              <p><strong className="text-foreground">Sensitive Personal Information.</strong> We do not collect or process sensitive Personal Information as defined under CCPA Section 1798.140(ae) for purposes other than those specified in Section 1798.121(a). Conversation content may constitute sensitive Personal Information; we process it solely for the purpose of providing the Service you requested.</p>
              <p><strong className="text-foreground">Metrics (2025-2026).</strong> We received zero (0) verifiable CCPA requests for disclosure, deletion, or correction in the preceding twelve (12) month period. We have no metrics to report regarding average response times or denial rates.</p>

              <p className="mt-3"><strong className="text-foreground">Virginia (VCDPA).</strong> Virginia residents have rights under the Virginia Consumer Data Protection Act (VCDPA), effective January 1, 2023, including rights to access, correct, delete, and obtain portability of Personal Data, and to opt out of processing for targeted advertising, sale, or profiling. We do not engage in any of the processing activities subject to VCDPA opt-out rights.</p>
              <p><strong className="text-foreground">Colorado (CPA).</strong> Colorado residents have rights under the Colorado Privacy Act (CPA), effective July 1, 2023, which are substantially similar to the VCDPA. We do not engage in targeted advertising, sale of Personal Data, or profiling producing legal effects.</p>
              <p><strong className="text-foreground">Connecticut (CTDPA).</strong> Connecticut residents have rights under the Connecticut Data Privacy Act (CTDPA), effective July 1, 2023. The provisions applicable to Virginia and Colorado residents apply equally to Connecticut residents.</p>
              <p><strong className="text-foreground">Utah (UCPA).</strong> Utah residents have rights under the Utah Consumer Privacy Act (UCPA), effective December 31, 2023. The UCPA provides a narrower set of rights than the CCPA or VCDPA but includes rights to access, delete, and opt out of sale or targeted advertising.</p>
              <p><strong className="text-foreground">Other U.S. States.</strong> Residents of other U.S. states may have rights under their respective state privacy laws. We will honor valid requests to the extent required by applicable law.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.4 China — PIPL</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Personal Information Protection Law (PIPL).</strong> The PIPL (个人信息保护法), effective November 1, 2021, governs the processing of Personal Information of Data Subjects in China. The following additional provisions apply:</p>
              <p><strong className="text-foreground">Legal Basis.</strong> We process your Personal Information based on your consent (PIPL Article 13(1)), which you provide by authenticating with and using the Service. Consent for sensitive Personal Information (as defined under PIPL Article 28) is obtained separately where required.</p>
              <p><strong className="text-foreground">Sensitive Personal Information.</strong> To the extent that conversation content or file uploads contain sensitive Personal Information (including location data, biometric data, religious beliefs, or health information), we process such information only with your separate, explicit consent (PIPL Article 29).</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Your Personal Information may be transferred outside of China to our Subprocessors (Section 6). Under PIPL Articles 38-43, such transfers are based on: (i) a security assessment organized by the CAC (Cyberspace Administration of China) where required; (ii) standard contracts formulated by the CAC; or (iii) certification by a professional institution. We shall implement the required transfer mechanisms before any such transfer occurs.</p>
              <p><strong className="text-foreground">Individual Rights.</strong> Under PIPL Articles 44-50, you have the right to: (i) know and decide about the processing of your Personal Information; (ii) restrict or refuse processing by another party; (iii) access, copy, and port your Personal Information; (iv) correct or supplement inaccurate or incomplete Personal Information; (v) delete your Personal Information under the circumstances specified in PIPL Article 47; (vi) request explanation of our processing rules; and (vii) request deletion or cessation of processing upon withdrawal of consent.</p>
              <p><strong className="text-foreground">Data Security.</strong> We implement the technical and organizational measures described in Section 11 to meet the security obligations under PIPL Articles 51-55.</p>
              <p><strong className="text-foreground">Impact Assessment.</strong> Under PIPL Article 55, we conduct a Personal Information Protection Impact Assessment (PIPIA) before: (i) processing sensitive Personal Information; (ii) automating decision-making; (iii) entrusting processing to a third party; (iv) providing Personal Information to a third party; (v) transferring Personal Information abroad; and (vi) other processing activities that may significantly affect individuals' rights and interests.</p>
              <p><strong className="text-foreground">Notification of Breach.</strong> In the event of a data breach, we shall notify relevant authorities and affected individuals as required under PIPL Article 57.</p>
              <p><strong className="text-foreground">Data Processing Agreement.</strong> We enter into written data processing agreements with all third-party data Processors, as required under PIPL Article 21.</p>
              <p><strong className="text-foreground">Right to File a Complaint.</strong> You have the right to file a complaint with the CAC or other competent regulatory authority if you believe that your rights under PIPL have been violated.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.5 India — DPDPA</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Digital Personal Data Protection Act, 2023.</strong> The DPDPA governs the processing of digital Personal Data of Data Principals in India. The following additional provisions apply:</p>
              <p><strong className="text-foreground">Consent.</strong> We process your Personal Data based on the consent you provide when creating an Account and using the Service (DPDPA Section 4). You have the right to withdraw consent at any time, and the consequences of withdrawal (including inability to use certain features) shall be communicated to you (DPDPA Section 5).</p>
              <p><strong className="text-foreground">Notice.</strong> This Policy serves as the notice required under DPDPA Section 5, describing the Personal Data collected, the purpose of processing, the manner in which you may exercise your rights, and the manner in which grievances may be raised.</p>
              <p><strong className="text-foreground">Data Principal Rights.</strong> Your rights as a Data Principal under DPDPA Sections 11-14 are described in Section 10.3 of this Policy.</p>
              <p><strong className="text-foreground">Grievance Redressal.</strong> You have the right to have any grievance regarding the processing of your Personal Data addressed by us (DPDPA Section 13). We shall respond to grievances within the timeline prescribed under DPDPA rules. Our grievance contact mechanism is specified in Section 3.</p>
              <p><strong className="text-foreground">Data Fiduciary Obligations.</strong> As a Data Fiduciary (DPDPA Section 2(i)), we have implemented the security measures described in Section 11 (DPDPA Section 8(5)) and shall notify the Data Protection Board of India in the event of a data breach (DPDPA Section 8(6)).</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Transfer of Personal Data outside India is subject to DPDPA Section 16 and any subsequent rules or notifications issued by the Central Government regarding restricted territories.</p>
              <p><strong className="text-foreground">Consent Manager.</strong> To the extent required by DPDPA rules and regulations, we may facilitate integration with a Consent Manager platform (DPDPA Section 6(5)) through which you can manage, review, and withdraw your consent.</p>
              <p><strong className="text-foreground">Nomination.</strong> Under DPDPA Section 14, you have the right to nominate an individual to exercise your data subject rights in the event of your death or incapacity. Nominations may be submitted through our contact mechanism in Section 3.</p>
              <p><strong className="text-foreground">Significant Data Fiduciary.</strong> We do not currently meet the criteria for classification as a Significant Data Fiduciary under DPDPA Section 10. If we are so classified in the future, we shall comply with all additional obligations, including the appointment of a Data Protection Officer and the conduct of a Data Protection Impact Assessment.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.6 Brazil — LGPD</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Lei Geral de Proteção de Dados (LGPD).</strong> Law No. 13,709/2018 governs the processing of Personal Data of Data Subjects in Brazil. The following additional provisions apply:</p>
              <p><strong className="text-foreground">Legal Bases.</strong> We process your Personal Data on the following legal bases under LGPD Article 7: (i) your consent (Article 7(I)); (ii) compliance with a legal or regulatory obligation (Article 7(II)); (iii) for the regular exercise of rights (Article 7(VI)); and (iv) the legitimate interests of the controller or third party (Article 7(IX)). The mapping of processing activities to these bases is set forth in Section 5, with references to GDPR Articles replaced by corresponding LGPD Articles.</p>
              <p><strong className="text-foreground">Sensitive Personal Data.</strong> To the extent that conversation content contains sensitive Personal Data (LGPD Article 11 — including data concerning health, biometric data, political opinions, religious beliefs, and sexual orientation), we process such data on the basis of your explicit consent (Article 11(I)).</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under LGPD Articles 17-22, you have the rights to: (i) confirmation of the existence of processing; (ii) access to Personal Data; (iii) correction of incomplete, inaccurate, or outdated data; (iv) anonymization, blocking, or deletion of unnecessary or excessive data; (v) portability of data to another service provider; (vi) deletion of data processed with your consent; (vii) information about public and private entities with which we have shared data; (viii) information about the possibility of denying consent and its consequences; (ix) withdrawal of consent; and (x) review of automated decisions.</p>
              <p><strong className="text-foreground">International Transfers.</strong> Transfers of Personal Data to countries outside Brazil are permitted under LGPD Article 33 where: (i) the destination country provides an adequate level of protection (as determined by the ANPD); (ii) we have provided appropriate safeguards, including standard contractual clauses; or (iii) one of the specific exceptions in Article 33 applies (including your explicit consent, legal cooperation, or the protection of your life or physical safety).</p>
              <p><strong className="text-foreground">National Authority.</strong> The Brazilian National Data Protection Authority (ANPD — Autoridade Nacional de Proteção de Dados) is the supervisory authority. You have the right to lodge a complaint with the ANPD.</p>
              <p><strong className="text-foreground">Data Protection Officer.</strong> Our designated point of contact for LGPD matters is reachable through the mechanism specified in Section 3. Communications to the DPO shall be clearly marked as "LGPD Data Subject Request" in the subject line.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.7 Japan — APPI</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Act on the Protection of Personal Information (APPI).</strong> The APPI (個人情報の保護に関する法律), as amended in 2020 (effective April 1, 2022), governs the processing of Personal Information of Data Subjects in Japan. Japan has been recognized by the European Commission as providing adequate protection for Personal Data.</p>
              <p><strong className="text-foreground">Purpose of Use.</strong> We use Personal Information only within the scope of the purposes specified in Section 5 of this Policy, as required under APPI Article 17.</p>
              <p><strong className="text-foreground">Sensitive Personal Information.</strong> We do not intentionally collect sensitive Personal Information as defined under APPI Article 2(3) (including information on race, creed, social status, medical history, criminal record, and victims' rights). Any inadvertent collection requires your consent, which we rely on your use of the Service to imply.</p>
              <p><strong className="text-foreground">Third-Party Provision.</strong> As required under APPI Articles 23-24, we provide Personal Information to the Subprocessors listed in Section 6. Your consent for such provision is obtained through your agreement to this Policy and your use of the Service.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> When transferring Personal Information to third countries (APPI Article 24), we take necessary and appropriate measures to ensure the continuous protection of Personal Information, including entering into agreements with recipients that require equivalent levels of protection.</p>
              <p><strong className="text-foreground">Retention and Deletion.</strong> We retain Personal Information only as necessary to achieve the purposes of use (Section 8). We endeavor to delete Personal Information without delay after the purpose is achieved, subject to legal retention obligations.</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under APPI Articles 28-34, you have the right to: (i) request disclosure of retained Personal Data; (ii) request correction, addition, or deletion of Personal Data; (iii) request cessation of use or erasure; and (iv) request explanation of the processing. Requests shall be processed in accordance with APPI procedures.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Personal Information Protection Commission (PPC — 個人情報保護委員会) is Japan's supervisory authority. You have the right to seek dispute resolution through the PPC under APPI Article 60.</p>
              <p><strong className="text-foreground">Anonymous and Pseudonymous Data.</strong> We do not currently create or use anonymous or pseudonymous processed information as defined under APPI Articles 2(6) and 2(7). If we do so in the future, we shall comply with the applicable obligations under APPI Articles 41-49.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.8 South Korea — PIPA</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Personal Information Protection Act (PIPA).</strong> The PIPA (개인정보 보호법), as amended (Law No. 19234, effective March 24, 2023), governs the processing of Personal Information of Data Subjects in South Korea. PIPA is one of Asia's strictest data protection regimes.</p>
              <p><strong className="text-foreground">Legal Bases for Processing.</strong> We process your Personal Information based on: (i) your consent (PIPA Article 15(1)(1)); (ii) necessity for the performance of a contract (Article 15(1)(4)); and (iii) compliance with a legal obligation (Article 15(1)(5)). Consent is obtained through your acceptance of this Policy and use of the Service.</p>
              <p><strong className="text-foreground">Sensitive Information and Unique Identifying Information.</strong> We do not intentionally collect sensitive information under PIPA Article 23 (ideology, beliefs, political opinions, health, sexual life, genetic data, criminal records) or unique identifying information under PIPA Article 24 (resident registration number, passport number, driver's license number, alien registration number).</p>
              <p><strong className="text-foreground">Provision to Third Parties.</strong> Under PIPA Articles 17-18, we provide Personal Information to the Subprocessors listed in Section 6 based on your consent. We do not provide Personal Information to third parties beyond our Subprocessors without separate consent.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under PIPA Article 28-8, when transferring Personal Information to a third country, we obtain your separate consent and enter into protective measures with the recipient. We shall implement technical and administrative safeguards equivalent to those required under PIPA.</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under PIPA Articles 35-39, you have the right to: (i) request access to your Personal Information; (ii) request correction or deletion of your Personal Information; (iii) request suspension of processing of your Personal Information; and (iv) request explanation of the processing. Processing of access, correction, deletion, and suspension requests shall be completed within ten (10) days as required under PIPA Enforcement Decree Article 45.</p>
              <p><strong className="text-foreground">Chief Privacy Officer (CPO).</strong> A Chief Privacy Officer (개인정보 보호책임자) may be designated for the Service. Privacy-related inquiries may be directed to our contact mechanism in Section 3.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Personal Information Protection Commission (PIPC — 개인정보보호위원회) is South Korea's supervisory authority. You have the right to apply for dispute mediation through the PIPC's Personal Information Dispute Mediation Committee (PIPA Articles 40-43).</p>
              <p><strong className="text-foreground">Data Breach Notification.</strong> In the event of a Personal Information breach, we shall notify affected Data Subjects and the PIPC as required under PIPA Article 34 and its Enforcement Decree, including the time and circumstances of the breach, the categories of information leaked, remedial measures, and contact information.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.9 Singapore — PDPA</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Personal Data Protection Act (PDPA).</strong> The PDPA (No. 26 of 2012), as amended by the Personal Data Protection (Amendment) Act 2020 (effective February 1, 2021), governs the collection, use, and disclosure of Personal Data of Data Subjects in Singapore.</p>
              <p><strong className="text-foreground">Consent and Purpose Limitation.</strong> We collect, use, and disclose your Personal Data for the purposes set forth in Section 5 based on your deemed consent arising from your use of the Service (PDPA Sections 14-17). You may withdraw your consent at any time by discontinuing use of the Service, subject to contractual and legal restrictions.</p>
              <p><strong className="text-foreground">Notification Obligation.</strong> This Policy serves as the notification required under PDPA Section 20, informing you of the purposes for which we collect, use, and disclose your Personal Data.</p>
              <p><strong className="text-foreground">Access and Correction.</strong> Under PDPA Sections 21-22, you have the right to: (i) request access to your Personal Data in our possession; and (ii) request correction of any error or omission in your Personal Data. We shall respond to access requests within thirty (30) calendar days.</p>
              <p><strong className="text-foreground">Data Breach Notification.</strong> Under PDPA Section 26B (as amended 2020), we shall notify the Personal Data Protection Commission (PDPC) and affected Data Subjects of any data breach that results in significant harm or is of a significant scale, as soon as practicable.</p>
              <p><strong className="text-foreground">Transfer Limitation.</strong> Under PDPA Section 26, we shall not transfer your Personal Data to a country outside Singapore unless we have taken appropriate steps to ensure that the recipient provides a standard of protection comparable to the PDPA.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> Singapore's Personal Data Protection Commission (PDPC) is the supervisory authority. You have the right to make a complaint to the PDPC under PDPA Section 31 regarding any alleged violation of the PDPA.</p>
              <p><strong className="text-foreground">Data Protection Officer (DPO).</strong> Our DPO for PDPA purposes may be contacted through the mechanism in Section 3. Communications to the DPO shall be clearly marked as "PDPA Data Subject Request."</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.10 Australia — Privacy Act 1988</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Privacy Act 1988 (Cth) and Australian Privacy Principles (APPs).</strong> The Privacy Act 1988, as amended by the Privacy Amendment (Notifiable Data Breaches) Act 2017 and the Privacy Legislation Amendment (Enforcement and Other Measures) Act 2022, governs the handling of Personal Information of individuals in Australia.</p>
              <p><strong className="text-foreground">APP Compliance.</strong> We comply with the Australian Privacy Principles (APPs) as follows: APP 1 — we manage Personal Information openly and transparently through this Policy; APP 2 — you have the option to use the Service anonymously by not authenticating, though features will be limited; APP 3 — we collect only Personal Information reasonably necessary for the Service; APP 4 — we provide this Policy upon request; APP 5 — this Policy serves as our collection notice; APP 6 — we use Personal Information only for the purposes collected; APP 7 — we do not engage in direct marketing; APP 8 — we ensure overseas recipients of Personal Information comply with the APPs through contractual safeguards; APP 9 — we do not adopt government-issued identifiers as our own; APP 10 — we maintain the quality of Personal Information; APP 11 — we protect Personal Information through the security measures in Section 11; APP 12 — you have the right to access your Personal Information; APP 13 — you have the right to correct your Personal Information.</p>
              <p><strong className="text-foreground">Notifiable Data Breaches (NDB) Scheme.</strong> In the event of an eligible data breach (as defined under Part IIIC of the Privacy Act), we shall notify affected individuals and the Office of the Australian Information Commissioner (OAIC) as soon as practicable.</p>
              <p><strong className="text-foreground">Cross-Border Disclosure.</strong> Under APP 8, we ensure that our Subprocessors located outside Australia do not breach the APPs through contractual safeguards, including requirements equivalent to the APPs.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Office of the Australian Information Commissioner (OAIC) is the supervisory authority. You have the right to make a complaint to the OAIC under Part VI of the Privacy Act.</p>
              <p><strong className="text-foreground">Complaint Handling.</strong> We will investigate and respond to your privacy complaint within thirty (30) calendar days. If you are dissatisfied with our response, you may lodge a complaint with the OAIC.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.11 Canada — PIPEDA</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Personal Information Protection and Electronic Documents Act (PIPEDA).</strong> PIPEDA (S.C. 2000, c. 5), as amended by the Digital Charter Implementation Act 2022, governs the collection, use, and disclosure of Personal Information of Data Subjects in Canada in the course of commercial activities. Quebec's Law 25 (Loi sur la protection des renseignements personnels dans le secteur privé) applies to Data Subjects in Quebec.</p>
              <p><strong className="text-foreground">Ten Fair Information Principles.</strong> We comply with PIPEDA's ten fair information principles: (i) Accountability — we are responsible for Personal Information under our control; (ii) Identifying Purposes — the purposes for collection are identified in Section 5; (iii) Consent — we obtain your consent for collection, use, and disclosure; (iv) Limiting Collection — we collect only necessary information; (v) Limiting Use, Disclosure, and Retention — we use and disclose Personal Information only for the identified purposes; (vi) Accuracy — we maintain accurate Personal Information; (vii) Safeguards — we protect Personal Information through the measures in Section 11; (viii) Openness — this Policy provides transparency about our practices; (ix) Individual Access — you have the right to access and challenge your Personal Information; (x) Challenging Compliance — you may challenge our compliance through the mechanism in Section 3.</p>
              <p><strong className="text-foreground">Consent.</strong> Under PIPEDA S. 6.1, your consent is obtained through your use of the Service and acceptance of this Policy. You may withdraw consent at any time, subject to legal and contractual restrictions. Withdrawal may limit your ability to use the Service.</p>
              <p><strong className="text-foreground">Privacy Breach Notification.</strong> Under PIPEDA Part I.1 (S. 10.1-10.3), we shall notify affected individuals and the Office of the Privacy Commissioner of Canada (OPC) of any data breach posing a real risk of significant harm, as soon as feasible, and maintain a record of all breaches for 24 months as required.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under PIPEDA S. 5(3), Personal Information may be processed in countries outside Canada (as described in Section 7). We use contractual and other means to provide a comparable level of protection while the data is being processed by overseas Subprocessors.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Office of the Privacy Commissioner of Canada (OPC) is the federal supervisory authority. Quebec residents may also file a complaint with the Commission d'accès à l'information du Québec (CAI).</p>
              <p><strong className="text-foreground">Quebec Law 25.</strong> For Data Subjects in Quebec, additional rights under Law 25 include: (i) the right to be informed of the existence of a file of information concerning you; (ii) the right to request the communication of Personal Information in a structured, commonly used technological format; and (iii) the right to request the destruction of Personal Information no longer necessary for the purpose for which it was collected.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.12 South Africa — POPIA</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Protection of Personal Information Act (POPIA).</strong> The POPIA (Act No. 4 of 2013), effective July 1, 2021 (with enforcement from July 1, 2022), governs the processing of Personal Information of Data Subjects in South Africa. POPIA is closely modeled on the GDPR.</p>
              <p><strong className="text-foreground">Conditions for Lawful Processing.</strong> We comply with POPIA's eight conditions for lawful processing: (i) Accountability (Section 8) — we are responsible for compliance; (ii) Processing Limitation (Sections 9-12) — processing is lawful, minimal, and with your consent; (iii) Purpose Specification (Sections 13-14) — purposes are defined in Section 5; (iv) Further Processing Limitation (Section 15) — further processing is compatible with the original purpose; (v) Information Quality (Section 16) — we maintain accurate Personal Information; (vi) Openness (Sections 17-18) — this Policy serves as our notice; (vii) Security Safeguards (Sections 19-22) — we implement the measures in Section 11; and (viii) Data Subject Participation (Sections 23-25) — you have the access and correction rights described below.</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under POPIA Sections 23-25, you have the right to: (i) request confirmation of whether we hold Personal Information about you; (ii) request access to your Personal Information; (iii) request correction or deletion of your Personal Information that is inaccurate, irrelevant, excessive, out of date, or unlawfully obtained; and (iv) object, on reasonable grounds, to the processing of your Personal Information.</p>
              <p><strong className="text-foreground">Information Officer.</strong> Our Information Officer for POPIA purposes may be contacted through the mechanism in Section 3.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under POPIA Section 72, Personal Information may not be transferred to a third country unless: (i) the recipient is subject to a law providing an adequate level of protection; (ii) we have your consent; (iii) the transfer is necessary for contract performance; or (iv) the transfer is for your benefit and it is not reasonably practicable to obtain your consent.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Information Regulator (South Africa) is the supervisory authority. You have the right to lodge a complaint with the Information Regulator under POPIA Section 74.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.13 Mexico — LFPDPPP</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).</strong> The LFPDPPP, effective July 6, 2010, as amended, governs the processing of Personal Data of Data Subjects in Mexico by private entities.</p>
              <p><strong className="text-foreground">Principles of Data Protection.</strong> We comply with the LFPDPPP's principles: legality, consent, information, quality, purpose, loyalty, proportionality, and accountability (LFPDPPP Article 6).</p>
              <p><strong className="text-foreground">Consent.</strong> Under LFPDPPP Articles 8-10, we obtain your express consent for the processing of your Personal Data through your acceptance of this Policy. For sensitive Personal Data (LFPDPPP Article 3(V)), we obtain your explicit written consent.</p>
              <p><strong className="text-foreground">Privacy Notice.</strong> This Policy constitutes the integral privacy notice required under LFPDPPP Article 16 and the Regulations, containing: (i) our identity and domicile; (ii) the Personal Data collected; (iii) the purposes of processing; (iv) options to limit use or disclosure; (v) the means to exercise ARCO rights; and (vi) any data transfers.</p>
              <p><strong className="text-foreground">ARCO Rights.</strong> Under LFPDPPP Articles 22-28, you have the right to: (i) Access (Acceso) — know what Personal Data we hold; (ii) Rectification (Rectificación) — correct inaccurate data; (iii) Cancellation (Cancelación) — request deletion of data; and (iv) Opposition (Oposición) — object to processing for legitimate reasons. ARCO requests shall be processed within twenty (20) working days (extendable by twenty (20) working days with notice).</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under LFPDPPP Articles 36-37, transfers of Personal Data to third countries require: (i) your consent; (ii) that the recipient assumes the same obligations; and (iii) compliance with the LFPDPPP and its Regulations. Transfers to countries with inadequate protection are prohibited unless exceptions apply (Article 37).</p>
              <p><strong className="text-foreground">Security Breaches.</strong> Under LFPDPPP Articles 20-21 and the Regulations, we shall notify affected Data Subjects of any security breach affecting their Personal Data, including the nature of the breach, the compromised data, recommendations, and the actions taken.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The National Institute for Transparency, Access to Information and Personal Data Protection (INAI — Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales) is Mexico's data protection authority.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.14 Argentina — PDPA</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Personal Data Protection Act (PDPA — Ley 25.326).</strong> The PDPA, enacted in 2000 and amended in 2024, governs the processing of Personal Data of Data Subjects in Argentina. Argentina was the first country in Latin America to receive an adequacy decision from the European Commission (Decision 2003/490/EC).</p>
              <p><strong className="text-foreground">General Principles.</strong> We comply with the PDPA's principles including legality, purpose limitation, proportionality, data quality, and security (PDPA Articles 4-9).</p>
              <p><strong className="text-foreground">Rights (Habeas Data).</strong> Under PDPA Articles 14-16, you have the right to: (i) Access — request information about your Personal Data in our databases; (ii) Rectification — correct false or inaccurate data; (iii) Deletion — remove data whose collection is not legally required; and (iv) Confidentiality — keep your data confidential.</p>
              <p><strong className="text-foreground">Consent.</strong> Under PDPA Article 5, we process your Personal Data based on your written consent, obtained through your acceptance of this Policy and use of the Service.</p>
              <p><strong className="text-foreground">Sensitive Data.</strong> Under PDPA Article 7, we do not intentionally collect sensitive Personal Data (racial or ethnic origin, political opinions, religious beliefs, health data, sexual life). We will obtain your express written consent before collecting any sensitive data.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under PDPA Article 12, transfers to countries without adequate protection are prohibited unless: (i) you have given your express consent; (ii) the transfer is necessary for contract performance; (iii) the transfer is necessary for the protection of your health or life; or (iv) the transfer is required by international judicial cooperation.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Agency for Access to Public Information (AAIP — Agencia de Acceso a la Información Pública) is Argentina's data protection authority. You have the right to file a complaint with the AAIP under PDPA Article 29.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.15 Turkey — KVKK</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Law on Protection of Personal Data (KVKK — Kişisel Verilerin Korunması Kanunu).</strong> The KVKK (Law No. 6698), effective April 7, 2016, governs the processing of Personal Data of Data Subjects in Turkey. The KVKK is modeled on the GDPR.</p>
              <p><strong className="text-foreground">Legal Bases.</strong> We process your Personal Data on the following legal bases under KVKK Article 5: (i) your explicit consent (Article 5(1)); (ii) the necessity of processing for contract performance (Article 5(2)(c)); and (iii) the legitimate interests of the data controller (Article 5(2)(f)), provided that your fundamental rights and freedoms are not prejudiced.</p>
              <p><strong className="text-foreground">Sensitive Personal Data.</strong> Under KVKK Article 6, we do not intentionally collect sensitive Personal Data (health, sexual life, biometric, genetic, criminal convictions, racial or ethnic origin, political opinions, religious beliefs). Any such processing requires your explicit consent or other legal bases specified in Article 6(3).</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under KVKK Article 11, you have the right to: (i) learn whether your Personal Data is being processed; (ii) request information about the processing; (iii) learn the purpose of processing and whether it is being used for that purpose; (iv) know the third parties to whom data has been transferred; (v) request correction of incomplete or inaccurate data; (vi) request deletion or destruction of data under KVKK Article 7; (vii) request notification of correction, deletion, or destruction to third parties; (viii) object to processing that is detrimental to you; and (ix) claim damages for unlawful processing.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under KVKK Article 9, Personal Data may be transferred abroad only with your explicit consent and where the recipient country provides adequate protection (as determined by the Turkish Personal Data Protection Board — Kişisel Verileri Koruma Kurulu). Where adequate protection is not ensured, data controllers in Turkey and the recipient undertake adequate protection in writing.</p>
              <p><strong className="text-foreground">Data Controller Registry.</strong> We may be required to register with the Data Controllers Registry (VERBIS — Veri Sorumluları Sicil Bilgi Sistemi) under KVKK Article 16. If required, our VERBIS registration number will be provided upon request.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Turkish Personal Data Protection Authority (KVKK Kurumu — Kişisel Verileri Koruma Kurumu) is the supervisory authority.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.16 United Arab Emirates — UAE Data Protection Law</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Federal Decree-Law No. 45 of 2021.</strong> The UAE's federal data protection law, effective January 2, 2022, governs the processing of Personal Data of Data Subjects in the UAE. Separate data protection regulations apply in the Dubai International Financial Centre (DIFC Law No. 5 of 2020) and the Abu Dhabi Global Market (ADGM Data Protection Regulations 2021).</p>
              <p><strong className="text-foreground">Legal Bases.</strong> We process your Personal Data based on your express consent (Federal Law Article 4(1)), obtained through your acceptance of this Policy, and on the basis of legitimate interests (Article 4(4)) and legal obligations where applicable.</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under Federal Law Articles 13-17, you have the right to: (i) be informed of the collection and processing; (ii) access your Personal Data; (iii) request correction of inaccurate data; (iv) request deletion of data where the purpose is fulfilled or consent is withdrawn; (v) restrict processing; (vi) data portability; (vii) object to processing; and (viii) withdraw consent.</p>
              <p><strong className="text-foreground">Data Protection Officer.</strong> Under Federal Law Article 12(1), a Data Protection Officer may be appointed. Privacy-related inquiries may be directed to our contact mechanism in Section 3.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under Federal Law Article 21, Personal Data may be transferred outside the UAE where: (i) the recipient country has adequate data protection laws; (ii) the transfer is based on SCCs; or (iii) your explicit consent has been obtained.</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The UAE Data Office is the federal supervisory authority. For DIFC establishments, the DIFC Commissioner of Data Protection is the authority. For ADGM establishments, the ADGM Office of Data Protection is the authority.</p>
            </div>

            <h3 className="font-medium text-foreground mb-3">16.17 Saudi Arabia — PDPL</h3>
            <div className="pl-4 mb-6 space-y-2 border-l border-border/60">
              <p><strong className="text-foreground">Personal Data Protection Law (PDPL).</strong> The PDPL (issued by Royal Decree M/148 of 2021, as amended), effective with phased implementation through 2023-2024, governs the processing of Personal Data of Data Subjects in Saudi Arabia.</p>
              <p><strong className="text-foreground">Legal Bases.</strong> We process your Personal Data based on: (i) your express consent (PDPL Article 5(2)); (ii) the necessity of processing for contract performance (Article 5(3)); and (iii) compliance with a legal obligation (Article 5(5)).</p>
              <p><strong className="text-foreground">Sensitive Data.</strong> Under PDPL Article 2(4), sensitive data includes health data, genetic data, biometric data, criminal records, and data revealing racial or ethnic origin, political opinions, or religious beliefs. We do not intentionally collect sensitive data.</p>
              <p><strong className="text-foreground">Data Subject Rights.</strong> Under PDPL Article 29, you have the right to: (i) be informed of the processing; (ii) access your Personal Data; (iii) request correction of inaccurate data; (iv) request destruction of data where the purpose is fulfilled or consent is withdrawn; (v) request restriction of processing; (vi) data portability; and (vii) object to processing.</p>
              <p><strong className="text-foreground">Cross-Border Transfer.</strong> Under PDPL Articles 29-31, Personal Data may not be transferred outside Saudi Arabia unless: (i) the transfer does not violate Saudi national security or interests; (ii) the recipient country provides adequate protection; and (iii) the transfer is in accordance with the regulations issued by the Saudi Authority for Data and AI (SDAIA).</p>
              <p><strong className="text-foreground">Supervisory Authority.</strong> The Saudi Authority for Data and Artificial Intelligence (SDAIA) is the competent authority under the PDPL.</p>
            </div>

          </motion.div>

        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16C5 6 8 18 11 10S17 6 22 12" /></svg>
            <span className="font-serif text-base tracking-tight text-foreground">Flux</span>
          </div>
          <p className="text-xs text-muted-foreground/60">
            Built for people who want to see how AI thinks.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
