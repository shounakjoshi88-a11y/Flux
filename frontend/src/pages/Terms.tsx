import { Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Terms() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => { document.title = "Terms"; }, []);

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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="mb-12"
        >
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono tracking-wider mb-8"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Back to Flux
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-[10px] text-primary tracking-[0.3em]">TERMS</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl tracking-tight text-foreground mb-3">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground font-mono">Version 1.0 — Last Updated: June 27, 2026</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-12 p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm leading-relaxed text-muted-foreground"
        >
          <strong className="text-amber-500/90 block mb-1">DISCLAIMER:</strong>
          THIS DOCUMENT IS PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND DOES NOT CONSTITUTE LEGAL ADVICE. THIS TERMS OF SERVICE IS DRAFTED BASED ON THE ACTUAL FUNCTIONALITY AND INTENDED USE OF THE FLUX SOFTWARE AS OF THE EFFECTIVE DATE. YOU SHOULD CONSULT WITH LICENSED LEGAL COUNSEL IN YOUR JURISDICTION BEFORE RELYING ON THIS AGREEMENT. NEITHER THE FLUX PROJECT NOR ITS MAINTAINERS ASSUME ANY LIABILITY ARISING FROM THE USE OF OR RELIANCE UPON THIS DOCUMENT.
        </motion.div>

        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground">

          {/* ── 1. DEFINITIONS ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">01</span>
              Section 1 — Definitions
            </h2>
            <p className="mb-3">The following capitalized terms shall have the meanings ascribed to them in this Section 1, unless the context otherwise requires:</p>
            <div className="space-y-2 pl-4 border-l border-border/60">
              <p><strong className="text-foreground">"Acceptable Use Policy"</strong> or <strong className="text-foreground">"AUP"</strong> means the acceptable use provisions set forth in Section 5.</p>
              <p><strong className="text-foreground">"Account"</strong> means the unique user profile created when you authenticate with the Service via a Supported OAuth Provider.</p>
              <p><strong className="text-foreground">"Agreement"</strong> means these Terms of Service, including all schedules, annexes, and policies referenced herein.</p>
              <p><strong className="text-foreground">"AI Model"</strong> means any large language model, embedding model, reranking model, or other artificial intelligence model accessed through a Third-Party AI Provider to generate responses, summaries, embeddings, or other outputs.</p>
              <p><strong className="text-foreground">"Confidential Information"</strong> means any non-public information disclosed by one Party to the other, whether orally or in writing, that is designated as confidential or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure.</p>
              <p><strong className="text-foreground">"Content"</strong> means any data, text, files, documents, code, images, audio, video, or other materials submitted, uploaded, transmitted, displayed, or generated through the Service.</p>
              <p><strong className="text-foreground">"Data Protection Laws"</strong> means all applicable laws and regulations relating to the processing of Personal Data, including but not limited to the GDPR, the CCPA, and the DPDPA.</p>
              <p><strong className="text-foreground">"Documentation"</strong> means any written or electronic documentation, instructions, or guides provided by Flux regarding the use of the Service.</p>
              <p><strong className="text-foreground">"Effective Date"</strong> means June 27, 2026.</p>
              <p><strong className="text-foreground">"Feedback"</strong> means any suggestions, enhancement requests, recommendations, corrections, or other feedback provided by you regarding the Service.</p>
              <p><strong className="text-foreground">"Flux"</strong>, <strong className="text-foreground">"we"</strong>, <strong className="text-foreground">"us"</strong>, or <strong className="text-foreground">"our"</strong> means the Flux project maintainers and operators.</p>
              <p><strong className="text-foreground">"Intellectual Property Rights"</strong> or <strong className="text-foreground">"IP Rights"</strong> means all patents, copyrights, trademarks, trade secrets, database rights, moral rights, and any other intellectual property rights, whether registered or unregistered.</p>
              <p><strong className="text-foreground">"Losses"</strong> means all losses, damages, liabilities, costs, and expenses, including reasonable legal fees and court costs.</p>
              <p><strong className="text-foreground">"OAuth Provider"</strong> means Google LLC or GitHub, Inc., the third-party identity providers through which you authenticate with the Service.</p>
              <p><strong className="text-foreground">"Personal Data"</strong> or <strong className="text-foreground">"Personal Information"</strong> has the meaning set forth in applicable Data Protection Laws.</p>
              <p><strong className="text-foreground">"Privacy Policy"</strong> means the Flux Privacy Policy, incorporated herein by reference.</p>
              <p><strong className="text-foreground">"Sandbox Services"</strong> means the code execution feature of the Service provided through E2B, which enables you to execute code in a cloud-based, ephemeral, isolated sandbox environment.</p>
              <p><strong className="text-foreground">"Service"</strong> means the Flux application, including its frontend web interface, backend API services, WebSocket endpoints, and all associated software, features, and functionality.</p>
              <p><strong className="text-foreground">"Supported OAuth Providers"</strong> means Google and GitHub, as may be updated from time to time at our sole discretion.</p>
              <p><strong className="text-foreground">"Third-Party AI Provider"</strong> means NVIDIA (via the NIM API at <code className="text-primary text-xs bg-primary/10 px-1 rounded">integrate.api.nvidia.com/v1</code>), Hugging Face (via <code className="text-primary text-xs bg-primary/10 px-1 rounded">api-inference.huggingface.co/v1</code>), or any other AI model provider we may engage to process User Content for the purpose of generating AI responses.</p>
              <p><strong className="text-foreground">"User"</strong>, <strong className="text-foreground">"you"</strong>, or <strong className="text-foreground">"your"</strong> means the individual accessing or using the Service.</p>
              <p><strong className="text-foreground">"User Content"</strong> means all Content submitted, uploaded, or transmitted by you through the Service.</p>
              <p><strong className="text-foreground">"Flux Output"</strong> means all Content generated by the Service in response to your User Content, including AI-generated text, summaries, code, documents, images, and knowledge graph data.</p>
              <p><strong className="text-foreground">"Website"</strong> means the Flux web application hosted at the designated URL.</p>
            </div>
          </motion.section>

          {/* ── 2. ACCEPTANCE AND ELIGIBILITY ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">02</span>
              Section 2 — Acceptance and Eligibility
            </h2>
            <p className="mb-3">
              <strong>2.1 Acceptance.</strong> By accessing or using the Service, you acknowledge that you have read, 
              understood, and agree to be legally bound by this Agreement. If you do not agree to any provision 
              of this Agreement, you shall not access or use the Service.
            </p>
            <p className="mb-3">
              <strong>2.2 Eligibility.</strong> You represent and warrant that: (a) you are at least thirteen (13) years 
              of age; (b) if you are under the age of majority in your jurisdiction (typically eighteen (18) years), 
              you have obtained the consent of a parent or legal guardian to be bound by this Agreement; 
              (c) you have the full power and authority to enter into this Agreement; and (d) you are not located 
              in a country that is subject to a U.S. government embargo or that has been designated by the U.S. 
              government as a "terrorist supporting" country.
            </p>
            <p className="mb-3">
              <strong>2.3 Prohibited Jurisdictions.</strong> We reserve the right to restrict or prohibit access to 
              the Service from any jurisdiction where the Service would violate applicable laws or regulations. 
              You are solely responsible for ensuring that your use of the Service complies with all applicable 
              laws in your jurisdiction.
            </p>
            <p>
              <strong>2.4 Open-Source License.</strong> This Agreement governs your use of the hosted version of the 
              Service. If you self-host the Flux software, your use of the underlying software is additionally 
              governed by the applicable open-source license provided with the source code repository. In the 
              event of any conflict between this Agreement and the open-source license, this Agreement shall 
              govern your use of the hosted Service.
            </p>
          </motion.section>

          {/* ── 3. ACCOUNT REGISTRATION ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">03</span>
              Section 3 — Account Registration and Security
            </h2>
            <p className="mb-3">
              <strong>3.1 Account Creation.</strong> To access the Service, you must authenticate using a Supported 
              OAuth Provider. Flux does not maintain its own password database. By authenticating through a 
              Supported OAuth Provider, you authorize us to access certain account information from that provider, 
              including your name and email address, as described in the Privacy Policy.
            </p>
            <p className="mb-3">
              <strong>3.2 Account Security.</strong> You are solely responsible for maintaining the confidentiality 
              and security of your OAuth Provider credentials. Flux shall not be liable for any loss or damage 
              arising from unauthorized use of your Account resulting from your failure to safeguard your OAuth 
              credentials.
            </p>
            <p className="mb-3">
              <strong>3.3 Account Activity.</strong> You are responsible for all activity occurring under your 
              Account, including all User Content submitted and all Flux Output generated. You shall notify us 
              immediately upon becoming aware of any unauthorized use of your Account.
            </p>
            <p className="mb-3">
              <strong>3.4 Session Management.</strong> You can view and manage active sessions, revoke individual 
              sessions, or sign out of all sessions globally through the settings interface. Session revocation 
              is processed through Supabase Auth RPC calls (<code className="text-primary text-xs bg-primary/10 px-1 rounded">revoke_user_session</code> and 
              <code className="text-primary text-xs bg-primary/10 px-1 rounded">signOut({'{ scope: "global" }'})</code> respectively).
            </p>
            <p>
              <strong>3.5 Account Suspension.</strong> We reserve the right to suspend or terminate your Account 
              at any time, without prior notice or liability, for any reason, including but not limited to a 
              breach of this Agreement, illegal activity, or conduct that we determine may harm other users, 
              third parties, or the Service itself.
            </p>
          </motion.section>

          {/* ── 4. LICENSE GRANT ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">04</span>
              Section 4 — License Grant and Restrictions
            </h2>
            <p className="mb-3">
              <strong>4.1 License Grant.</strong> Subject to your compliance with this Agreement, we grant you a 
              limited, non-exclusive, non-transferable, non-sublicensable, revocable license to access and use 
              the Service for your personal or internal business purposes during the term of this Agreement.
            </p>
            <p className="mb-3">
              <strong>4.2 License Restrictions.</strong> You shall not, and shall not permit any third party to: 
              (a) copy, modify, adapt, translate, or create derivative works of the Service, except as expressly 
              permitted by the open-source license for self-hosted instances; (b) reverse engineer, decompile, 
              disassemble, or otherwise attempt to derive the source code of the Service, except to the extent 
              expressly permitted by applicable law; (c) sell, resell, lease, rent, distribute, or commercially 
              exploit the Service, except as expressly permitted; (d) remove, alter, or obscure any proprietary 
              notices or labels on the Service; (e) use the Service to develop a competing product or service; 
              (f) use the Service in any manner that exceeds rate limits or other usage parameters; or 
              (g) use the Service in any manner that violates this Agreement or applicable law.
            </p>
            <p>
              <strong>4.3 Reservation of Rights.</strong> All rights not expressly granted to you in this Agreement 
              are reserved by Flux. The Service is licensed, not sold, to you. Nothing in this Agreement grants 
              you any right, title, or interest in the Service or any Flux Intellectual Property.
            </p>
          </motion.section>

          {/* ── 5. ACCEPTABLE USE ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">05</span>
              Section 5 — Acceptable Use Policy
            </h2>
            <p className="mb-3">
              <strong>5.1 Compliance with Laws.</strong> You shall use the Service in compliance with all applicable 
              laws, regulations, and third-party rights.
            </p>
            <p className="mb-3">
              <strong>5.2 Prohibited Uses.</strong> You shall not, and shall not permit any third party to, use the 
              Service to:
            </p>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p>(a) Generate, store, distribute, or transmit any content that is illegal, fraudulent, defamatory, harassing, abusive, obscene, discriminatory, or otherwise objectionable;</p>
              <p>(b) Engage in any activity that violates the intellectual property rights, privacy rights, or other rights of any third party;</p>
              <p>(c) Upload, transmit, or execute any viruses, malware, ransomware, Trojan horses, worms, or other malicious code;</p>
              <p>(d) Attempt to circumvent, disable, or interfere with any security-related feature of the Service, including authentication mechanisms, rate limits, CORS restrictions, or Content-Security-Policy headers;</p>
              <p>(e) Use the Service for automated scraping, data mining, web crawling, or any bulk data extraction without our express written consent;</p>
              <p>(f) Use the Service to conduct denial-of-service attacks, resource exhaustion attacks, or any other activity that could impair the availability or performance of the Service;</p>
              <p>(g) Use the Sandbox Services to execute code that attacks, probes, or compromises any third-party system, mines cryptocurrency, or engages in any activity that could result in financial harm to any party;</p>
              <p>(h) Use the Service to generate content that could be used in the commission of a crime, including but not limited to phishing, fraud, identity theft, or social engineering;</p>
              <p>(i) Attempt to extract, reverse engineer, or replicate the underlying AI Models or their training data through prompt engineering, jailbreaking, or any other technique;</p>
              <p>(j) Use the Service to develop or train competing AI models or machine learning systems; or</p>
              <p>(k) Violate any usage guidelines, rate limits, or technical restrictions imposed by us or any Third-Party AI Provider.</p>
            </div>
            <p className="mb-3">
              <strong>5.3 Monitoring and Enforcement.</strong> We reserve the right, but do not assume the obligation, 
              to monitor, review, and analyze your use of the Service for compliance with this AUP. We may, in 
              our sole discretion and without prior notice, remove any User Content or suspend or terminate your 
              access to the Service if we determine that you have violated this AUP.
            </p>
            <p>
              <strong>5.4 Reporting Violations.</strong> If you become aware of any violation of this AUP, you shall 
              promptly report it to us through the mechanism specified in Section 21.
            </p>
          </motion.section>

          {/* ── 6. AI-GENERATED CONTENT ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">06</span>
              Section 6 — AI-Generated Content Disclaimers
            </h2>
            <p className="mb-3">
              <strong>6.1 No Warranty of Accuracy.</strong> Flux Output is generated by AI Models and may contain 
              inaccuracies, errors, omissions, hallucinations (confidently stated false information), biased 
              statements, or outdated information. You shall not rely on Flux Output as factual, professional, 
              medical, legal, financial, or any other form of professional advice without independent verification. 
              Flux is a tool for exploration and analysis, not a source of definitive truth.
            </p>
            <p className="mb-3">
              <strong>6.2 Source Verification.</strong> When the Service retrieves information from the web, it 
              provides citations and source links. You are responsible for independently verifying any claims 
              made in Flux Output by consulting the original sources provided. The presence of a citation does 
              not guarantee that the Flux Output accurately represents the cited source.
            </p>
            <p className="mb-3">
              <strong>6.3 Model Limitations.</strong> You acknowledge that: (a) AI Models may reflect biases present 
              in their training data; (b) AI Models may produce inconsistent outputs for the same or similar 
              inputs; (c) AI Models have knowledge cutoffs and may not have information about events after their 
              training date; (d) the Service's web search capability may not retrieve all relevant information; 
              and (e) AI Models may generate content that some users find offensive, inappropriate, or harmful.
            </p>
            <p className="mb-3">
              <strong>6.4 Content Safety.</strong> The Service includes a content safety moderation system that 
              processes inputs and outputs through a dedicated safety AI Model (<code className="text-primary text-xs bg-primary/10 px-1 rounded">safety.ts</code>). 
              Despite this, we cannot guarantee that all harmful content will be detected or prevented.
            </p>
            <p className="mb-3">
              <strong>6.5 No Professional Advice.</strong> Flux Output does not constitute legal, medical, financial, 
              engineering, or any other form of professional advice. You should consult qualified professionals 
              for advice tailored to your specific circumstances.
            </p>
            <p>
              <strong>6.6 Reporting Problematic Content.</strong> If you encounter Flux Output that you believe is 
              factually incorrect, harmful, biased, or otherwise problematic, please report it through our 
              GitHub repository. Reports shall include the specific content and the context in which it was generated.
            </p>
          </motion.section>

          {/* ── 7. SANDBOX SERVICES ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">07</span>
              Section 7 — Sandbox Services (Code Execution)
            </h2>
            <p className="mb-3">
              <strong>7.1 Nature of Sandbox Services.</strong> The Service may provide you with the ability to 
              execute code in a cloud-based, ephemeral sandbox environment powered by E2B. The Sandbox Services 
              are provided "as-is" and we make no representations or warranties regarding their reliability, 
              availability, or security.
            </p>
            <p className="mb-3">
              <strong>7.2 Assumption of Risk.</strong> You assume all risk associated with executing code through 
              the Sandbox Services. This includes, but is not limited to, the risk that: (a) code you execute 
              may contain errors, bugs, or vulnerabilities; (b) code generated by AI Models may be incorrect, 
              incomplete, or malicious; (c) the sandbox environment may not provide complete isolation; and (d) 
              your code may consume significant computational resources.
            </p>
            <p className="mb-3">
              <strong>7.3 No Monitoring.</strong> We do not monitor, review, or analyze the code you execute in 
              sandboxes, except to the extent necessary for debugging or security incident response.
            </p>
            <p className="mb-3">
              <strong>7.4 Sandbox Limitations.</strong> Sandbox environments are ephemeral. They are created when 
              execution is requested and terminated upon completion or after a timeout period (default maximum 
              execution time: 300 seconds / 5 minutes). Any data or files stored in the sandbox are permanently 
              deleted upon termination. You shall not store any data in the sandbox that you intend to retain.
            </p>
            <p className="mb-3">
              <strong>7.5 Prohibited Sandbox Uses.</strong> In addition to the restrictions in the AUP (Section 5), 
              you shall not use the Sandbox Services to: (a) execute code that attacks or probes any system 
              outside the sandbox; (b) mine cryptocurrency; (c) send unsolicited communications; (d) store or 
              distribute illegal content; or (e) engage in any activity that could result in financial cost to 
              any third party.
            </p>
            <p>
              <strong>7.6 Limitation of Liability for Sandbox Use.</strong> To the maximum extent permitted by 
              applicable law, we shall have no liability whatsoever for any Losses arising from or relating to 
              your use of the Sandbox Services, including any Losses resulting from executed code, data loss, 
              security breaches, or computational costs.
            </p>
          </motion.section>

          {/* ── 8. INTELLECTUAL PROPERTY ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">08</span>
              Section 8 — Intellectual Property Rights
            </h2>
            <p className="mb-3">
              <strong>8.1 Flux IP.</strong> As between you and Flux, Flux owns all right, title, and interest in 
              and to the Service, including the software, infrastructure, design, branding (including the Flux 
              name and logo), and all related Intellectual Property Rights. The Flux source code is made available 
              under its applicable open-source license for self-hosting and contribution purposes, subject to 
              the terms of that license.
            </p>
            <p className="mb-3">
              <strong>8.2 User Content.</strong> As between you and Flux, you retain all right, title, and interest 
              in and to your User Content. Nothing in this Agreement transfers ownership of your User Content 
              to Flux.
            </p>
            <p className="mb-3">
              <strong>8.3 License to User Content.</strong> By submitting User Content through the Service, you 
              grant us a non-exclusive, worldwide, royalty-free, sublicensable (through multiple tiers, solely 
              to our Subprocessors and Third-Party AI Providers), license to use, reproduce, modify, adapt, 
              store, transmit, and process your User Content solely for the purpose of providing, maintaining, 
              and improving the Service. This license survives termination of your Account solely to the extent 
              necessary to fulfill our obligations under this Agreement and to comply with applicable law.
            </p>
            <p className="mb-3">
              <strong>8.4 Flux Output.</strong> To the maximum extent permitted by applicable law, we assign to 
              you all right, title, and interest in and to Flux Output generated specifically in response to 
              your User Content. However, you acknowledge that: (a) Flux Output may be substantially similar 
              or identical to outputs generated for other users; (b) Flux Output may incorporate pre-existing 
              Flux Intellectual Property; and (c) Flux may use Flux Output (excluding your Personal Data) for 
              service improvement, research, and development purposes in anonymized or aggregated form.
            </p>
            <p className="mb-3">
              <strong>8.5 Feedback.</strong> If you provide Feedback to us, you grant us an irrevocable, perpetual, 
              worldwide, royalty-free, fully paid-up license to use, incorporate, and commercialize such Feedback 
              without restriction, acknowledgment, or compensation.
            </p>
            <p>
              <strong>8.6 Copyright Infringement.</strong> We respect the intellectual property rights of others. 
              If you believe that any content available through the Service infringes your copyright, please 
              contact us through the mechanism specified in Section 21 with a written notice containing: 
              (a) your physical or electronic signature; (b) identification of the copyrighted work claimed to 
              have been infringed; (c) identification of the infringing material and its location; (d) your 
              contact information; (e) a statement that you have a good faith belief that the use is not 
              authorized; and (f) a statement, under penalty of perjury, that the information in the notice is 
              accurate and that you are the copyright owner or authorized to act on their behalf.
            </p>
          </motion.section>

          {/* ── 9. USER REPRESENTATIONS ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">09</span>
              Section 9 — User Representations and Warranties
            </h2>
            <p className="mb-3">You represent and warrant that:</p>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p>(a) You own or have obtained all necessary rights, licenses, consents, and permissions to submit your User Content and to grant the licenses granted in Section 8;</p>
              <p>(b) Your User Content does not and will not violate any applicable law, regulation, or third-party right, including Intellectual Property Rights, privacy rights, or publicity rights;</p>
              <p>(c) Your User Content does not contain any virus, malware, or other malicious code;</p>
              <p>(d) Your User Content is not false, misleading, or deceptive;</p>
              <p>(e) You will not use the Service in any manner that violates the AUP (Section 5); and</p>
              <p>(f) You will comply with all applicable export control and sanctions laws, including the U.S. Export Administration Regulations (EAR) and the International Traffic in Arms Regulations (ITAR).</p>
            </div>
          </motion.section>

          {/* ── 10. THIRD-PARTY SERVICES ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">10</span>
              Section 10 — Third-Party Services and Dependencies
            </h2>
            <p className="mb-3">
              <strong>10.1 General.</strong> The Service integrates with and relies upon third-party services, 
              including but not limited to Supabase (authentication and database hosting), NVIDIA NIM (AI model 
              inference), Tavily (web search), E2B (sandboxed code execution), and Hugging Face (AI model 
              inference). You acknowledge and agree that:
            </p>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p>(a) Your use of these third-party services is subject to their respective terms of service and privacy policies;</p>
              <p>(b) We do not control and are not responsible for the availability, reliability, security, or performance of any third-party service;</p>
              <p>(c) We may be required to suspend or modify the Service if any third-party service becomes unavailable, changes its terms, or increases its pricing;</p>
              <p>(d) Certain features (e.g., AI model selection) depend on the availability and pricing of specific Third-Party AI Provider models, and we may change, remove, or replace available models at our discretion;</p>
              <p>(e) Content transmitted to Third-Party AI Providers is subject to their respective data handling practices, as described in the Privacy Policy; and</p>
              <p>(f) We are not liable for any Losses arising from your use of or reliance on any third-party service.</p>
            </div>
            <p>
              <strong>10.2 OAuth Providers.</strong> Your use of Google or GitHub as an OAuth Provider is governed 
              by their respective terms of service and privacy policies. We are not responsible for any 
              authentication failures, account lockouts, or data access issues caused by OAuth Providers.
            </p>
          </motion.section>

          {/* ── 11. SERVICE AVAILABILITY ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">11</span>
              Section 11 — Service Availability and Modifications
            </h2>
            <p className="mb-3">
              <strong>11.1 No Guarantee of Availability.</strong> The Service is provided on an "as available" 
              basis. We do not guarantee that the Service will be available at any particular time or that it 
              will meet any specific performance or reliability standards. We may perform maintenance, upgrades, 
              or modifications that could temporarily or permanently affect availability.
            </p>
            <p className="mb-3">
              <strong>11.2 Modifications to the Service.</strong> We reserve the right to modify, update, suspend, 
              or discontinue the Service (or any part thereof) at any time, with or without notice. We shall 
              not be liable to you or any third party for any modification, suspension, or discontinuation of 
              the Service.
            </p>
            <p className="mb-3">
              <strong>11.3 Beta Features.</strong> From time to time, we may offer new or experimental features 
              ("<strong className="text-foreground">Beta Features</strong>") as part of the Service. Beta Features 
              are provided "as-is" without any warranty, may contain bugs or errors, and may be modified or 
              discontinued at any time without notice.
            </p>
            <p>
              <strong>11.4 Rate Limits.</strong> The Service implements rate limiting to ensure fair usage and 
              system stability. You shall not exceed the documented rate limits. We reserve the right to modify 
              rate limits at any time without notice.
            </p>
          </motion.section>

          {/* ── 12. FEES ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">12</span>
              Section 12 — Fees and Payment
            </h2>
            <p className="mb-3">
              <strong>12.1 Current Pricing.</strong> As of the Effective Date, the Service is provided free of 
              charge. We reserve the right to introduce fees for the Service or certain features at any time. 
              If we introduce fees, we shall provide you with notice through the Service interface.
            </p>
            <p>
              <strong>12.2 Third-Party Costs.</strong> You are solely responsible for any costs, fees, or charges 
              imposed by third parties in connection with your use of the Service, including but not limited to 
              internet service provider fees, mobile data charges, and any usage-based fees from Third-Party 
              AI Providers.
            </p>
          </motion.section>

          {/* ── 13. CONFIDENTIALITY ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">13</span>
              Section 13 — Confidentiality
            </h2>
            <p className="mb-3">
              <strong>13.1 Obligations.</strong> Each Party (the "<strong className="text-foreground">Receiving Party</strong>") 
              shall hold the Confidential Information of the other Party (the "<strong className="text-foreground">Disclosing Party</strong>") 
              in strict confidence and shall not disclose such Confidential Information to any third party 
              without the Disclosing Party's prior written consent. The Receiving Party shall use Confidential 
              Information solely for the purposes contemplated by this Agreement.
            </p>
            <p className="mb-3">
              <strong>13.2 Exclusions.</strong> Confidential Information does not include information that: 
              (a) is or becomes generally known to the public through no fault of the Receiving Party; 
              (b) was in the Receiving Party's possession prior to disclosure; (c) is independently developed 
              by the Receiving Party without use of the Disclosing Party's Confidential Information; or 
              (d) is required to be disclosed by applicable law or court order, provided that the Receiving 
              Party gives the Disclosing Party prompt notice of such requirement.
            </p>
            <p>
              <strong>13.3 Duration.</strong> The obligations of confidentiality in this Section 13 shall survive 
              termination of this Agreement and continue for a period of three (3) years from the date of 
              disclosure, or indefinitely for Confidential Information constituting Trade Secrets.
            </p>
          </motion.section>

          {/* ── 14. INDEMNIFICATION ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">14</span>
              Section 14 — Indemnification
            </h2>
            <p className="mb-3">
              You agree to indemnify, defend, and hold harmless Flux, its affiliates, officers, directors, 
              employees, agents, and maintainers from and against any and all Losses arising out of or relating 
              to: (a) your use of the Service; (b) your User Content; (c) your violation of this Agreement; 
              (d) your violation of any applicable law or third-party right; or (e) your use of the Sandbox 
              Services, including any code you execute.
            </p>
            <p className="mb-3">
              We reserve the right, at our own expense, to assume the exclusive defense and control of any 
              matter subject to indemnification by you. You shall not settle any such matter without our prior 
              written consent. You shall cooperate fully in the defense of any claim.
            </p>
          </motion.section>

          {/* ── 15. DISCLAIMER OF WARRANTIES ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">15</span>
              Section 15 — Disclaimer of Warranties
            </h2>
            <p className="mb-3">
              <strong>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OF ANY KIND, 
              WHETHER EXPRESS, IMPLIED, OR STATUTORY, TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW. WE 
              SPECIFICALLY DISCLAIM ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, 
              TITLE, NON-INFRINGEMENT, AND QUIET ENJOYMENT.</strong>
            </p>
            <p className="mb-3">
              <strong>WE DO NOT WARRANT THAT: (A) THE SERVICE WILL MEET YOUR REQUIREMENTS OR EXPECTATIONS; 
              (B) THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE; (C) FLUX OUTPUT WILL BE 
              ACCURATE, RELIABLE, OR COMPLETE; (D) THE QUALITY OF ANY PRODUCT, SERVICE, INFORMATION, OR OTHER 
              MATERIAL OBTAINED THROUGH THE SERVICE WILL MEET YOUR EXPECTATIONS; (E) ERRORS OR DEFECTS IN 
              THE SERVICE WILL BE CORRECTED; OR (F) THE SERVICE IS FREE OF VIRUSES OR OTHER HARMFUL 
              COMPONENTS.</strong>
            </p>
            <p className="mb-3">
              <strong>NO ADVICE OR INFORMATION, WHETHER ORAL OR WRITTEN, OBTAINED BY YOU FROM US OR THROUGH 
              THE SERVICE SHALL CREATE ANY WARRANTY NOT EXPRESSLY STATED IN THIS AGREEMENT.</strong>
            </p>
            <p>
              <strong>SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES. IN SUCH JURISDICTIONS, 
              THE ABOVE EXCLUSIONS SHALL APPLY TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW.</strong>
            </p>
          </motion.section>

          {/* ── 16. LIMITATION OF LIABILITY ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">16</span>
              Section 16 — Limitation of Liability
            </h2>
            <p className="mb-3">
              <strong>16.1 Exclusion of Damages.</strong> To the maximum extent permitted by applicable law, in 
              no event shall Flux or its affiliates, officers, directors, employees, agents, or maintainers 
              be liable for any:
            </p>
            <div className="pl-4 mb-4 space-y-2 border-l border-border/60">
              <p>(a) Indirect, incidental, special, consequential, punitive, or exemplary damages;</p>
              <p>(b) Loss of profits, revenue, data, use, goodwill, or business opportunity;</p>
              <p>(c) Cost of procurement of substitute goods or services;</p>
              <p>(d) Damages arising from your use of the Sandbox Services, including execution of code;</p>
              <p>(e) Damages arising from your reliance on Flux Output, including AI-generated content; or</p>
              <p>(f) Damages arising from unauthorized access to or alteration of your transmissions or data.</p>
            </div>
            <p className="mb-3">
              <strong>16.2 Cap on Liability.</strong> To the maximum extent permitted by applicable law, the 
              aggregate liability of Flux and its affiliates, officers, directors, employees, agents, and 
              maintainers for all claims arising out of or relating to this Agreement or your use of the 
              Service shall not exceed the greater of: (a) one hundred US dollars ($100.00); or (b) the total 
              amount paid by you to Flux for the Service in the twelve (12) months preceding the event giving 
              rise to the claim.
            </p>
            <p className="mb-3">
              <strong>16.3 Basis of the Bargain.</strong> The parties acknowledge that the limitations of liability 
              in this Section 16 reflect an informed, voluntary allocation of risk and are an essential part 
              of the basis of the bargain between the parties. The Service would not be provided without these 
              limitations.
            </p>
            <p className="mb-3">
              <strong>16.4 Exceptions.</strong> Nothing in this Agreement limits or excludes liability for: 
              (a) death or personal injury caused by negligence; (b) fraud or fraudulent misrepresentation; 
              (c) willful misconduct or gross negligence; (d) intentional breach of confidentiality obligations; 
              or (e) any liability that cannot be excluded or limited under applicable law.
            </p>
            <p>
              <strong>16.5 Third-Party AI Provider Liability.</strong> You acknowledge that Flux Output is 
              generated by Third-Party AI Providers, and we are not liable for any Losses arising from the 
              content, accuracy, or availability of Flux Output. Any claims relating to AI Model output shall 
              be directed to the applicable Third-Party AI Provider in accordance with their terms and policies.
            </p>
          </motion.section>

          {/* ── 17. TERMINATION ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">17</span>
              Section 17 — Termination
            </h2>
            <p className="mb-3">
              <strong>17.1 Termination by You.</strong> You may terminate this Agreement at any time by 
              discontinuing use of the Service. To request deletion of your Account and associated data, 
              please contact us through the mechanism specified in Section 21.
            </p>
            <p className="mb-3">
              <strong>17.2 Termination by Us.</strong> We may suspend or terminate this Agreement and your 
              access to the Service at any time, with or without cause, effective immediately upon notice 
              to you. Grounds for termination include but are not limited to: (a) breach of any provision 
              of this Agreement; (b) violation of the AUP; (c) illegal or fraudulent activity; (d) 
              non-payment of fees (if applicable); or (e) discontinuation of the Service.
            </p>
            <p className="mb-3">
              <strong>17.3 Effect of Termination.</strong> Upon termination of this Agreement: (a) your right 
              to access and use the Service shall immediately cease; (b) we shall delete your Account and 
              associated data in accordance with our data retention practices (Section 8 of the Privacy Policy); 
              (c) the licenses granted in Section 4 shall terminate; (d) Sections 4.2 (License Restrictions), 
              5 (AUP), 8 (IP Rights), 13 (Confidentiality), 14 (Indemnification), 15 (Disclaimer of Warranties), 
              16 (Limitation of Liability), 17.3 (Effect of Termination), 18 (Dispute Resolution), 19 
              (Governing Law), and 20 (General Provisions) shall survive termination.
            </p>
            <p>
              <strong>17.4 Data Export.</strong> Prior to termination of your Account, you may request an export 
              of your Personal Data and User Content in a structured, commonly used, machine-readable format, 
              subject to the rights and timelines set forth in the Privacy Policy.
            </p>
          </motion.section>

          {/* ── 18. DISPUTE RESOLUTION ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">18</span>
              Section 18 — Dispute Resolution and Arbitration
            </h2>
            <p className="mb-3">
              <strong>18.1 Informal Resolution.</strong> Before initiating any formal dispute resolution 
              proceeding, you agree to first attempt to resolve the dispute informally by contacting us 
              through the mechanism specified in Section 21. The parties shall negotiate in good faith for 
              a period of thirty (30) calendar days from the date of initial notice.
            </p>
            <p className="mb-3">
              <strong>18.2 Binding Arbitration.</strong> If the dispute cannot be resolved through informal 
              negotiations, any dispute arising out of or relating to this Agreement or your use of the 
              Service shall be finally settled by binding arbitration administered by the Indian Council of 
              Arbitration (ICA) in accordance with the ICA Arbitration Rules in effect at the time of the 
              arbitration. The arbitration shall be conducted in English in Bangalore, India, by a single 
              arbitrator appointed in accordance with the ICA Rules.
            </p>
            <p className="mb-3">
              <strong>18.3 Class Action Waiver.</strong> TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ANY 
              DISPUTE RESOLUTION PROCEEDING SHALL BE CONDUCTED ON AN INDIVIDUAL BASIS AND NOT AS A CLASS, 
              CONSOLIDATED, OR REPRESENTATIVE ACTION. YOU WAIVE YOUR RIGHT TO PARTICIPATE IN ANY CLASS ACTION 
              OR SIMILAR PROCEEDING AGAINST FLUX.
            </p>
            <p>
              <strong>18.4 Exceptions.</strong> Notwithstanding the foregoing, either party may seek injunctive 
              or other equitable relief from a court of competent jurisdiction to protect its Intellectual 
              Property Rights or Confidential Information, or to enforce the AUP or IP Rights provisions of 
              this Agreement.
            </p>
          </motion.section>

          {/* ── 19. GOVERNING LAW ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">19</span>
              Section 19 — Governing Law
            </h2>
            <p className="mb-3">
              This Agreement shall be governed by and construed in accordance with the laws of India, without 
              regard to its conflict of laws principles. The United Nations Convention on Contracts for the 
              International Sale of Goods (CISG) shall not apply to this Agreement. Any arbitration or court 
              proceedings not subject to arbitration shall be conducted in Bangalore, India.
            </p>
            <p>
              This Section 19 does not limit any consumer protection rights you may have under the mandatory 
              laws of your country of residence.
            </p>
          </motion.section>

          {/* ── 20. FORCE MAJEURE ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">20</span>
              Section 20 — Force Majeure
            </h2>
            <p>
              Neither party shall be liable for any failure or delay in performance under this Agreement 
              (other than for payment obligations) arising out of or caused by circumstances beyond its 
              reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, 
              riots, embargoes, acts of civil or military authorities, fires, floods, accidents, strikes, 
              shortages of transportation, facilities, fuel, energy, labor or materials, failures of the 
              internet or telecommunications infrastructure, acts or omissions of third-party service 
              providers (including Supabase, NVIDIA, Tavily, and E2B), or government actions.
            </p>
          </motion.section>

          {/* ── 21. GENERAL PROVISIONS ── */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="group relative rounded-2xl border border-border/30 bg-card/20 backdrop-blur-sm p-6 sm:p-8 transition-all duration-500 hover:border-primary/20 hover:bg-card/40 hover:shadow-[0_0_30px_rgba(204,120,92,0.04)]"
            >
            <div className="absolute top-0 right-6 h-8 w-8 border-t border-r border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-tr-sm" />
            <div className="absolute bottom-0 left-6 h-8 w-8 border-b border-l border-primary/0 group-hover:border-primary/25 transition-all duration-500 rounded-bl-sm" />
            <h2 className="font-serif text-2xl tracking-tight text-foreground mb-5 flex items-center gap-3">
              <span className="font-mono text-[10px] text-primary/60 tracking-widest">21</span>
              Section 21 — General Provisions
            </h2>
            <p className="mb-3">
              <strong>21.1 Entire Agreement.</strong> This Agreement, together with the Privacy Policy and any 
              other policies incorporated by reference, constitutes the entire agreement between you and Flux 
              regarding your use of the Service and supersedes all prior or contemporaneous communications, 
              agreements, and understandings, whether oral or written.
            </p>
            <p className="mb-3">
              <strong>21.2 Modifications to Terms.</strong> We reserve the right to modify this Agreement at 
              any time. Material modifications shall be effective thirty (30) calendar days after posting to 
              the Website or upon notice through the Service. Non-material modifications shall be effective 
              immediately upon posting. Your continued use of the Service after the effective date of any 
              modification constitutes your acceptance of the modified terms.
            </p>
            <p className="mb-3">
              <strong>21.3 Waiver.</strong> The failure of either party to enforce any provision of this 
              Agreement shall not constitute a waiver of such provision or any other provision.
            </p>
            <p className="mb-3">
              <strong>21.4 Severability.</strong> If any provision of this Agreement is held to be invalid or 
              unenforceable, such provision shall be reformed to the minimum extent necessary to make it 
              enforceable, and the remaining provisions shall remain in full force and effect.
            </p>
            <p className="mb-3">
              <strong>21.5 Assignment.</strong> You may not assign or transfer this Agreement, by operation of 
              law or otherwise, without our prior written consent. We may assign or transfer this Agreement 
              without restriction, including in connection with a merger, acquisition, or sale of all or 
              substantially all of our assets.
            </p>
            <p className="mb-3">
              <strong>21.6 Relationship.</strong> Nothing in this Agreement creates a partnership, joint venture, 
              agency, or employment relationship between the parties. Each party is an independent contractor.
            </p>
            <p className="mb-3">
              <strong>21.7 Notices.</strong> Notices to Flux shall be sent through the mechanism specified in 
              Section 21.10. Notices to you shall be sent to the email address associated with your Account 
              or through the Service interface. Notice shall be deemed effective upon transmission.
            </p>
            <p className="mb-3">
              <strong>21.8 Export Compliance.</strong> You represent and warrant that you are not located in, 
              incorporated in, or a resident of any country that is subject to applicable U.S. or other 
              sanctions or embargoes, and that you are not a person or entity on any denied party list, 
              including the U.S. Treasury Department's List of Specially Designated Nationals and Blocked 
              Persons, the U.S. Commerce Department's Denied Persons List, or any similar list maintained by 
              any applicable authority.
            </p>
            <p className="mb-3">
              <strong>21.9 Governing Language.</strong> This Agreement is drafted in English. Any translations 
              are provided for convenience only. In the event of any conflict between the English version and 
              a translated version, the English version shall prevail.
            </p>
            <p>
              <strong>21.10 Contact Information.</strong> For questions about this Agreement, to report a 
              violation, or to request Account deletion, please open an issue on the Flux GitHub repository 
              at github.com/anomalyco/Flux. We shall make commercially reasonable efforts to respond to 
              inquiries within thirty (30) calendar days.
            </p>
          </motion.section>

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
