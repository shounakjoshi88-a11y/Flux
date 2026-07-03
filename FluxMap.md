# Flux — Complete Project Map

> Auto-generated project structure, descriptions, and pipeline documentation.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Full Project Structure](#2-full-project-structure)
3. [What Each File and Folder Does](#3-what-each-file-and-folder-does)
   - [Root Level](#31-root-level)
   - [frontend/](#32-frontend)
   - [backend/](#33-backend)
   - [shared/flux-common/](#34-sharedflux-common)
   - [electron/](#35-electron)
   - [api/](#36-api)
   - [data/](#37-data)
4. [Project Pipeline](#4-project-pipeline)

---

## 1. Project Overview

**Flux** is an AI-powered chat application with document generation, multi-agent orchestration, WebSocket-based agent communication protocol (ACP), vector memory, RAG, tool execution, and an Electron desktop shell. It supports multiple AI providers (OpenAI, Anthropic, Gemini, NVIDIA NIM, HuggingFace) with rotating API keys.

**Tech stack:**
- **Runtime:** Bun (primary), Node.js (Electron)
- **Frontend:** React 19, TypeScript 6, React Router 7, Tailwind CSS 4, Arco Design
- **Backend:** Express 5, Prisma (PostgreSQL), Supabase Auth, AI SDK v6
- **Desktop:** Electron 35, electron-builder
- **Database:** PostgreSQL with pgvector (vector embeddings)
- **Communication:** SSE (chat), WebSocket (agent protocol), HTTP REST

---

## 2. Full Project Structure

```
flux/
|
|-- package.json                         # Root project config (Electron build scripts)
|-- bun.lock                             # Bun lockfile
|-- AGENTS.md                            # Agent instructions for AI coding assistants
|-- CLAUDE.md                            # Claude-specific instructions
|-- DESIGN.md                            # Design guidelines
|-- GEMINI.md                            # Gemini-specific instructions
|-- README.md                            # Project readme
|-- dashboard.txt                        # Dashboard notes
|-- skills-lock.json                     # Locked skill versions
|-- vercel.json                          # Vercel deployment config
|-- electron-builder.yml                 # Electron packaging config
|-- flux.bat                             # Windows dev launcher (batch)
|-- flux.ps1                             # Windows dev launcher (PowerShell)
|-- .gitignore
|
|-- frontend/
|   |-- package.json
|   |-- tsconfig.json
|   |-- bunfig.toml
|   |-- build.ts
|   |-- components.json
|   |-- bun-env.d.ts
|   |-- test_extreme.js
|   |-- .env
|   |-- .env.local
|   |-- styles/
|   |   |-- globals.css
|   |   |-- dashboard.css
|   |-- scripts/
|   |   |-- generate-icons.ts
|   |-- src/
|   |   |-- index.ts                     # Bun dev server
|   |   |-- index.html                   # SPA shell
|   |   |-- frontend.tsx                 # React entry
|   |   |-- App.tsx                      # Router
|   |   |-- i18n.ts                      # i18n init
|   |   |-- types.ts                     # Core types
|   |   |-- declarations.d.ts            # Type declarations
|   |   |-- index.css                    # Global styles
|   |   |-- tailwind.config.js
|   |   |-- manifest.json                # PWA manifest
|   |   |-- sw.js                        # Service worker
|   |   |-- logo.svg / react.svg         # Assets
|   |   |-- icon-*.png / icon-*.svg      # PWA icons
|   |   |
|   |   |-- pages/
|   |   |   |-- Auth.tsx
|   |   |   |-- Dashboard.tsx
|   |   |   |-- TestShowcase.tsx
|   |   |   |-- conversation/
|   |   |   |   |-- index.tsx
|   |   |   |   |-- components/
|   |   |   |   |   |-- WorkspaceCollapse.tsx
|   |   |   |   |-- GroupedHistory/
|   |   |   |   |   |-- index.tsx
|   |   |   |   |   |-- ConversationRow.tsx
|   |   |   |   |   |-- ConversationSearchPopover.tsx
|   |   |   |   |   |-- types.ts
|   |   |   |   |   |-- hooks/
|   |   |   |   |   |   |-- useConversationListSync.ts
|   |   |   |   |   |   |-- useVisibleConversationIds.ts
|   |   |   |   |   |-- utils/
|   |   |   |   |   |   |-- groupingHelpers.ts
|   |   |   |   |-- Messages/
|   |   |   |   |   |-- hooks.ts
|   |   |   |   |-- Preview/
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- constants.ts
|   |   |   |   |   |-- context/
|   |   |   |   |   |   |-- PreviewContext.tsx
|   |   |   |   |-- platforms/
|   |   |   |   |   |-- useConversationCommandQueue.ts
|   |   |   |   |   |-- gemini/
|   |   |   |   |   |   |-- GoogleModelSelector.tsx
|   |   |   |   |   |   |-- useGoogleModelSelection.ts
|   |   |   |   |-- utils/
|   |   |   |   |   |-- conversationCache.ts
|   |   |   |   |   |-- warmupConversation.ts
|   |   |   |-- cron/
|   |   |   |   |-- ScheduledTasksPage.tsx
|   |   |   |   |-- ScheduledTasksPage/
|   |   |   |   |   |-- TaskDetailPage.tsx
|   |   |   |   |-- useCronJobs.ts
|   |   |   |-- guid/
|   |   |   |   |-- index.tsx
|   |   |   |   |-- hooks/
|   |   |   |   |   |-- agentSelectionUtils.ts
|   |   |   |-- login/
|   |   |   |   |-- index.tsx
|   |   |   |-- settings/
|   |   |   |   |-- AgentSettings.tsx
|   |   |   |   |-- AgentSettings/
|   |   |   |   |   |-- LocalAgents.tsx
|   |   |   |   |-- AppearanceSettings.tsx
|   |   |   |   |-- AppearanceSettings/
|   |   |   |   |   |-- CssThemeSettings.tsx
|   |   |   |   |-- AssistantSettings.tsx
|   |   |   |   |-- AssistantSettings/
|   |   |   |   |   |-- assistantUtils.ts
|   |   |   |   |   |-- types.ts
|   |   |   |   |-- CapabilitiesSettings.tsx
|   |   |   |   |-- ExtensionSettingsPage.tsx
|   |   |   |   |-- ModeSettings.tsx
|   |   |   |   |-- PetSettings.tsx
|   |   |   |   |-- SystemSettings.tsx
|   |   |   |   |-- WebuiSettings.tsx
|   |   |   |   |-- ToolsSettings/
|   |   |   |   |   |-- McpServerItem.tsx
|   |   |   |   |-- components/
|   |   |   |   |   |-- AddMcpServerModal.tsx
|   |   |   |   |   |-- AddModelModal.tsx
|   |   |   |   |   |-- AddPlatformModal.tsx
|   |   |   |   |   |-- EditModeModal.tsx
|   |   |   |   |   |-- SettingsSider.tsx
|   |   |   |-- team/
|   |   |   |   |-- index.tsx
|   |   |   |   |-- components/
|   |   |   |   |   |-- TeamCreateModal.tsx
|   |   |   |   |-- hooks/
|   |   |   |   |   |-- TeamPermissionContext.tsx
|   |   |   |   |   |-- useSiderTeamBadges.ts
|   |   |   |   |   |-- useTeamCreatedRedirect.ts
|   |   |   |   |   |-- useTeamList.ts
|   |   |
|   |   |-- components/
|   |   |   |-- AgentStatusBar.tsx
|   |   |   |-- ArtifactsModal.tsx
|   |   |   |-- ChartBlock.tsx
|   |   |   |-- ChatInput.tsx
|   |   |   |-- CustomAgentsPanel.tsx
|   |   |   |-- FileDownloadButton.tsx
|   |   |   |-- InputSeparator.tsx
|   |   |   |-- MarkdownPreview.tsx
|   |   |   |-- MessageItem.tsx
|   |   |   |-- MessageList.tsx
|   |   |   |-- MessageRenderer.tsx
|   |   |   |-- NewsModal.tsx
|   |   |   |-- PeekPanel.tsx
|   |   |   |-- PermissionDialog.tsx
|   |   |   |-- PlanDisplay.tsx
|   |   |   |-- PptxPreview.tsx
|   |   |   |-- PromptHistoryCard.tsx
|   |   |   |-- Settings.tsx
|   |   |   |-- Sidebar.tsx
|   |   |   |-- SidebarThread.tsx
|   |   |   |-- SourceCard.tsx
|   |   |   |-- StatusMessage.tsx
|   |   |   |-- SuggestedActions.tsx
|   |   |   |-- TeamPanel.tsx
|   |   |   |-- TerminalComponent.tsx
|   |   |   |-- ThoughtDisplay.tsx
|   |   |   |-- TodoList.tsx
|   |   |   |-- ToolsDropdown.tsx
|   |   |   |-- ToolSummary.tsx
|   |   |   |-- XlsxPreview.tsx
|   |   |   |
|   |   |   |-- agent/
|   |   |   |   |-- AgentStatusBar.tsx
|   |   |   |-- base/
|   |   |   |   |-- FileChangesPanel.tsx
|   |   |   |-- chat/
|   |   |   |   |-- ChatInput.tsx
|   |   |   |-- flux/
|   |   |   |   |-- IconParkHOC.tsx
|   |   |   |   |-- ShimmerText.tsx
|   |   |   |   |-- agent/
|   |   |   |   |   |-- AcpModelSelector.tsx
|   |   |   |   |   |-- AgentBadge.tsx
|   |   |   |   |   |-- AgentModeSelector.tsx
|   |   |   |   |   |-- AgentSetupCard.tsx
|   |   |   |   |   |-- ChannelConflictWarning.tsx
|   |   |   |   |   |-- ContextUsageIndicator.tsx
|   |   |   |   |   |-- MarqueePillLabel.tsx
|   |   |   |   |-- base/
|   |   |   |   |   |-- FeedbackButton.tsx
|   |   |   |   |   |-- FileChangesPanel.tsx
|   |   |   |   |   |-- FluxCollapse.tsx
|   |   |   |   |   |-- FluxModal.tsx
|   |   |   |   |   |-- FluxScrollArea.tsx
|   |   |   |   |   |-- FluxSelect.tsx
|   |   |   |   |   |-- FluxSteps.tsx
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- ModalWrapper.tsx
|   |   |   |   |-- chat/
|   |   |   |   |   |-- AtFileMenu/
|   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |-- BtwOverlay/
|   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |-- BtwOverlay.module.css
|   |   |   |   |   |   |-- useBtwCommand.ts
|   |   |   |   |   |-- CollapsibleContent.tsx
|   |   |   |   |   |-- CommandQueuePanel.tsx
|   |   |   |   |   |-- EmojiPicker.tsx
|   |   |   |   |   |-- MobileActionSheet/
|   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   |-- MobileActionSheet.tsx
|   |   |   |   |   |   |-- MobileActionSheet.module.css
|   |   |   |   |   |   |-- types.ts
|   |   |   |   |   |   |-- useAttachEntry.tsx
|   |   |   |   |   |-- SendBox/
|   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |-- sendbox.css
|   |   |   |   |   |-- SlashCommandMenu.tsx
|   |   |   |   |   |-- SpeechInputButton.tsx
|   |   |   |   |   |-- ThoughtDisplay.tsx
|   |   |   |   |-- layout/
|   |   |   |   |   |-- AppLoader.tsx
|   |   |   |   |   |-- ComputerModePill.tsx
|   |   |   |   |   |-- ComputerWorkspace.tsx
|   |   |   |   |   |-- FlexFullContainer.tsx
|   |   |   |   |   |-- InstallationIntegrityDialog.tsx
|   |   |   |   |   |-- Layout.tsx
|   |   |   |   |   |-- PwaPullToRefresh.tsx
|   |   |   |   |   |-- Router.tsx
|   |   |   |   |   |-- WindowControls.tsx
|   |   |   |   |   |-- Sider/
|   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |-- Sider.module.css
|   |   |   |   |   |   |-- SiderFooter.tsx
|   |   |   |   |   |   |-- SiderItem.tsx
|   |   |   |   |   |   |-- siderOrder.ts
|   |   |   |   |   |   |-- SortableSiderEntry.tsx
|   |   |   |   |   |   |-- TeamSiderSection.tsx
|   |   |   |   |   |   |-- useStoredSiderOrder.ts
|   |   |   |   |   |   |-- CronJobSiderSection/
|   |   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   |   |-- CronJobSiderItem.tsx
|   |   |   |   |   |   |   |-- CronJobSiderSection.tsx
|   |   |   |   |   |   |-- SiderNav/
|   |   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   |   |-- SiderScheduledEntry.tsx
|   |   |   |   |   |   |   |-- SiderSearchEntry.tsx
|   |   |   |   |   |   |   |-- SiderToolbar.tsx
|   |   |   |   |   |-- Titlebar/
|   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |-- MobileConversationBrand.tsx
|   |   |   |   |   |   |-- titlebar.css
|   |   |   |   |-- Markdown/
|   |   |   |   |   |-- CodeBlock.tsx
|   |   |   |   |   |-- index.tsx
|   |   |   |   |   |-- markdownUtils.ts
|   |   |   |   |   |-- MermaidBlock.tsx
|   |   |   |   |   |-- ShadowView.tsx
|   |   |   |   |-- media/
|   |   |   |   |   |-- Diff2Html.tsx
|   |   |   |   |   |-- Diff2Html.css
|   |   |   |   |   |-- FileAttachButton.tsx
|   |   |   |   |   |-- FilePreview.tsx
|   |   |   |   |   |-- HorizontalFileList.tsx
|   |   |   |   |   |-- LocalImageView.tsx
|   |   |   |   |   |-- UploadProgressBar.tsx
|   |   |   |   |   |-- WebviewHost.tsx
|   |   |   |   |-- settings/
|   |   |   |   |   |-- DirectorySelectionModal.tsx
|   |   |   |   |   |-- FontSizeStepper.tsx
|   |   |   |   |   |-- LanguageSwitcher.tsx
|   |   |   |   |   |-- ScaleControl.tsx
|   |   |   |   |   |-- UpdateModal.tsx
|   |   |   |   |   |-- SettingsModal/
|   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |-- model-provider.css
|   |   |   |   |   |   |-- settingsViewContext.tsx
|   |   |   |   |   |   |-- useSettingsModal.tsx
|   |   |   |   |   |   |-- contents/
|   |   |   |   |   |   |   |-- AboutModalContent.tsx
|   |   |   |   |   |   |   |-- AgentModalContent.tsx
|   |   |   |   |   |   |   |-- AppearanceModalContent.tsx
|   |   |   |   |   |   |   |-- ExtensionSettingsTabContent.tsx
|   |   |   |   |   |   |   |-- feedbackModules.ts
|   |   |   |   |   |   |   |-- FeedbackReportModal.tsx
|   |   |   |   |   |   |   |-- ModelModalContent.tsx
|   |   |   |   |   |   |   |-- ToolsModalContent.tsx
|   |   |   |   |   |   |   |-- WebuiModalContent.tsx
|   |   |   |   |   |   |   |-- channels/
|   |   |   |   |   |   |   |   |-- ChannelHeader.tsx
|   |   |   |   |   |   |   |   |-- ChannelItem.tsx
|   |   |   |   |   |   |   |   |-- ChannelModalContent.tsx
|   |   |   |   |   |   |   |   |-- DingTalkConfigForm.tsx
|   |   |   |   |   |   |   |   |-- LarkConfigForm.tsx
|   |   |   |   |   |   |   |   |-- TelegramConfigForm.tsx
|   |   |   |   |   |   |   |   |-- types.ts
|   |   |   |   |   |   |   |   |-- WecomConfigForm.tsx
|   |   |   |   |   |   |   |   |-- WeixinConfigForm.tsx
|   |   |   |   |   |   |   |-- SystemModalContent/
|   |   |   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |   |   |-- DevSettings.tsx
|   |   |   |   |   |   |   |   |-- DirInputItem.tsx
|   |   |   |   |   |   |   |   |-- PreferenceRow.tsx
|   |   |   |   |   |   |   |   |-- VoiceInputSection/
|   |   |   |   |   |   |   |   |   |-- index.tsx
|   |   |   |   |   |   |   |   |   |-- speechSettingsUtils.ts
|   |   |   |   |   |   |   |   |   |-- SpeechTestPanel.tsx
|   |   |   |   |   |-- workspace/
|   |   |   |   |   |   |-- index.ts
|   |   |   |   |   |   |-- recentWorkspaces.ts
|   |   |   |   |   |   |-- WorkspaceFolderSelect.tsx
|   |   |   |
|   |   |   |-- ui/
|   |   |   |   |-- button.tsx
|   |   |   |   |-- card.tsx
|   |   |   |   |-- input.tsx
|   |   |   |   |-- label.tsx
|   |   |   |   |-- select.tsx
|   |   |   |   |-- textarea.tsx
|   |   |
|   |   |-- hooks/
|   |   |   |-- useCustomAgents.ts
|   |   |   |-- useModels.ts
|   |   |   |-- useSessionRevocationListener.ts
|   |   |   |-- useTheme.ts
|   |   |   |-- agent/
|   |   |   |   |-- useAgentSession.ts
|   |   |   |-- chat/
|   |   |   |   |-- useAutoTitle.ts
|   |   |   |   |-- useChat.ts
|   |   |   |   |-- useSendBoxDraft.ts
|   |   |   |   |-- useSendBoxFiles.ts
|   |   |   |   |-- useSlashCommandController.ts
|   |   |   |-- context/
|   |   |   |   |-- ConversationHistoryContext.tsx
|   |   |   |   |-- LayoutContext.tsx
|   |   |   |-- file/                     # (placeholder)
|   |   |   |-- flux/
|   |   |   |   |-- agent/
|   |   |   |   |   |-- useAcpModelInfo.ts
|   |   |   |   |   |-- useAgentModesForBackend.ts
|   |   |   |   |   |-- useAgentReadinessCheck.ts
|   |   |   |   |   |-- useAgents.ts
|   |   |   |   |   |-- useConfigModelListWithImage.ts
|   |   |   |   |   |-- useGoogleAuthModels.ts
|   |   |   |   |   |-- useHubAgents.ts
|   |   |   |   |   |-- useModelProviderList.ts
|   |   |   |   |   |-- useModeModeList.ts
|   |   |   |   |   |-- usePresetAssistantInfo.ts
|   |   |   |   |-- assistant/
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- useAssistantEditor.ts
|   |   |   |   |   |-- useAssistantList.ts
|   |   |   |   |   |-- useDetectedAgents.ts
|   |   |   |   |-- chat/
|   |   |   |   |   |-- useAutoScroll.ts
|   |   |   |   |   |-- useAutoTitle.ts
|   |   |   |   |   |-- useCompositionInput.ts
|   |   |   |   |   |-- useInitialMessage.ts
|   |   |   |   |   |-- useInputFocusRing.ts
|   |   |   |   |   |-- useSendBoxDraft.ts
|   |   |   |   |   |-- useSendBoxFiles.ts
|   |   |   |   |   |-- useSlashCommandController.ts
|   |   |   |   |   |-- useSlashCommands.ts
|   |   |   |   |   |-- useTypingAnimation.ts
|   |   |   |   |-- config/
|   |   |   |   |   |-- useConfig.ts
|   |   |   |   |-- context/
|   |   |   |   |   |-- AuthContext.tsx
|   |   |   |   |   |-- ConversationContext.tsx
|   |   |   |   |   |-- ConversationHistoryContext.tsx
|   |   |   |   |   |-- FeedbackContext.tsx
|   |   |   |   |   |-- LayoutContext.tsx
|   |   |   |   |   |-- NavigationHistoryContext.tsx
|   |   |   |   |   |-- ThemeContext.tsx
|   |   |   |   |-- file/
|   |   |   |   |   |-- useAbortUploadsOnConversationChange.ts
|   |   |   |   |   |-- useAutoPreviewOfficeFiles.ts
|   |   |   |   |   |-- useConversationExport.tsx
|   |   |   |   |   |-- useDiffPreviewHandlers.ts
|   |   |   |   |   |-- useDirectorySelection.tsx
|   |   |   |   |   |-- useDragUpload.ts
|   |   |   |   |   |-- useOpenFileSelector.ts
|   |   |   |   |   |-- usePasteService.ts
|   |   |   |   |   |-- usePreviewLauncher.ts
|   |   |   |   |   |-- useUploadState.ts
|   |   |   |   |   |-- useWorkspaceSelector.ts
|   |   |   |   |-- mcp/
|   |   |   |   |   |-- catalog.ts
|   |   |   |   |   |-- index.ts
|   |   |   |   |   |-- messageQueue.ts
|   |   |   |   |   |-- useMcpConnection.ts
|   |   |   |   |   |-- useMcpModal.ts
|   |   |   |   |   |-- useMcpOAuth.ts
|   |   |   |   |   |-- useMcpServerCRUD.ts
|   |   |   |   |   |-- useMcpServers.ts
|   |   |   |   |-- system/
|   |   |   |   |   |-- useAutoPreviewOfficeFilesEnabled.ts
|   |   |   |   |   |-- useDeepLink.ts
|   |   |   |   |   |-- useExtensionSettingsTabs.ts
|   |   |   |   |   |-- useExtI18n.ts
|   |   |   |   |   |-- useLiveTranscriptInsertion.ts
|   |   |   |   |   |-- useNotificationClick.ts
|   |   |   |   |   |-- useProtocolDetection.ts
|   |   |   |   |   |-- usePwaMode.ts
|   |   |   |   |   |-- useSpeechInput.ts
|   |   |   |   |   |-- useTheme.ts
|   |   |   |   |-- ui/
|   |   |   |   |   |-- useConversationShortcuts.ts
|   |   |   |   |   |-- useDebounce.ts
|   |   |   |   |   |-- useFontScale.ts
|   |   |   |   |   |-- useFontSizes.ts
|   |   |   |   |   |-- useIndexedItemRefs.ts
|   |   |   |   |   |-- useLatestRef.ts
|   |   |   |   |   |-- useResizableSplit.tsx
|   |   |   |   |   |-- useTextSelection.ts
|   |   |   |   |   |-- useThrottle.ts
|   |   |
|   |   |-- lib/
|   |   |   |-- approval-store.ts
|   |   |   |-- chat-utils.ts
|   |   |   |-- client.ts
|   |   |   |-- config.ts
|   |   |   |-- constants.ts
|   |   |   |-- message-index.ts
|   |   |   |-- server.ts
|   |   |   |-- tool-normalizer.ts
|   |   |   |-- utils.ts
|   |   |
|   |   |-- services/
|   |   |   |-- FileService.ts
|   |   |   |-- i18n.ts
|   |   |   |-- PasteService.ts
|   |   |   |-- SpeechToTextService.ts
|   |   |   |-- speech/
|   |   |   |   |-- pcmRecorder.ts
|   |   |   |   |-- speechModels.ts
|   |   |   |   |-- SpeechStreamClient.ts
|   |   |   |   |-- speechStreamPolicy.ts
|   |   |
|   |   |-- utils/
|   |   |   |-- common.ts
|   |   |   |-- MathRenderer.tsx
|   |   |   |-- TrustScore.ts
|   |   |   |-- file/
|   |   |   |   |-- diffUtils.ts
|   |   |   |   |-- fileType.ts
|   |   |   |-- flux/
|   |   |   |   |-- appRestart.ts
|   |   |   |   |-- common.ts
|   |   |   |   |-- emitter.ts
|   |   |   |   |-- platform.ts
|   |   |   |   |-- previewError.ts
|   |   |   |   |-- chat/
|   |   |   |   |   |-- atFileQuery.ts
|   |   |   |   |   |-- autoTitle.ts
|   |   |   |   |   |-- chatMinimapEvents.ts
|   |   |   |   |   |-- conversationExport.ts
|   |   |   |   |   |-- getLastAssistantText.ts
|   |   |   |   |   |-- latexDelimiters.ts
|   |   |   |   |   |-- messageHistory.ts
|   |   |   |   |   |-- skillSuggestParser.ts
|   |   |   |   |   |-- thinkTagFilter.ts
|   |   |   |   |   |-- timeline.ts
|   |   |   |   |-- file/
|   |   |   |   |   |-- base64.ts
|   |   |   |   |   |-- diffUtils.ts
|   |   |   |   |   |-- download.ts
|   |   |   |   |   |-- fileSelection.ts
|   |   |   |   |   |-- fileType.ts
|   |   |   |   |   |-- fileTypes.ts
|   |   |   |   |   |-- messageFiles.ts
|   |   |   |   |   |-- workspaceFs.ts
|   |   |   |   |   |-- workspaceMentions.ts
|   |   |   |   |-- model/
|   |   |   |   |   |-- agentLogo.ts
|   |   |   |   |   |-- agentModes.ts
|   |   |   |   |   |-- agentTypes.ts
|   |   |   |   |   |-- agentTypeSupportPolicy.ts
|   |   |   |   |   |-- errorDetection.ts
|   |   |   |   |   |-- modelCapabilities.ts
|   |   |   |   |   |-- modelContextLimits.ts
|   |   |   |   |   |-- modelPlatforms.ts
|   |   |   |   |-- theme/
|   |   |   |   |   |-- applyFontSizes.ts
|   |   |   |   |   |-- applyTheme.ts
|   |   |   |   |   |-- customCssProcessor.ts
|   |   |   |   |   |-- systemAppearance.ts
|   |   |   |   |   |-- systemThemeWatcher.ts
|   |   |   |   |-- ui/
|   |   |   |   |   |-- clipboard.ts
|   |   |   |   |   |-- createContext.tsx
|   |   |   |   |   |-- focus.ts
|   |   |   |   |   |-- HOC.tsx
|   |   |   |   |   |-- ModalHOC.tsx
|   |   |   |   |   |-- runtimePatches.ts
|   |   |   |   |   |-- siderTooltip.ts
|   |   |   |   |-- workspace/
|   |   |   |   |   |-- workspace.ts
|   |   |   |   |   |-- workspaceEvents.ts
|   |   |   |   |   |-- workspaceHistory.ts
|   |   |
|   |   |-- theme/
|   |   |   |-- builtinThemes.ts
|   |   |
|   |   |-- styles/
|   |   |   |-- colors.ts
|   |   |   |-- layout.css
|   |   |
|   |   |-- data/
|   |   |   |-- suggestions.ts
|   |   |
|   |   |-- renderer/                   # Stubs for renderer path aliases
|   |   |   |-- pages/conversation/utils/conversationCache.ts
|   |   |   |-- services/FileService.ts
|   |   |   |-- utils/chat/autoTitle.ts
|   |   |   |-- utils/emitter.ts
|   |   |   |-- utils/file/fileTypes.ts
|   |
|   |-- dist/                            # Build output (gitignored)
|
|-- backend/
|   |-- package.json
|   |-- tsconfig.json
|   |-- prisma.config.ts
|   |-- express.d.ts
|   |-- index.ts                         # Main Express server (~3677 lines)
|   |-- middleware.ts                    # Auth middleware
|   |-- agent-tools.ts                   # Document generation (PDF/PPTX/DOCX/XLSX/CSV/MD/JSON/SQL/HTML)
|   |-- tool-registry.ts                 # Dynamic tool registration
|   |-- client.ts                        # Supabase client
|   |-- db.ts                            # Prisma client
|   |-- nim-client.ts                    # NVIDIA NIM client
|   |-- nim-openai-client.ts             # OpenAI SDK wrapper for NIM
|   |-- huggingface-client.ts            # HuggingFace client
|   |-- prompt.ts                        # System prompt template
|   |-- generationPrompt.ts              # Document gen prompt
|   |-- memory.ts                        # Vector memory CRUD
|   |-- memory-enhanced.ts               # Memory-aware tool execution
|   |-- local-embedder.ts                # Local embeddings (Xenova)
|   |-- retriever.ts                     # RAG pipeline
|   |-- safety.ts                        # Content safety
|   |-- voice-client.ts                  # STT/TTS
|   |-- Bonsai-Image-Demo/              # Vendor demo (excluded)
|   |
|   |-- flux-host/
|   |   |-- index.ts                     # WebHost entry
|   |   |-- types.ts                     # AppMetadata, WebHostOptions
|   |   |-- backend-launcher.ts          # Subprocess manager for fluxcore
|   |   |-- backend-launcher.test.ts     # Tests
|   |   |-- agent-process-registry.ts    # Agent process tracking
|   |   |-- agent-process-registry.test.ts
|   |   |-- static-server.ts             # WebUI static server + reverse proxy
|   |   |-- static-server.unit.test.ts
|   |   |-- serve-handler.d.ts
|   |
|   |-- orchestrator/
|   |   |-- index.ts                     # Re-exports
|   |   |-- types.ts                     # ExecutionPlan, Phase types
|   |   |-- orchestrator.ts              # Multi-phase plan executor
|   |   |-- planner.ts                   # Query plan generator
|   |   |-- verifier.ts                  # Phase result verification
|   |
|   |-- agent-protocol/
|   |   |-- index.ts                     # Re-exports
|   |   |-- types.ts                     # ACP types, states, messages
|   |   |-- session.ts                   # Agent session state machine
|   |   |-- team.ts                      # Multi-agent team orchestration
|   |   |-- websocket.ts                 # WebSocket handler
|   |   |-- model-selector.ts            # NIM model selection
|   |   |-- errors.ts                    # Structured error classes
|   |
|   |-- prisma/
|   |   |-- schema.prisma                # DB schema
|   |   |-- migrations/                  # Database migrations
|   |   |-- generated/                   # Prisma client (auto-generated)
|   |
|   |-- skills/
|   |   |-- SKILL.md
|   |   |-- coder-skill.md
|   |   |-- creative-skill.md
|   |   |-- csv-skill.md
|   |   |-- docx-skill.md
|   |   |-- finance-skill.md
|   |   |-- html-skill.md
|   |   |-- json-skill.md
|   |   |-- legal-skill.md
|   |   |-- md-skill.md
|   |   |-- pdf-skill.md
|   |   |-- pptx-skill.md
|   |   |-- sql-skill.md
|   |   |-- tech-writer-skill.md
|   |   |-- tsv-skill.md
|   |   |-- xlsx-skill.md
|   |
|   |-- workspace/                       # Runtime workspace (empty)
|
|-- shared/
|   |-- flux-common/
|   |   |-- index.ts                     # Barrel export
|   |   |-- electronSafe.ts              # Null-safe Electron shim
|   |   |-- adapter/
|   |   |   |-- apiModelMapper.ts        # Provider/model data mapper
|   |   |   |-- browser.ts               # Browser bridge adapter (WS)
|   |   |   |-- constant.ts              # Bridge event constants
|   |   |   |-- fileSnapshotMapper.ts    # File snapshot mapper
|   |   |   |-- httpBridge.ts            # HTTP/WS bridge factory
|   |   |   |-- ipcBridge.ts             # Full API surface (~1893 lines)
|   |   |   |-- main.ts                  # Electron main bridge adapter
|   |   |   |-- registry.ts              # WS broadcaster registry
|   |   |   |-- searchMapper.ts          # Message search mapper
|   |   |   |-- teamMapper.ts            # Team data mapper
|   |   |   |-- workspaceMapper.ts       # Workspace file listing mapper
|   |   |-- api/
|   |   |   |-- index.ts
|   |   |   |-- AnthropicRotatingClient.ts
|   |   |   |-- ApiKeyManager.ts
|   |   |   |-- ClientFactory.ts
|   |   |   |-- GeminiRotatingClient.ts
|   |   |   |-- OpenAI2AnthropicConverter.ts
|   |   |   |-- OpenAI2GeminiConverter.ts
|   |   |   |-- OpenAIRotatingClient.ts
|   |   |   |-- ProtocolConverter.ts
|   |   |   |-- RotatingApiClient.ts
|   |   |-- chat/
|   |   |   |-- atCommandParser.ts       # @path parser
|   |   |   |-- chatLib.ts              # Core chat types
|   |   |   |-- imageGenCore.ts          # Image generation logic
|   |   |   |-- normalizeToolCall.ts     # Tool call normalizer
|   |   |   |-- normalizeToolCall.test.ts
|   |   |   |-- sideQuestion.ts          # Side question support check
|   |   |   |-- approval/
|   |   |   |   |-- ApprovalStore.ts
|   |   |   |   |-- index.ts
|   |   |   |-- document/
|   |   |   |   |-- DocumentConverter.ts # Word → Markdown converter
|   |   |   |-- navigation/
|   |   |   |   |-- index.ts
|   |   |   |   |-- NavigationInterceptor.ts
|   |   |   |-- slash/
|   |   |   |   |-- acpMapping.ts
|   |   |   |   |-- availability.ts
|   |   |   |   |-- types.ts
|   |   |-- config/
|   |   |   |-- appEnv.ts
|   |   |   |-- configKeys.ts
|   |   |   |-- configMigration.ts
|   |   |   |-- configService.ts
|   |   |   |-- constants.ts
|   |   |   |-- fontSizes.ts
|   |   |   |-- i18n-config.json
|   |   |   |-- i18n.ts
|   |   |   |-- imageGenerationMcpEnv.ts
|   |   |   |-- storage.ts
|   |   |   |-- storageKeys.ts
|   |   |-- platform/
|   |   |   |-- index.ts                 # Service locator
|   |   |   |-- IPlatformServices.ts     # Platform interface
|   |   |   |-- ElectronPlatformServices.ts
|   |   |   |-- NodePlatformServices.ts
|   |   |   |-- register-electron.ts
|   |   |-- theme/
|   |   |   |-- constants.ts
|   |   |   |-- migrateThemeConfig.ts
|   |   |   |-- resolveTheme.ts
|   |   |   |-- types.ts
|   |   |-- types/
|   |   |   |-- pptx2json.d.ts
|   |   |   |-- turndown-plugin-gfm.d.ts
|   |   |   |-- agent/
|   |   |   |   |-- agentModes.ts
|   |   |   |   |-- assistantTypes.ts
|   |   |   |   |-- detectedAgent.ts
|   |   |   |   |-- hub.ts
|   |   |   |   |-- remoteAgentTypes.ts
|   |   |   |-- channel/
|   |   |   |   |-- channel.ts
|   |   |   |-- codex/
|   |   |   |   |-- codexModels.ts
|   |   |   |   |-- codexModes.ts
|   |   |   |-- office/
|   |   |   |   |-- conversion.ts
|   |   |   |   |-- preview.ts
|   |   |   |-- platform/
|   |   |   |   |-- acpTypes.ts
|   |   |   |   |-- electron.ts
|   |   |   |   |-- fileSnapshot.ts
|   |   |   |-- provider/
|   |   |   |   |-- providerApi.ts
|   |   |   |   |-- speech.ts
|   |   |   |-- team/
|   |   |   |   |-- database.ts
|   |   |   |   |-- teamTypes.ts
|   |   |-- update/
|   |   |   |-- updateTypes.ts
|   |   |   |-- models/
|   |   |   |   |-- VersionInfo.ts
|   |   |-- utils/
|   |   |   |-- appConfig.ts
|   |   |   |-- buildAgentConversationParams.ts
|   |   |   |-- imageModelAllowlist.ts
|   |   |   |-- index.ts
|   |   |   |-- modelCapabilities.ts
|   |   |   |-- platformAuthType.ts
|   |   |   |-- platformConstants.ts
|   |   |   |-- protocolDetector.ts
|   |   |   |-- urlValidation.ts
|   |   |   |-- utils.ts
|   |   |   |-- shims/
|   |   |   |   |-- xterm-headless.ts
|
|-- electron/
|   |-- main.ts                          # Electron main process
|   |-- preload.ts                       # Context bridge
|   |-- tsconfig.json
|
|-- api/
|   |-- index.ts                         # Vercel serverless adapter
|   |-- tsconfig.json
|
|-- data/
|   |-- skills/
|   |   |-- analyze-bundle/
|   |   |   |-- SKILL.md
|   |   |-- bun/
|   |   |   |-- SKILL.md
|   |   |-- bun-development/
|   |   |   |-- SKILL.md
|   |   |-- bun-runtime/
|   |   |   |-- SKILL.md
|   |   |-- copilotkit/                 # ~40+ files (plugin, CI/CD, sub-skills)
|   |   |   |-- AGENTS.md
|   |   |   |-- CLAUDE.md
|   |   |   |-- README.md
|   |   |   |-- SKILL.md
|   |   |   |-- skills-lock.json
|   |   |   |-- .mcp.json
|   |   |   |-- .github/workflows/
|   |   |   |-- agents/
|   |   |   |-- docs/superpowers/plans/
|   |   |   |-- hooks/
|   |   |   |-- scripts/
|   |   |   |-- skills/
|   |   |   |   |-- copilotkit-agui/
|   |   |   |   |-- copilotkit-contribute/
|   |   |   |   |-- copilotkit-debug/
|   |   |   |   |-- copilotkit-develop/
|   |   |   |   |-- copilotkit-integrations/
|   |   |   |   |-- copilotkit-self-update/
|   |   |   |   |-- copilotkit-setup/
|   |   |   |   |-- copilotkit-upgrade/
|   |   |-- frontend-design/
|   |   |   |-- SKILL.md
|   |   |-- logo-creator/
|   |   |   |-- SKILL.md
|   |   |   |-- examples/
|   |   |   |-- references/
|   |   |   |-- scripts/
|   |   |   |-- templates/
|   |   |-- mcp-builder/
|   |   |   |-- SKILL.md
|   |   |   |-- reference/
|   |   |   |-- scripts/
|   |   |-- multi-agent-orchestration/
|   |   |   |-- SKILL.md
|   |   |   |-- examples/
|   |   |   |-- scripts/
|   |   |-- web-design-guidelines/
|   |   |   |-- SKILL.md
|   |   |-- websocket-engineer/
|   |   |   |-- SKILL.md
|   |   |   |-- references/
|   |   |-- websocket-implementation/
|   |   |   |-- SKILL.md
|   |   |   |-- references/
|   |   |   |-- scripts/
|   |   |   |-- templates/
|
|-- dist-electron/                       # Electron build output (gitignored)
|-- node_modules/                        # Dependencies (gitignored)
|-- release/                             # Packaged Electron releases
|   |-- win-unpacked/
|   |-- Flux Setup 1.0.0.exe
|   |-- latest.yml
|-- screenshots/
|   |-- (13 screenshot images)
|-- .agents/
|-- .claude/
|-- .cursor/
|-- .kilocode/
```

---

## 3. What Each File and Folder Does

### 3.1 Root Level

| File | Purpose |
|------|---------|
| `package.json` | Root project config. Defines build scripts for Electron: `dev` (launch via `flux.ps1`), `electron:build-frontend` (Bun build frontend), `electron:build-backend` (compile backend to .exe), `electron:dev` (build + run Electron), `electron:dist` (build + package installer). DevDeps: Electron 35, electron-builder, TypeScript. |
| `AGENTS.md` | Instructions for AI coding assistants (Claude, etc.) — tells the assistant to always check DESIGN.md, use 6 listed skills, follow web design guidelines. |
| `CLAUDE.md` | Claude-specific configuration and behavior instructions. |
| `DESIGN.md` | Project design guidelines, conventions, and architecture decisions. |
| `GEMINI.md` | Gemini-specific configuration instructions. |
| `README.md` | Project overview readme. |
| `dashboard.txt` | Informal notes about the dashboard. |
| `skills-lock.json` | Lockfile for installed AI skill versions. |
| `vercel.json` | Vercel deployment configuration for serverless API deployment. |
| `electron-builder.yml` | Electron-builder packaging config (Windows NSIS installer, app metadata). |
| `flux.bat` | Windows batch launcher — runs `flux.ps1` for development. |
| `flux.ps1` | PowerShell dev launcher — manages backend + frontend processes with cleanup. |
| `.gitignore` | Standard git ignore (node_modules, dist, .env, etc.). |
| `bun.lock` | Bun package lockfile. |

### 3.2 frontend/

#### Root Config Files

| File | Purpose |
|------|---------|
| `package.json` | Frontend dependencies: React 19, React Router 7, Arco Design, Framer Motion, i18next, Mermaid, KaTeX, Recharts, SWR, Zod 4, Tailwind CSS 4, xterm, lucide-react, icon-park, pdf-lib, docx, xlsx, pptxgenjs, mammoth, diff2html, prismjs, react-markdown, etc. Scripts: `dev` (Bun HMR), `start` (production), `build` (Bun.build), `icons` (generate PWA icons). |
| `tsconfig.json` | TypeScript config: ESNext target, Preserve modules, bundler resolution, strict mode, `skipLibCheck`, `verbatimModuleSyntax`, `noEmit`. Path aliases: `@renderer/*` → `./src/*`, `@common/*` → `../shared/flux-common/*`, `@/*` → `./src/*`. |
| `bunfig.toml` | Bun config: Tailwind CSS plugin, env prefix `BUN_PUBLIC_*`. |
| `build.ts` | Custom Bun build script — cleans `dist/`, runs `Bun.build()` with Tailwind plugin, copies PWA assets, logs sizes. |
| `components.json` | shadcn/ui config (New York style, neutral base color, CSS variables). |
| `bun-env.d.ts` | Type declarations for SVG and CSS module imports. |
| `test_extreme.js` | LaTeX repair stress test utility script. |
| `.env` / `.env.local` | Environment variables (not tracked in git). |

#### `styles/`

| File | Purpose |
|------|---------|
| `globals.css` | Tailwind CSS v4 `@import "tailwindcss"`, `@theme` block defining design tokens (colors, fonts, spacing), base layer with CSS reset, `@keyframes` animations. |
| `dashboard.css` | All CSS custom properties for dark/light themes (700+ lines). Defines color variables (`--color-bg-1`, `--color-text-1`, `--color-primary-6`, etc.), scrollbar styles, hover effects, thought process animations, status indicators, component-level styles. Also imports FluxCollapse, ThoughtDisplay, TerminalComponent, SendBox CSS modules. |

#### `scripts/`

| File | Purpose |
|------|---------|
| `generate-icons.ts` | PWA icon generation script (creates PNG icons from SVG source at various sizes). |

#### `src/index.ts` — Dev/Production Server

Bun HTTP server that serves the SPA. In dev: serves `src/index.html` with HMR script injection. In production: serves from `dist/`. Handles SPA routing fallback, static file serving, and MIME types.

#### `src/index.html` — SPA Shell

HTML entry point. Loads Google Fonts (Inter, Newsreader, Cormorant Garamond), KaTeX CSS, TikZJax script, a zero-flicker theme initialization script (reads localStorage theme, applies `.dark`/`.light` class before page render), registers service worker, and loads `frontend.tsx`.

#### `src/frontend.tsx` — React Entry

Renders `<App>` into `#root` with `<StrictMode>`. Imports Arco CSS, i18n initialization, and `index.css`.

#### `src/App.tsx` — Root Router

`<BrowserRouter>` with React Router v7 routes:
- `/auth` → `<Auth />`
- `/` → `<Dashboard />` (with PeekPanel route `/peek/*`)

#### `src/i18n.ts`

i18next initialization. Currently configured to read namespaces from `locales/` directory.

#### `src/types.ts`

Core TypeScript interfaces:
- `Message` — conversation message with role, content, parts, metadata
- `MessagePart` — discriminated union (text, tool_call, thought, image, file, source, todos, plan, permission, tool_group, agent_status, terminal)
- `ConversationListItem` — conversation summary for sidebar
- `ConversationDetail` — full conversation with messages
- `GeneratedFile` — generated document reference
- `TodoItem`, `PlanStep`, `ExecutionPlan` — orchestration types
- `PermissionRequest`, `ToolGroup` — tool execution types
- `AttachedFile` — uploaded file metadata

#### `src/declarations.d.ts`

Ambient module declarations for:
- `abcjs` (music notation)
- CSS Module imports (`*.module.css`)
- `@office-ai/platform` bridge API
- `qrcode.react`
- `@sentry/electron`
- `@dnd-kit/core` types

#### `src/pages/` — Page Components

| File | Purpose |
|------|---------|
| **Auth.tsx** | Supabase OAuth login page. Branded UI with Google and GitHub sign-in buttons. Handles redirect after auth. |
| **Dashboard.tsx** | **Main application shell** (~1300 lines). Orchestrates: sidebar (conversation list + teams), message list + input, PeekPanel (preview panel), computer mode overlay, team collaboration panel, artifacts modal, news modal, settings modal, command palette (⌘K). Initializes contexts (Auth, Conversation, Theme, Layout, Feedback, Navigation). Manages conversation state (CRUD, search, selection). |
| **TestShowcase.tsx** | Component showcase/test page for UI development. |
| **conversation/index.tsx** | Dedicated conversation view page (placeholder for future route separation). |
| **conversation/GroupedHistory/** | Grouped conversation history sidebar. `index.tsx` renders grouped date headers, `ConversationRow.tsx` renders individual rows, `ConversationSearchPopover.tsx` provides inline search. Hooks: `useConversationListSync` (SWR-based polling sync), `useVisibleConversationIds` (virtualized visibility tracking). Utils: `groupingHelpers.ts` — groups conversations by date (Today/Yesterday/This Week/Last Week/This Month/Older). |
| **conversation/Messages/hooks.ts** | Custom hooks for message operations (send, edit, delete, regenerate). |
| **conversation/Preview/** | DOM preview panel system. `PreviewContext.tsx` provides context for launching/living previews of DOM snippets. Constants define preview modes. |
| **conversation/platforms/** | Platform-specific integrations. `useConversationCommandQueue.ts` manages queued command execution. `gemini/` provides GoogleModelSelector UI and `useGoogleModelSelection` hook for Gemini provider configuration. |
| **conversation/utils/** | `conversationCache.ts` — cached conversation lookups. `warmupConversation.ts` — pre-warms conversation creation for faster UX. |
| **cron/** | Scheduled tasks management. `ScheduledTasksPage.tsx` lists cron jobs, `TaskDetailPage.tsx` shows/edit individual task details, `useCronJobs.ts` manages CRUD operations. |
| **guid/index.tsx** | "New chat" / GUID page (placeholder). Hooks include `agentSelectionUtils.ts`. |
| **login/index.tsx** | Alternative login page (placeholder). |
| **settings/** | Full settings application with sub-pages: |
| | `AgentSettings.tsx` + `LocalAgents.tsx` — Agent configuration and local agent management |
| | `AppearanceSettings.tsx` + `CssThemeSettings.tsx` — Theme and CSS customization |
| | `AssistantSettings.tsx` + `assistantUtils.ts` + `types.ts` — Assistant type definitions |
| | `CapabilitiesSettings.tsx` — Feature toggle settings |
| | `ExtensionSettingsPage.tsx` — Extensions/plugins settings |
| | `ModeSettings.tsx` — Mode switching settings |
| | `PetSettings.tsx` — Desktop pet configuration |
| | `SystemSettings.tsx` — System-level settings |
| | `WebuiSettings.tsx` — Web UI server settings |
| | `ToolsSettings/McpServerItem.tsx` — MCP server configuration item |
| | `components/` — Shared settings modals: `AddMcpServerModal`, `AddModelModal`, `AddPlatformModal`, `EditModeModal`, `SettingsSider` (settings navigation sidebar) |
| **team/** | Team collaboration management. `index.tsx` renders team page. Components: `TeamCreateModal`. Hooks: `TeamPermissionContext`, `useSiderTeamBadges`, `useTeamCreatedRedirect`, `useTeamList`. |

#### `src/components/` — Reusable Components

##### Top-Level Components

| Component | Purpose |
|-----------|---------|
| **AgentStatusBar** | Shows agent connection status indicator |
| **ArtifactsModal** | Modal listing all generated files in a conversation |
| **ChartBlock** | Renders charts/tables from structured data |
| **ChatInput** | Legacy chat input (being replaced by SendBox) |
| **CustomAgentsPanel** | Panel for creating/managing custom agents |
| **FileDownloadButton** | Download button for generated files |
| **InputSeparator** | Visual separator in input areas |
| **MarkdownPreview** | Rich markdown rendering with KaTeX, Mermaid, syntax highlighting |
| **MessageItem** | Individual message bubble (text, tool calls, images, etc.) |
| **MessageList** | Scrollable message list with auto-scroll |
| **MessageRenderer** | Routes message parts to appropriate renderers |
| **NewsModal** | AI news aggregation modal |
| **PeekPanel** | Slide-over preview panel for generated content |
| **PermissionDialog** | Tool execution permission request dialog |
| **PlanDisplay** | Visual execution plan display (orchestrator) |
| **PptxPreview** | PowerPoint preview renderer |
| **PromptHistoryCard** | Recent prompt history display |
| **Settings** | Legacy settings panel |
| **Sidebar** | Legacy sidebar component |
| **SidebarThread** | Threaded conversation sidebar |
| **SourceCard** | Renders a source citation card |
| **StatusMessage** | Status/loading indicator messages |
| **SuggestedActions** | Action suggestion buttons |
| **TeamPanel** | Team collaboration panel |
| **TerminalComponent** | Embedded xterm.js terminal for shell execution |
| **ThoughtDisplay** | Animated thought/reasoning display |
| **TodoList** | Interactive to-do list component |
| **ToolsDropdown** | Tool selection dropdown |
| **ToolSummary** | Tool execution summary display |
| **XlsxPreview** | Excel spreadsheet preview renderer |

##### `components/ui/` — shadcn/ui Primitives

| Component | Purpose |
|-----------|---------|
| `button.tsx` | Base button component with variants (default, secondary, outline, ghost, link, destructive) |
| `card.tsx` | Card layout component (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter) |
| `input.tsx` | Styled input component |
| `label.tsx` | Form label component |
| `select.tsx` | Select dropdown component |
| `textarea.tsx` | Styled textarea component |

##### `components/flux/` — Flux Design System

**`agent/`** — Agent-related UI:
| Component | Purpose |
|-----------|---------|
| **AcpModelSelector** | ACP model selection dropdown |
| **AgentBadge** | Badge showing agent name/status |
| **AgentModeSelector** | Mode switching (chat/agent/codex) |
| **AgentSetupCard** | Agent configuration card |
| **ChannelConflictWarning** | Channel configuration conflict warning |
| **ContextUsageIndicator** | Context window usage bar |
| **MarqueePillLabel** | Animated scrolling label pill |

**`base/`** — Base UI primitives:
| Component | Purpose |
|-----------|---------|
| **FeedbackButton** | Thumbs up/down feedback button |
| **FileChangesPanel** | File diff changes display panel |
| **FluxCollapse** | Collapsible panel component |
| **FluxModal** | Modal dialog wrapper |
| **FluxScrollArea** | Custom scrollable area |
| **FluxSelect** | Enhanced select dropdown with search |
| **FluxSteps** | Step progress indicator |
| **ModalWrapper** | Modal state management wrapper |
| **index.ts** | Barrel re-export of all base components |

**`chat/`** — Chat-related UI:
| Component | Purpose |
|-----------|---------|
| **AtFileMenu** | `@file` reference menu for file selection |
| **BtwOverlay** | "By the way" side-question overlay (CSS modules) |
| **CollapsibleContent** | Expandable content sections |
| **CommandQueuePanel** | Drag-to-reorder queued command list |
| **EmojiPicker** | Emoji picker popover |
| **MobileActionSheet** | Mobile bottom action sheet (CSS modules) |
| **SendBox** | Main message input box with file attachments, speech input, emoji picker |
| **SlashCommandMenu** | `/` command menu popover |
| **SpeechInputButton** | Voice input button with recording state |
| **ThoughtDisplay** | Inline thought/reasoning display |

**`layout/`** — Layout components:
| Component | Purpose |
|-----------|---------|
| **AppLoader** | Loading spinner for app initialization |
| **ComputerModePill** | Computer mode status indicator |
| **ComputerWorkspace** | Computer mode workspace (screen capture + overlay) |
| **FlexFullContainer** | Full-height flex container |
| **InstallationIntegrityDialog** | Installation integrity check dialog |
| **Layout** | Main app layout (sidebar + content + titlebar) |
| **PwaPullToRefresh** | PWA pull-to-refresh gesture handler |
| **Router** | Layout-aware router wrapper |
| **WindowControls** | Custom titlebar window buttons (min/max/close) |

| **Sider/** | Sidebar navigation system |
|------------|--------------------------|
| `index.tsx` | Main sidebar container with drag-reorderable entries |
| `SiderFooter.tsx` | Sidebar bottom actions (settings, user menu) |
| `SiderItem.tsx` | Individual sidebar conversation item |
| `siderOrder.ts` | Default sider item order configuration |
| `SortableSiderEntry.tsx` | Drag-sortable wrapper for sider items |
| `TeamSiderSection.tsx` | Team conversations section |
| `useStoredSiderOrder.ts` | Persists sider item order to localStorage |
| `CronJobSiderSection/` | Cron job list in sidebar |
| `SiderNav/` | Navigation entries (search, toolbar, scheduled) |

| **Titlebar/** | Custom titlebar |
|---------------|-----------------|
| `index.tsx` | Title bar with window title, mobile back button |
| `MobileConversationBrand.tsx` | Mobile branding header |
| `titlebar.css` | Titlebar styles |

**`Markdown/`** — Markdown rendering:
| Component | Purpose |
|-----------|---------|
| **CodeBlock** | Syntax-highlighted code block with copy button |
| **index.tsx** | Main markdown renderer (react-markdown + plugins) |
| **markdownUtils.ts** | Markdown/HTML conversion utilities |
| **MermaidBlock** | Mermaid diagram renderer |
| **ShadowView** | Isolated shadow DOM rendering for previews |

**`media/`** — Media/file components:
| Component | Purpose |
|-----------|---------|
| **Diff2Html** | Side-by-side diff display |
| **FileAttachButton** | File attachment button with type selection |
| **FilePreview** | Generic file preview (image, PDF, code, etc.) |
| **HorizontalFileList** | Horizontal scrolling file list |
| **LocalImageView** | Local image viewer |
| **UploadProgressBar** | File upload progress indicator |
| **WebviewHost** | Embedded webview for previews |

**`settings/`** — Settings-related components:
| Component | Purpose |
|-----------|---------|
| **DirectorySelectionModal** | Directory picker modal |
| **FontSizeStepper** | Font size increment/decrement control |
| **LanguageSwitcher** | Language selection dropdown |
| **ScaleControl** | UI scale percentage control |
| **UpdateModal** | App update notification modal |

| **SettingsModal/** | Main settings dialog |
|--------------------|---------------------|
| `index.tsx` | Settings modal container with tab navigation |
| `model-provider.css` | Model provider list styles |
| `settingsViewContext.tsx` | Settings view mode context (modal vs page) |
| `useSettingsModal.tsx` | Settings modal open/close hook |
| **contents/** | Settings tab content panels |

| **SettingsModal/contents/** | Individual settings panels |
|-----------------------------|---------------------------|
| `AboutModalContent.tsx` | About/version info |
| `AgentModalContent.tsx` | Agent settings |
| `AppearanceModalContent.tsx` | Theme/color customization |
| `ExtensionSettingsTabContent.tsx` | Extension management |
| `FeedbackReportModal.tsx` | Bug report / feedback form |
| `feedbackModules.ts` | Feedback module definitions |
| `ModelModalContent.tsx` | LLM provider/model configuration |
| `ToolsModalContent.tsx` | MCP server and image generation config |
| `WebuiModalContent.tsx` | Web UI server settings |
| `channels/` | Channel/plugin config forms (DingTalk, Lark, Telegram, Wecom, Weixin) |
| `SystemModalContent/` | System settings + DevSettings + DirInputItem + PreferenceRow + VoiceInputSection |

**`workspace/`** — Workspace management:
| Component | Purpose |
|-----------|---------|
| **WorkspaceFolderSelect** | Workspace directory selector |
| **recentWorkspaces.ts** | Recent workspace tracking |
| **index.ts** | Workspace utilities barrel export |

#### `src/hooks/` — Custom React Hooks

**Top-level hooks:**
| Hook | Purpose |
|------|---------|
| `useCustomAgents` | CRUD operations for custom agent definitions |
| `useModels` | Model list retrieval and categorization |
| `useSessionRevocationListener` | Force logout when Supabase session is revoked |
| `useTheme` | Theme toggling (light/dark/system) |

**`agent/`:**
| Hook | Purpose |
|------|---------|
| `useAgentSession` | WebSocket-based ACP agent session management |

**`chat/`:**
| Hook | Purpose |
|------|---------|
| `useAutoTitle` | Auto-generates conversation titles from first message |
| `useChat` | SSE-based chat streaming, message send/receive |
| `useSendBoxDraft` | Draft message persistence (localStorage) |
| `useSendBoxFiles` | File attachment management for SendBox |
| `useSlashCommandController` | `/` command parsing and execution |

**`context/`:**
| Hook | Purpose |
|------|---------|
| `ConversationHistoryContext.tsx` | Context for conversation list state |
| `LayoutContext.tsx` | Context for layout state (sidebar, panel) |

**`flux/agent/`** — Agent-related hooks:
| Hook | Purpose |
|------|---------|
| `useAcpModelInfo` | ACP model information |
| `useAgentModesForBackend` | Agent mode compatibility with backend |
| `useAgentReadinessCheck` | Agent readiness validation |
| `useAgents` | Agent list retrieval |
| `useConfigModelListWithImage` | Model list including image generation models |
| `useGoogleAuthModels` | Google auth model configuration |
| `useHubAgents` | Hub/remote agent querying |
| `useModelProviderList` | Model provider list with health status |
| `useModeModeList` | Mode list for agent configuration |
| `usePresetAssistantInfo` | Preset assistant metadata |

**`flux/assistant/`** — Assistant-related hooks:
| Hook | Purpose |
|------|---------|
| `useAssistantEditor` | Assistant CRUD editor |
| `useAssistantList` | Assistant list management |
| `useDetectedAgents` | Auto-detected agents from MCP servers |

**`flux/chat/`** — Chat-related hooks:
| Hook | Purpose |
|------|---------|
| `useAutoScroll` | Smart auto-scroll with user interruption detection |
| `useAutoTitle` | Auto-title generation (flux version) |
| `useCompositionInput` | IME composition input handling |
| `useInitialMessage` | First message injection |
| `useInputFocusRing` | Input focus ring animation |
| `useSendBoxDraft` | Draft persistence (flux version) |
| `useSendBoxFiles` | File state management (flux version) |
| `useSlashCommandController` | Slash command controller (flux version) |
| `useSlashCommands` | Slash command definitions |
| `useTypingAnimation` | Typing indicator animation |

**`flux/config/`:**
| Hook | Purpose |
|------|---------|
| `useConfig` | Client-side configuration management |

**`flux/context/`** — React contexts:
| Context | Purpose |
|---------|---------|
| `AuthContext` | Authentication state (user, session, login/logout) |
| `ConversationContext` | Active conversation state |
| `ConversationHistoryContext` | Conversation list state |
| `FeedbackContext` | User feedback submission |
| `LayoutContext` | Layout state (sidebar width, panel visibility) |
| `NavigationHistoryContext` | Navigation history tracking |
| `ThemeContext` | Theme state and toggling |

**`flux/file/`** — File management hooks:
| Hook | Purpose |
|------|---------|
| `useAbortUploadsOnConversationChange` | Cancels pending uploads on conversation switch |
| `useAutoPreviewOfficeFiles` | Auto-preview for Office files |
| `useConversationExport` | Conversation export (markdown, PDF) |
| `useDiffPreviewHandlers` | Diff preview interactions |
| `useDirectorySelection` | Directory picker dialog |
| `useDragUpload` | Drag-and-drop file upload |
| `useOpenFileSelector` | File open dialog |
| `usePasteService` | Clipboard paste handling |
| `usePreviewLauncher` | Launch preview panel for content |
| `useUploadState` | Upload progress tracking |
| `useWorkspaceSelector` | Workspace directory selection |

**`flux/mcp/`** — MCP-related hooks:
| Hook/Module | Purpose |
|-------------|---------|
| `catalog.ts` | MCP tool catalog definitions |
| `index.ts` | Barrel re-exports |
| `messageQueue.ts` | MCP message queue for sequential processing |
| `useMcpConnection` | MCP server connection testing |
| `useMcpModal` | MCP server add/edit modal state |
| `useMcpOAuth` | MCP OAuth login flow |
| `useMcpServerCRUD` | MCP server create/update/delete |
| `useMcpServers` | MCP server list with loading state |

**`flux/system/`** — System-related hooks:
| Hook | Purpose |
|------|---------|
| `useAutoPreviewOfficeFilesEnabled` | Auto-preview toggle state |
| `useDeepLink` | Deep link handling (model config links) |
| `useExtensionSettingsTabs` | Extension settings tab management |
| `useExtI18n` | Extension i18n integration |
| `useLiveTranscriptInsertion` | Live transcription insertion |
| `useNotificationClick` | Notification click handler |
| `useProtocolDetection` | AI provider protocol detection |
| `usePwaMode` | PWA mode detection |
| `useSpeechInput` | Speech-to-text input |
| `useTheme` | Theme management (flux version) |

**`flux/ui/`** — UI utility hooks:
| Hook | Purpose |
|------|---------|
| `useConversationShortcuts` | Keyboard shortcuts for conversation management |
| `useDebounce` | Debounced value hook |
| `useFontScale` | Font scaling (zoom) |
| `useFontSizes` | Font size configuration |
| `useIndexedItemRefs` | Indexed item refs for scroll-to-message |
| `useLatestRef` | Always-fresh ref for callbacks |
| `useResizableSplit` | Resizable split pane |
| `useTextSelection` | Text selection tracking |
| `useThrottle` | Throttled value hook |

#### `src/lib/` — Core Libraries

| File | Purpose |
|------|---------|
| `client.ts` | Supabase browser client factory |
| `server.ts` | Supabase server client (SSR cookie-based auth) |
| `config.ts` | Backend URL constant, Unsplash API key |
| `constants.ts` | `ToolConfirmationOutcome` enum |
| `chat-utils.ts` | Parses assistant responses: extracts `<ANSWER>`, `<FOLLOW_UPS>`, `<SOURCES>` tags |
| `message-index.ts` | O(1) message lookup for streaming updates (Map<msg_id, index>) |
| `tool-normalizer.ts` | Normalizes `tool_call` / `tool_result` / `tool_group` into unified format |
| `approval-store.ts` | localStorage-persistent tool permission approval cache |
| `utils.ts` | `cn()` utility (clsx + tailwind-merge) |

#### `src/services/` — Service Layer

| File | Purpose |
|------|---------|
| `FileService.ts` | File system operations (read, write, list) |
| `i18n.ts` | i18next initialization with English resources |
| `PasteService.ts` | Clipboard paste handling (files, images, text) |
| `SpeechToTextService.ts` | Speech-to-text API service |
| `speech/pcmRecorder.ts` | PCM audio recorder for speech input |
| `speech/speechModels.ts` | Speech model type definitions |
| `speech/SpeechStreamClient.ts` | Streaming speech recognition client |
| `speech/speechStreamPolicy.ts` | Speech stream retry/buffering policy |

#### `src/utils/` — Utilities

| Category | File | Purpose |
|----------|------|---------|
| Top-level | `common.ts` | Common utility functions |
| Top-level | `MathRenderer.tsx` | Math formula rendering (KaTeX) |
| Top-level | `TrustScore.ts` | Source trust score calculation |
| `file/` | `diffUtils.ts` | File diff utilities |
| `file/` | `fileType.ts` | File type detection |
| `flux/` | `appRestart.ts` | Application restart handler |
| `flux/` | `common.ts` | Flux common utilities |
| `flux/` | `emitter.ts` | Event emitter for cross-component communication |
| `flux/` | `platform.ts` | Platform detection |
| `flux/` | `previewError.ts` | Preview error handling |
| `flux/chat/` | `atFileQuery.ts` | `@file` query resolution |
| `flux/chat/` | `autoTitle.ts` | Auto-title generation logic |
| `flux/chat/` | `chatMinimapEvents.ts` | Chat minimap scroll events |
| `flux/chat/` | `conversationExport.ts` | Export conversation to markdown |
| `flux/chat/` | `getLastAssistantText.ts` | Extract last assistant text |
| `flux/chat/` | `latexDelimiters.ts` | LaTeX delimiter handling |
| `flux/chat/` | `messageHistory.ts` | Message history utilities |
| `flux/chat/` | `skillSuggestParser.ts` | Parse skill suggestions from response |
| `flux/chat/` | `thinkTagFilter.ts` | Filter <｜end▁of▁thinking｜> tags |
| `flux/chat/` | `timeline.ts` | Timeline event utilities |
| `flux/file/` | `base64.ts` | Base64 encode/decode |
| `flux/file/` | `diffUtils.ts` | Flux file diff utilities |
| `flux/file/` | `download.ts` | File download handler |
| `flux/file/` | `fileSelection.ts` | File selection state management |
| `flux/file/` | `fileType.ts` | Flux file type detection |
| `flux/file/` | `fileTypes.ts` | File type constants |
| `flux/file/` | `messageFiles.ts` | Message file attachments |
| `flux/file/` | `workspaceFs.ts` | Workspace filesystem operations |
| `flux/file/` | `workspaceMentions.ts` | Workspace file mention parser |
| `flux/model/` | `agentLogo.ts` | Agent logo URL resolution |
| `flux/model/` | `agentModes.ts` | Agent mode type definitions |
| `flux/model/` | `agentTypes.ts` | Agent type definitions |
| `flux/model/` | `agentTypeSupportPolicy.ts` | Agent type support policy |
| `flux/model/` | `errorDetection.ts` | Error pattern detection |
| `flux/model/` | `modelCapabilities.ts` | Model capability detection |
| `flux/model/` | `modelContextLimits.ts` | Model context window limits |
| `flux/model/` | `modelPlatforms.ts` | Model platform definitions |
| `flux/theme/` | `applyFontSizes.ts` | Apply font size CSS variables |
| `flux/theme/` | `applyTheme.ts` | Apply theme CSS variables |
| `flux/theme/` | `customCssProcessor.ts` | Custom CSS processing |
| `flux/theme/` | `systemAppearance.ts` | OS appearance preference detection |
| `flux/theme/` | `systemThemeWatcher.ts` | OS theme change listener |
| `flux/ui/` | `clipboard.ts` | Clipboard operations |
| `flux/ui/` | `createContext.tsx` | Context factory with hooks |
| `flux/ui/` | `focus.ts` | Focus management |
| `flux/ui/` | `HOC.tsx` | Higher-order component utilities |
| `flux/ui/` | `ModalHOC.tsx` | Modal HOC utilities |
| `flux/ui/` | `runtimePatches.ts` | Runtime browser patches |
| `flux/ui/` | `siderTooltip.ts` | Sider tooltip utilities |
| `flux/workspace/` | `workspace.ts` | Workspace state management |
| `flux/workspace/` | `workspaceEvents.ts` | Workspace event handlers |
| `flux/workspace/` | `workspaceHistory.ts` | Workspace history tracking |

#### `src/theme/`

| File | Purpose |
|------|---------|
| `builtinThemes.ts` | Light and Dark theme token definitions (imports from shared `flux-common` theme types). Defines 200+ CSS custom properties per theme. |

#### `src/styles/`

| File | Purpose |
|------|---------|
| `colors.ts` | Icon color constants and diff color definitions |
| `layout.css` | App shell layout styles |

#### `src/data/`

| File | Purpose |
|------|---------|
| `suggestions.ts` | Prompt suggestion categories ("for-you", "build-business", "organize-life", "recruiting", "create") each with 10 starter prompts. |

#### `src/renderer/` — Renderer Path Alias Stubs

Stub files created for the `@renderer/*` path alias (resolves to `./src/renderer/*`):
- `pages/conversation/utils/conversationCache.ts` — Stub for conversation cache functions
- `services/FileService.ts` — Stub file service
- `utils/chat/autoTitle.ts` — Stub auto-title
- `utils/emitter.ts` — Stub emitter
- `utils/file/fileTypes.ts` — Stub file types

### 3.3 backend/

#### Root Config Files

| File | Purpose |
|------|---------|
| `package.json` | Backend dependencies (ESM). Express 5, CORS, Helmet, rate-limit, AI SDK v6, OpenAI/Google providers, Zod 4, Supabase JS, Tavily (web search), Xenova Transformers, Prisma, ws, pdf-lib, docx, pptxgenjs, xlsx, @edge-tts/universal. Postinstall: `prisma generate`. |
| `tsconfig.json` | ESNext target, Preserve modules, bundler resolution, strict. Path aliases: `@common/*` → `../shared/flux-common/*`, `@host/*` → `./flux-host/*`. Excludes `Bonsai-Image-Demo`. |
| `prisma.config.ts` | Prisma configuration (schema path, datasource URL). |
| `express.d.ts` | Global Express type augmentation (adds `userId`/`authUser`/`appUserId` to Express Request). |

#### Root Source Files

| File | Lines | Purpose |
|------|-------|---------|
| **index.ts** | ~3677 | **Main Express server entry point.** All REST routes defined inline. Key endpoints: `POST /flux_ask` (SSE chat stream), `POST /api/chat-sdk` (AI SDK compatible), conversation CRUD, news aggregation (HN+RSS), memories, tools, models, ACP capabilities, agents, permissions, TTS, health, ping, proxy, summarize, file assets. Defines tool definitions (web_search, read_skill, generate_document, shell_execute, file management, get_weather, generate_image). Includes permission system, auto-document generation, Mistral tool call parser, robust JSON parser, weather APIs. |
| **middleware.ts** | 46 | Express auth middleware. Verifies Supabase JWT from `Authorization` header, upserts user into local DB, attaches `req.userId`, `req.authUser`, `req.appUserId`. |
| **agent-tools.ts** | ~900 | Document generation tools. Functions for PPTX, DOCX, PDF, XLSX, CSV, TSV, MD, JSON, SQL, HTML file generation. PDF engine supports 4 templates (corporate, minimal, creative, report) with DejaVu fonts, cover pages, tables, lists. |
| **tool-registry.ts** | ~200 | `ToolRegistry` class — MCP-like dynamic tool registration. Registers 8 built-in tools with metadata (parameters, category, approval requirements). |
| **prompt.ts** | ~100 | System prompt for Flux AI assistant. Core capabilities, tool usage rules, response style (must end with 3 follow-up questions), behavioral rules. |
| **generationPrompt.ts** | ~120 | Document generation system prompt. Instructs model to produce structured JSON for file creation. |
| **memory.ts** | ~200 | Vector memory system using pgvector (`<=>` distance). Functions: `retrieveMemories` (HNSW similarity search), `extractMemories` (LLM fact extraction), `buildMemoryContext`, `pruneMemories`. |
| **memory-enhanced.ts** | ~70 | Wraps tool execution with memory context injection. Enhances web_search queries and document generation with user preferences. |
| **local-embedder.ts** | 20 | Local embedding via Xenova Transformers (bge-m3, 1024-dim). Caches models to `./models_cache`. |
| **retriever.ts** | ~45 | RAG pipeline: embedding + re-ranking using NVIDIA Nemoretriever models. Cosine similarity + LLM-based relevance scoring. |
| **safety.ts** | ~20 | Content safety check using NVIDIA Nemotron-3 Content Safety model. Returns SAFE/UNSAFE. |
| **voice-client.ts** | ~35 | Speech-to-text (Parakeet 1.1B) and text-to-speech (Magpie TTS) via NIM API. |
| **nim-client.ts** | ~35 | NVIDIA NIM AI SDK client. OpenAI-compatible, custom fetch with 429 retry and exponential backoff. |
| **nim-openai-client.ts** | 5 | Thin OpenAI SDK wrapper for NIM. |
| **huggingface-client.ts** | 8 | HuggingFace AI SDK client (OpenAI-compatible). |
| **client.ts** | 5 | Supabase client factory. |
| **db.ts** | 6 | Prisma client singleton with `@prisma/adapter-pg` connection pooling. |

#### `flux-host/` — Web Host Infrastructure

| File | Purpose |
|------|---------|
| **index.ts** | `startWebHost()` entry point — orchestrates backend-launcher + static-server startup sequence. |
| **types.ts** | Type definitions: `AppMetadata`, `BackendBinaryResolver`, `BackendSystemDirs`, `WebHostOptions`, `WebHostHandle` |
| **backend-launcher.ts** | **Backend Lifecycle Manager.** Spawns/manages `fluxcore` subprocess. Port finding (avoids 70+ fetch-forbidden ports), health checks (polling + TCP probe), crash restart (exponential backoff, max 3 retries), signal handling (SIGTERM/SIGKILL/taskkill), detailed error diagnostics. |
| **agent-process-registry.ts** | JSON-based registry for spawned agent shell processes. `registerProcess`, `unregisterProcess`, `cleanupRegisteredAgentProcesses` (terminates orphaned processes on startup). |
| **static-server.ts** | **WebUI static server.** Node native `http` + `serve-handler`. Reverse-proxies `/api/*`, `/ws`, `/api/stt/stream`, `/login`, `/logout` to backend. TCP-level WebSocket upgrade splicing. |
| **serve-handler.d.ts** | Type declaration for the `serve-handler` npm package. |

#### `orchestrator/` — Workflow Engine

| File | Purpose |
|------|---------|
| **index.ts** | Barrel re-exports `OrchestratorEngine`, `Planner`, `Verifier` and types. |
| **types.ts** | Type definitions: `PhaseType` (research, load_skill, generate_doc, simple_answer, image_gen, weather, analyze, execute, verify, shell, filesystem), `ExecutionPlan`, `Phase`, `PhaseResult`, `StreamWriter`, `WorkflowKind`. |
| **orchestrator.ts** | **`OrchestratorEngine`** — Multi-phase plan executor. Executes phases sequentially, supports retries with verification, compiles results. Handles 12 phase types with specialized execution logic. |
| **planner.ts** | **`Planner`** — Analyzes user query via regex intent detection, returns `ExecutionPlan`. Detects: document creation, weather, image generation, code requests, analysis/research, computer mode. |
| **verifier.ts** | **`Verifier`** — Validates phase results against criteria (has_sources, min_sources, has_file, has_skill_content, has_text_output, semantic_match). |

#### `agent-protocol/` — Agent Communication Protocol

| File | Purpose |
|------|---------|
| **index.ts** | Barrel re-exports all ACP modules. |
| **types.ts** | ACP type system: `AgentSessionState` (9 states: idle → connecting → warming_up → ready → processing → awaiting_permission → cooldown → error → finished), `AgentSessionConfig`, `AgentCapabilities`, `AgentMessage` (18 message types), payload types (ToolCall, ToolGroup, PermissionRequest, Plan, AgentStatus, Thinking, ContextUsage, Error). Valid state transition definitions. |
| **session.ts** | **`AgentSession`** — State machine with lifecycle management, message routing, tool results, permission requests, capabilities. **`SessionRegistry`** — Global session store with cleanup. |
| **team.ts** | **Multi-agent team orchestration.** Leader/teammate model. Leader analyzes task via NIM LLM, delegates subtasks (sequential or parallel), synthesizes results. `TeamRegistry` for lifecycle management. |
| **websocket.ts** | **WebSocket handler** (`/agent` path). Handles: auth (Supabase JWT), `session_start`, `user_message` (proxies to `/flux_ask` SSE), `permission_response`, `update_mode`, `session_stop`. SSE-to-WS event mapping. Heartbeat (30s interval). |
| **model-selector.ts** | NIM model selection utility (16 models). `selectModel`, `getModelList`, `isVisionModel`. |
| **errors.ts** | Structured error hierarchy: `AgentError` (base), `AuthError`, `SessionError`, `ToolError`, `TimeoutError`, `ValidationError`. Helper: `isRetryableError`. |

#### `prisma/`

| File | Purpose |
|------|---------|
| `schema.prisma` | PostgreSQL schema: `User` (auth), `Conversation` (chat threads), `Message` (chat messages), `Memory` (vector-enabled facts). pgvector extension for `Memory.embedding`. Indexes on user_id, conversation_id, created_at. |
| `migrations/` | 13 migration folders covering schema evolution from initial setup to latest changes. |
| `generated/` | Auto-generated Prisma client code (client, types, enums). |

#### `skills/`

16 Markdown skill definition files that instruct the AI on how to handle specific document generation tasks:
| File | Purpose |
|------|---------|
| `coder-skill.md` | Code generation and programming |
| `creative-skill.md` | Creative writing |
| `csv-skill.md` | CSV file generation |
| `docx-skill.md` | Word document generation |
| `finance-skill.md` | Financial analysis |
| `html-skill.md` | HTML page generation |
| `json-skill.md` | JSON data generation |
| `legal-skill.md` | Legal document writing |
| `md-skill.md` | Markdown document generation |
| `pdf-skill.md` | PDF generation |
| `pptx-skill.md` | PowerPoint generation |
| `sql-skill.md` | SQL query generation |
| `tech-writer-skill.md` | Technical writing |
| `tsv-skill.md` | TSV file generation |
| `xlsx-skill.md` | Excel file generation |

### 3.4 shared/flux-common/

#### Root Files

| File | Purpose |
|------|---------|
| **index.ts** | Barrel export — re-exports `ipcBridge` and conversation adapter. |
| **electronSafe.ts** | Null-safe Electron shim. Lazily loads Electron modules only when running in Electron environment. |

#### `adapter/` — IPC/HTTP/WS Bridge

| File | Purpose |
|------|---------|
| **apiModelMapper.ts** | Maps provider+model data between frontend camelCase and backend snake_case. |
| **browser.ts** | Browser bridge adapter. Uses WebSocket when running in browser, falls back to Electron IPC when `window.electronAPI` exists. Handles reconnection, heartbeat, auth expiration redirect. |
| **constant.ts** | Bridge event key constants (ADAPTER_BRIDGE_EVENT_KEY, SHOW_OPEN_REQUEST_EVENT). |
| **fileSnapshotMapper.ts** | Maps file snapshot results between backend and frontend formats. |
| **httpBridge.ts** | HTTP/WS bridge factory. Provides `httpGet`, `httpPost`, `httpPut`, `httpPatch`, `httpDelete`, `wsEmitter`. Core networking layer for frontend-to-backend communication. |
| **ipcBridge.ts** | **(~1893 lines)** Defines the entire backend API surface as typed provider objects. All API calls defined here: conversations, assistants, shell, filesystem, MCP, teams, channels, extensions, cron, webui, settings, updates, etc. Some Electron-native operations (window, auto-update, notifications, dialogs) use `bridge.buildProvider`. All other calls route via HTTP/WS. |
| **main.ts** | Electron main process bridge adapter. Manages IPC with BrowserWindows and broadcasts to WebSocket clients. |
| **registry.ts** | WebSocket broadcaster registry. Maintains list of broadcast functions and bridge emitter reference. |
| **searchMapper.ts** | Maps message search results between backend API and frontend types. |
| **teamMapper.ts** | Maps team/agent data (create, list, get, serialize) between formats. |
| **workspaceMapper.ts** | Maps workspace file listings, handles path normalization (Windows/Mac), implements relative-to-absolute path conversion. |

#### `api/` — AI Provider Rotating Clients

| File | Purpose |
|------|---------|
| **AnthropicRotatingClient.ts** | Rotating API client for Anthropic/Claude. Cycles through API keys with failover. |
| **ApiKeyManager.ts** | Manages multiple API keys for rotation and fallback. |
| **ClientFactory.ts** | Factory that creates appropriate client based on provider type. |
| **GeminiRotatingClient.ts** | Rotating API client for Google Gemini. |
| **OpenAI2AnthropicConverter.ts** | Protocol adapter: OpenAI format → Anthropic format. |
| **OpenAI2GeminiConverter.ts** | Protocol adapter: OpenAI format → Gemini format. |
| **OpenAIRotatingClient.ts** | Rotating API client for OpenAI-compatible endpoints. |
| **ProtocolConverter.ts** | Converts between different API protocols (OpenAI ↔ Anthropic ↔ Gemini). |
| **RotatingApiClient.ts** | Base rotating client with failover logic. |

#### `chat/` — Chat Logic & Utilities

| File | Purpose |
|------|---------|
| **chatLib.ts** | Core chat types (`TMessage`, `IConfirmation`), path joining, message merging utilities. |
| **atCommandParser.ts** | Parses `@path` file references in user input (with escape handling). |
| **imageGenCore.ts** | Shared image generation logic (used by built-in MCP server and legacy Gemini tool). Uses ClientFactory, handles JSON repair, saves images. |
| **normalizeToolCall.ts** | Normalizes tool calls from various formats into standard `NormalizedToolCall` interface. |
| **sideQuestion.ts** | Checks if "side questions" are supported (ACP + Claude backend only). |
| **approval/ApprovalStore.ts** | `IApprovalKey` and `IApprovalStore` interfaces for caching "always allow" decisions per session. |
| **document/DocumentConverter.ts** | Converts Word documents to Markdown using mammoth + turndown. |
| **navigation/NavigationInterceptor.ts** | Intercepts browser navigation tools for preview panel integration, with Chrome DevTools MCP support. |
| **slash/** | Slash command system: types, availability (ACP/fluxrs only), ACP command mapping. |

#### `config/` — Configuration Management

| File | Purpose |
|------|---------|
| **storage.ts** | **(~659 lines)** Central storage references. Defines `IConfigStorageRefer` (all persisted config keys), `IEnvStorageRefer`, `TChatConversation` union type (acp, codex, openclaw-gateway, gemini, nanobot, remote, fluxrs). |
| **configKeys.ts** | Type-safe config key map (`ConfigKeyMap`) — maps each key to its value type. |
| **configService.ts** | Client-side config service with in-memory cache and REST persistence (`GET/PUT /api/settings/client`). Subscribe/notify pattern. |
| **configMigration.ts** | Migrates legacy config (providers, assistants, MCP servers) to backend. |
| **constants.ts** | App-wide constants: image extensions, MIME types, WebUI default ports (25808/25809/25810), timestamp separators. |
| **appEnv.ts** | Environment-aware naming (appends `-dev`/`-dev-2` for dev builds). |
| **fontSizes.ts** | Font size specs for chat/markdown/code (min/max/default). |
| **i18n.ts** | i18n utilities: language normalization, deep-merge with fallback, lazy loading. |
| **i18n-config.json** | Supported languages list and fallback config. |
| **imageGenerationMcpEnv.ts** | Environment setup for built-in image generation MCP server. |
| **storageKeys.ts** | Centralized localStorage key names. |

#### `platform/` — Platform Abstraction Layer

| File | Purpose |
|------|---------|
| **IPlatformServices.ts** | Interface: `IPlatformPaths`, `IWorkerProcess`, `IPowerManager`, `INotificationService`, `INetworkService`. |
| **ElectronPlatformServices.ts** | Electron implementation using `app`, `net`, `Notification`, `powerSaveBlocker`, `utilityProcess`. |
| **NodePlatformServices.ts** | Node.js implementation using `child_process.fork`, `fs`, `os`, global `fetch`. |
| **index.ts** | Service locator (`registerPlatformServices`, `getPlatformServices`). Auto-registers Electron when detected. |
| **register-electron.ts** | Side-effect module registers `ElectronPlatformServices` (imported first in main process). |

#### `theme/` — Theme System

| File | Purpose |
|------|---------|
| **types.ts** | `Theme` type (id, name, appearance, tokens, css, builtin flag). |
| **constants.ts** | Theme IDs (`light`, `dark`, `system`). |
| **resolveTheme.ts** | Resolves active theme (including `system` → OS preference). |
| **migrateThemeConfig.ts** | Migrates legacy CSS theme config to unified format. |

#### `types/` — Shared Type Definitions

| Directory | Files | Purpose |
|-----------|-------|---------|
| `agent/` | `agentModes.ts`, `assistantTypes.ts`, `detectedAgent.ts`, `hub.ts`, `remoteAgentTypes.ts` | Agent mode, assistant, and hub type definitions |
| `channel/` | `channel.ts` | Channel/plugin types (pairing, status, sessions) |
| `codex/` | `codexModels.ts`, `codexModes.ts` | Codex mode and model types |
| `office/` | `conversion.ts`, `preview.ts` | Office document conversion and preview types |
| `platform/` | `acpTypes.ts`, `electron.ts`, `fileSnapshot.ts` | ACP protocol, Electron bridge, file snapshot types |
| `provider/` | `providerApi.ts`, `speech.ts` | Provider CRUD, health check, speech-to-text config |
| `team/` | `database.ts`, `teamTypes.ts` | Team/agent/run/event types |

#### `update/` — Application Update Types

| File | Purpose |
|------|---------|
| `updateTypes.ts` | `UpdateCheckResult`, `UpdateDownloadProgressEvent`, `AutoUpdateStatus`, `GitHubReleaseAsset`. |
| `models/VersionInfo.ts` | Version information model. |

#### `utils/` — Shared Utilities

| File | Purpose |
|------|---------|
| `utils.ts` | `uuid()` (crypto-safe with fallback), `parseError()`, `resolveLocaleKey()`. |
| `index.ts` | Barrel export for uuid, parseError, resolveLocaleKey. |
| `appConfig.ts` | Application configuration helper. |
| `buildAgentConversationParams.ts` | Agent conversation parameter builder. |
| `imageModelAllowlist.ts` | Image generation model allowlist. |
| `modelCapabilities.ts` | Model capability detection. |
| `platformAuthType.ts` | Platform auth type utilities. |
| `platformConstants.ts` | Platform constants. |
| `protocolDetector.ts` | AI provider protocol detection. |
| `urlValidation.ts` | URL validation utilities. |
| `shims/xterm-headless.ts` | Xterm headless shim for non-terminal environments. |

### 3.5 electron/

| File | Purpose |
|------|---------|
| **main.ts** (137 lines) | **Electron main process.** Starts backend server (compiled `flux-backend.exe` or `bun index.ts`), starts static HTTP server serving frontend `dist/`, creates `BrowserWindow` loading `http://localhost:3000`. Handles lifecycle, backend process spawn/kill, MIME types, dev-mode isolation. |
| **preload.ts** (3 lines) | `contextBridge.exposeInMainWorld` exposing `__BACKEND_URL__` (set to `http://localhost:3001`) to renderer. |
| **tsconfig.json** | Electron TypeScript config. |

### 3.6 api/

| File | Purpose |
|------|---------|
| **index.ts** (9 lines) | **Vercel serverless function.** Imports backend Express app, wraps under `/api` prefix, exports serverless handler. |
| **tsconfig.json** | API TypeScript config with path aliases. |

### 3.7 data/

**`skills/`** — Skill definitions for AI agents. Each directory contains a `SKILL.md` with instructions:

| Skill | Description |
|-------|-------------|
| **analyze-bundle** | JS/TS bundle analysis (size, dependencies, chunks) |
| **bun** | Bun runtime knowledge |
| **bun-development** | Bun development workflows and best practices |
| **bun-runtime** | Bun runtime internals and execution model |
| **copilotkit** | **(~40+ files)** Comprehensive CopilotKit integration with plugin marketplace, 8 sub-skills (agui, contribute, debug, develop, integrations, self-update, setup, upgrade), GitHub CI workflows, Claude plugin config, installation scripts |
| **frontend-design** | Frontend UI/UX design guidance |
| **logo-creator** | AI-powered logo creation with Python scripts (crop, remove-bg, vectorize), style references, templates |
| **mcp-builder** | MCP server building (Node.js/Python reference, evaluation scripts) |
| **multi-agent-orchestration** | Multi-agent coordination with Python examples and benchmarking |
| **web-design-guidelines** | Web design standards and guidelines |
| **websocket-engineer** | WebSocket engineering (protocol, patterns, scaling, security) |
| **websocket-implementation** | WebSocket implementation guides (browser, Node/Socket.IO, Python/aiohttp, Redis scaling) |

---

## 4. Project Pipeline

Below is the complete end-to-end data flow of Flux, from user input to response delivery, covering all major subsystems.

### 4.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        USER (Browser / Electron)                          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐      │
│  │                   FRONTEND (React SPA)                          │      │
│  │                                                                │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │      │
│  │  │  Auth    │  │  Chat    │  │ Settings │  │  Peek Panel   │  │      │
│  │  │  Page    │  │  UI      │  │  Modal   │  │  (Preview)    │  │      │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │      │
│  │       │              │             │                │          │      │
│  │  ┌────┴──────────────┴─────────────┴────────────────┴──────┐   │      │
│  │  │              @renderer/hooks/flux/                       │   │      │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐  │   │      │
│  │  │  │useChat │ │useAgent│ │useMcp* │ │useFile*│ │use*  │  │   │      │
│  │  │  │ (SSE)  │ │Session │ │        │ │        │ │Conf.*│  │   │      │
│  │  │  └───┬────┘ │ (WS)   │ └────────┘ └────────┘ └──────┘  │   │      │
│  │  │      │      └───┬────┘                                  │   │      │
│  │  │                 │                                        │   │      │
│  │  │  ┌──────────────┴──────────────────────────────────┐     │   │      │
│  │  │  │           @common/adapter/httpBridge.ts          │     │   │      │
│  │  │  │  (HTTP GET/POST/PUT/DELETE + WebSocket Emitter)  │     │   │      │
│  │  │  └──────────────────────┬──────────────────────────┘     │   │      │
│  │  └─────────────────────────┼────────────────────────────────┘   │      │
│  └────────────────────────────┼────────────────────────────────────┘      │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          │              HTTP REST               WebSocket
          │           (port 3001)              (ws://host/agent)
          │                     │                     │
          ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────┐
│                   BACKEND (Express + Bun)                  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Authentication Layer                     │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │           middleware.ts (JWT Verify)           │    │  │
│  │  │  Supabase JWT → upsert user → req.userId      │    │  │
│  │  └────────────────────┬─────────────────────────┘    │  │
│  └───────────────────────┼──────────────────────────────┘  │
│                          │                                  │
│           ┌──────────────┴──────────────┐                   │
│           ▼                             ▼                   │
│  ┌──────────────────┐      ┌────────────────────┐          │
│  │  REST Router     │      │  WebSocket Handler  │          │
│  │  (index.ts)      │      │  (agent-protocol/   │          │
│  │                  │      │   websocket.ts)     │          │
│  │  POST /flux_ask  │      │                    │          │
│  │  POST /api/*     │      │  /agent endpoint   │          │
│  │  GET /convs/*    │      │  session mgmt      │          │
│  │  GET /memories   │      │  bidirectional     │          │
│  │  GET /tools      │      │  message relay     │          │
│  │  GET /api/models │      └────────┬───────────┘          │
│  │  POST /summarize │               │                      │
│  │  GET /api/tts    │               │                      │
│  └────────┬─────────┘               │                      │
│           │                         │                      │
│           ▼                         ▼                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │              AI Provider Layer                       │    │
│  │                                                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐  │    │
│  │  │ OpenAI   │ │ Anthropic│ │ Google   │ │ NIM  │  │    │
│  │  │ (rotating│ │ (rotating│ │ (rotating│ │(NVIDIA│  │    │
│  │  │  keys)   │ │  keys)   │ │  keys)   │ │  AI) │  │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──┬───┘  │    │
│  │       │             │            │           │      │    │
│  │  ┌────┴─────────────┴────────────┴───────────┴┐     │    │
│  │  │         ClientFactory.ts                     │     │    │
│  │  │  (routes to appropriate provider client)     │     │    │
│  │  └────────────────────┬────────────────────────┘     │    │
│  └───────────────────────┼──────────────────────────────┘    │
│                          │                                  │
│           ┌──────────────┴──────────────┐                   │
│           ▼                             ▼                   │
│  ┌──────────────────┐      ┌────────────────────┐          │
│  │  Orchestrator    │      │   Agent Protocol    │          │
│  │  (workflow)      │      │   (ACP)             │          │
│  │                  │      │                    │          │
│  │  Planner →       │      │  Session State     │          │
│  │  Execution →     │      │  Machine           │          │
│  │  Verification    │      │  Team Orchestration│          │
│  │                  │      │  Message Routing   │          │
│  └────────┬─────────┘      └────────┬───────────┘          │
│           │                         │                      │
│           └──────────┬──────────────┘                      │
│                      ▼                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Tool Execution Layer                    │    │
│  │                                                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐  │    │
│  │  │ web_     │ │ read_    │ │ generate_│ │ shell│  │    │
│  │  │ search   │ │ skill    │ │ document │ │exec. │  │    │
│  │  └──────────┘ └──────────┘ └────┬─────┘ └──────┘  │    │
│  │  ┌──────────┐ ┌──────────┐ ┌───┴────┐ ┌──────┐  │    │
│  │  │ file_*   │ │ get_     │ │ generate│ │check │  │    │
│  │  │ (RW)     │ │ weather  │ │ _image  │ │health│  │    │
│  │  └──────────┘ └──────────┘ └────────┘ └──────┘  │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐       │    │
│  │  │  agent-tools.ts  (PDF, DOCX, PPTX, XLSX) │       │    │
│  │  └──────────────────────────────────────────┘       │    │
│  └────────────────────┬───────────────────────────────┘    │
│                       │                                    │
│           ┌───────────┴───────────┐                        │
│           ▼                       ▼                        │
│  ┌────────────────┐    ┌────────────────────┐              │
│  │  Memory Layer  │    │  Safety Layer      │              │
│  │                │    │                    │              │
│  │  local-embedder│    │  safety.ts         │              │
│  │  retriever.ts  │    │  (Nemotron Content │              │
│  │  (pgvector)    │    │   Safety)          │              │
│  │  memory.ts     │    └────────────────────┘              │
│  │  memory-       │                                        │
│  │  enhanced.ts   │                                        │
│  └───────┬────────┘                                        │
│          │                                                  │
│          ▼                                                  │
│  ┌────────────────┐                                        │
│  │  Database      │                                        │
│  │                │                                        │
│  │  PostgreSQL    │                                        │
│  │  + pgvector    │                                        │
│  │  (Prisma ORM)  │                                        │
│  │                │                                        │
│  │  Tables:       │                                        │
│  │  - User        │                                        │
│  │  - Conversation│                                        │
│  │  - Message     │                                        │
│  │  - Memory      │                                        │
│  └────────────────┘                                        │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Chat Message Flow (SSE Path)

```
User sends message
       │
       ▼
┌─────────────────────┐
│  SendBox/index.tsx   │  (User types + clicks send / presses Enter)
│  - Builds Message    │
│  - Attaches files    │
│  - Handles @refs     │
│  - Handles /commands  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  useChat (hook)      │  (SSE-based chat streaming hook)
│  - Sends POST to     │
│    /flux_ask         │
│  - Manages messages  │
│  - Handles SSE stream│
└──────────┬──────────┘
           │
           ▼
┌───────────────────────┐
│  httpBridge.ts         │  (HTTP POST to backend port 3001)
│  POST /flux_ask        │
│  Body: { messages,     │
│    conversation_id,    │
│    model_config }      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│  backend/index.ts      │  (POST /flux_ask handler)
│                       │
│  1. Auth middleware    │  (JWT verification → req.userId)
│  2. Load conversation  │  (from PostgreSQL via Prisma)
│  3. Build system prompt│  (prompt.ts + loaded skills)
│  4. Retrieve memories  │  (pgvector similarity search)
│  5. Build messages     │  (system + history + user input)
│  6. Call AI model      │  (via ClientFactory → provider)
│  7. Stream SSE response│
└───────────────────────┘
            │
            ▼
     ┌───────────┐
     │  AI Model  │  (OpenAI / Anthropic / Gemini / NIM)
     │  Response  │
     │ stream     │
     └─────┬─────┘
           │
           ▼
┌───────────────────────┐
│  SSE Stream            │
│  Events:               │
│  • text delta          │  (partial text token)
│  • tool_call           │  (AI requests tool execution)
│  • tool_result         │  (tool execution result sent back)
│  • thought             │  (AI reasoning/thinking)
│  • finish              │  (stream complete)
│  • error               │  (stream error)
└───────────────────────┘
           │
           ▼
┌───────────────────────┐
│  useChat hook          │
│  - Parses SSE events   │
│  - Updates message     │
│    list in real-time   │
│  - Triggers tool       │
│    execution if needed │
└───────────────────────┘
           │
           ▼
┌───────────────────────┐
│  MessageList.tsx       │  (renders messages with auto-scroll)
│  MessageItem.tsx       │  (renders individual message)
│  Markdown / Code /     │
│  Mermaid / Media       │
│  renderers             │
└───────────────────────┘
```

### 4.3 Tool Execution Flow

```
AI model returns tool_call
       │
       ▼
┌──────────────────────────┐
│  tool-normalizer.ts       │  (normalizes tool_call to unified format)
│  tool-registry.ts         │  (looks up tool definition)
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Permission required?     │
│  ┌──── YES ────┐ ┌ NO ──┐│
│  ▼              │       ││
│  Permission    │       ││
│  Dialog        │       ││
│  (User approves)│       ││
│  ▼              │       ││
└──┴──────────────┴───────┘│
           │                │
           ▼                │
┌──────────────────────┐    │
│  Tool Dispatcher      │◄───┘
│                       │
│  Routes to handler:   │
│  • web_search → Tavily│
│  • read_skill → file  │
│  • generate_document  │
│    → agent-tools.ts   │
│  • shell_execute →    │
│    child_process      │
│  • file_* → fs        │
│  • get_weather → API  │
│  • generate_image →   │
│    ClientFactory      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  memory-enhanced.ts   │  (injects memory context into tool)
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Result sent back to  │
│  AI model as           │
│  tool_result event     │
└──────────────────────┘
```

### 4.4 Agent Protocol (WebSocket) Flow

```
User connects to Agent
       │
       ▼
┌──────────────────────────┐
│  useAgentSession (hook)  │  (WebSocket connection)
│  ws://host/agent         │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  websocket.ts (backend)  │
│  1. Auth JWT validation  │
│  2. session_start        │
│  3. Create AgentSession  │
│     (state machine)      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  AgentSession State:     │
│                          │
│  idle → connecting →     │
│  warming_up → ready →    │
│  processing →            │
│  awaiting_permission →   │
│  cooldown → error/finished
│                          │
│  Message types:          │
│  • user_message          │
│  • assistant_message     │
│  • tool_call             │
│  • tool_group            │
│  • permission_request    │
│  • permission_response   │
│  • thinking              │
│  • context_usage         │
│  • error                 │
│  • agent_status          │
│  • plan                  │
└──────────────────────────┘
           │
           ▼
┌──────────────────────────┐
│  Team Orchestration       │
│  (team.ts)                │
│                           │
│  Leader analyzes task     │
│  → delegates to teammates │
│  → sequential or parallel │
│  → synthesizes results    │
│  → sends final response   │
└──────────────────────────┘
```

### 4.5 Orchestrator Workflow Flow

```
User query arrives
       │
       ▼
┌──────────────────────┐
│  Planner (planner.ts) │  (regex intent classification)
│                       │
│  Intent detection:    │
│  • Document gen       │  (pdf/docx/pptx/xlsx/csv/md)
│  • Image generation   │  (draw/create/generate image)
│  • Weather query      │  (weather in [city])
│  • Code request       │  (write code / create app)
│  • Analysis           │  (analyze / research / explain)
│  • Computer mode      │  (shell / terminal / file ops)
│  • Simple answer      │  (Q&A, no tools needed)
│                       │
│  Returns ExecutionPlan │
│  (array of Phase)      │
└──────────┬────────────┘
           │
           ▼
┌──────────────────────┐
│  OrchestratorEngine   │  (orchestrator.ts)
│                       │
│  For each Phase:      │
│  1. Execute phase     │
│     (research, load   │
│      skill, gen_doc,  │
│      image, weather,  │
│      analyze, shell,  │
│      filesystem, etc.)│
│  2. Retry on failure  │  (up to 3 attempts)
│  3. Verify result     │  (verifier.ts)
│  4. Compile results   │
└──────────┬────────────┘
           │
           ▼
┌──────────────────────┐
│  Verifier (verifier.ts)│
│                       │
│  Criteria:            │
│  • has_sources        │  (research phases)
│  • min_sources        │  (minimum source count)
│  • has_file           │  (document gen)
│  • has_skill_content  │  (skill loading)
│  • has_text_output    │  (analysis)
│  • semantic_match     │  (LLM-based check)
└──────────┬────────────┘
           │
           ▼
┌──────────────────────┐
│  Final response       │
│  sent to user         │
└──────────────────────┘
```

### 4.6 Electron Desktop Flow

```
User launches app
       │
       ▼
┌──────────────────────┐
│  electron/main.ts     │
│                       │
│  1. Start backend:    │
│     a. Find free port │
│     b. Spawn fluxcore │
│        binary         │
│     c. Health check   │
│        (polling + TCP)│
│     d. Restart on     │
│        crash (max 3)  │
│                       │
│  2. Start static      │
│     server:           │
│     a. Serve          │
│        frontend dist/ │
│     b. Reverse proxy  │
│        /api/* →       │
│        backend        │
│                       │
│  3. Create BrowserWin │
│     Loading           │
│     localhost:3000    │
│                       │
│  4. Handle lifecycle: │
│     - Window close    │
│     - Backend cleanup │
│     - Auto-update     │
└──────────────────────┘
```

### 4.7 Data Flow Diagram (Database)

```
┌──────────────────────┐
│  PostgreSQL            │
│  (via Prisma ORM)     │
│                       │
│  ┌────────────────┐   │
│  │    User         │   │  id, email, name, avatar_url,
│  │                 │   │  created_at, updated_at
│  └────────┬───────┘   │
│           │           │
│           │ 1:N       │
│           ▼           │
│  ┌────────────────┐   │
│  │  Conversation   │   │  id, user_id, title, workspace,
│  │                 │   │  created_at, updated_at
│  └────────┬───────┘   │
│           │           │
│           │ 1:N       │
│           ▼           │
│  ┌────────────────┐   │
│  │   Message       │   │  id, conversation_id, role,
│  │                 │   │  content (JSON), tool_calls,
│  │                 │   │  created_at
│  └────────────────┘   │
│                       │
│  ┌────────────────┐   │
│  │   Memory        │   │  id, user_id, content, metadata,
│  │   (pgvector)    │   │  embedding (vector<1024>),
│  │                 │   │  created_at
│  └────────────────┘   │
│                       │
│  Indexes:             │
│  • user_id on         │
│    Conversation       │
│  • conversation_id on │
│    Message            │
│  • user_id on Memory  │
│  • HNSW index on      │
│    Memory.embedding   │
│    (for vector search)│
└──────────────────────┘
```

### 4.8 Memory & RAG Pipeline

```
User message + conversation history
       │
       ▼
┌──────────────────────────┐
│  1. Extract Memories      │
│  (memory.ts)              │
│  - LLM extracts facts     │
│    from conversation      │
│  - Stores as Memory rows  │
│    with pgvector embedding│
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  2. Retrieve Memories     │
│  (retriever.ts)           │
│  - Embed query with       │
│    local-embedder.ts      │
│    (bge-m3, 1024-dim)     │
│  - HNSW similarity search │
│    (pgvector <=> operator)│
│  - Re-rank with NVIDIA    │
│    Nemoretriever          │
│  - LLM relevance scoring  │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  3. Build Memory Context  │
│  (memory.ts)              │
│  - Format as system       │
│    prompt section         │
│  - Inject into message    │
│    array                  │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  4. Prune Memories        │
│  (memory.ts)              │
│  - Remove junk/duplicates │
│  - Enforce per-user limit │
└──────────────────────────┘
```

### 4.9 Build & Deployment Pipeline

```
┌──────────────────────┐
│  Frontend Build       │
│                       │
│  bun run build        │
│  (build.ts)           │
│                       │
│  1. Clean dist/       │
│  2. Bun.build()       │
│     - Entry: src/**/* │
│       .html           │
│     - Tailwind plugin │
│     - Minification    │
│     - Sourcemaps (link│
│  3. Copy PWA assets   │
│     (manifest, icons, │
│      service worker)  │
│                       │
│  Output: dist/        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Backend Build        │
│                       │
│  bun build backend/   │
│  index.ts --compile   │
│  --outfile=dist-      │
│  electron/backend/    │
│  flux-backend.exe     │
│  --external=@edge-tts │
│  /universal           │
│                       │
│  Output: compiled     │
│  binary (.exe)        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Electron Build       │
│                       │
│  electron-builder     │
│  --win --config       │
│  electron-builder.yml │
│                       │
│  1. Package frontend  │
│     dist/ as asar     │
│  2. Include backend   │
│     binary            │
│  3. Create NSIS       │
│     installer         │
│  4. Sign (optional)   │
│                       │
│  Output: release/     │
│  • Flux Setup 1.0.0   │
│    .exe              │
│  • latest.yml         │
│    (auto-update)      │
└──────────────────────┘
```

### 4.10 Serverless (Vercel) Deployment

```
                  ┌──────────────────────┐
                  │  Vercel               │
                  │                       │
                  │  vercel.json routes    │
                  │  all /api/* → api/    │
                  │  index.ts             │
                  │                       │
                  ▼                       │
          ┌────────────────┐              │
          │  api/index.ts   │              │
          │  (serverless)   │              │
          │                 │              │
          │  import app     │              │
          │  from backend/  │              │
          │  serverless.use │              │
          │  ("/api", app)  │              │
          │  export default │              │
          │  serverless     │              │
          └────────────────┘              │
                  │                       │
                  ▼                       │
          ┌────────────────┐              │
          │  backend/index  │              │
          │  (Express app)  │              │
          │  (same as       │              │
          │   desktop)      │              │
          └────────────────┘              │
└─────────────────────────────────────────┘
```

### 4.11 Cross-Cutting Concerns

```
┌──────────────────────┐
│  Theme System         │
│                       │
│  shared/flux-common   │
│  /theme/              │
│                       │
│  • Theme type:        │
│    light / dark /     │
│    system             │
│  • 200+ CSS custom    │
│    properties per     │
│    theme              │
│  • persist to config  │
│    service            │
│  • OS appearance      │
│    watcher            │
└──────────────────────┘

┌──────────────────────┐
│  i18n / Localization  │
│                       │
│  • i18next            │
│  • Language list in   │
│    i18n-config.json   │
│  • Lazy loading       │
│  • Deep merge with    │
│    fallback           │
└──────────────────────┘

┌──────────────────────┐
│  Platform Abstraction │
│                       │
│  IPlatformServices    │
│  ┌─────────┐ ┌─────┐ │
│  │Electron │ │Node │ │
│  │Impl     │ │Impl │ │
│  └─────────┘ └─────┘ │
│                       │
│  • Paths              │
│  • Processes          │
│  • Power management   │
│  • Notifications      │
│  • Network            │
└──────────────────────┘

┌──────────────────────┐
│  Content Safety       │
│                       │
│  safety.ts            │
│  (NVIDIA Nemotron-3)  │
│                       │
│  • Returns SAFE/      │
│    UNSAFE             │
│  • Applied to tool    │
│    outputs            │
└──────────────────────┘

┌──────────────────────┐
│  Error Handling       │
│                       │
│  AgentProtocol:       │
│  - AgentError (base)  │
│  - AuthError          │
│  - SessionError       │
│  - ToolError          │
│  - TimeoutError       │
│  - ValidationError    │
│                       │
│  HTTP:                │
│  - Express error      │
│    middleware         │
│  - BackendHttpError   │
│    (httpBridge.ts)    │
└──────────────────────┘

┌──────────────────────┐
│  Speech Services      │
│                       │
│  Frontend:            │
│  - pcmRecorder.ts     │
│    (PCM audio capture)│
│  - SpeechStreamClient │
│  - speechStreamPolicy │
│                       │
│  Backend:             │
│  - voice-client.ts    │
│    (STT: Parakeet)    │
│    (TTS: Magpie)      │
│                       │
│  POST /api/tts        │
│  GET /api/tts/voices  │
│  SSE /api/stt/stream  │
└──────────────────────┘
```

---

> *End of FluxMap.md — This document covers the complete project structure, component descriptions, and end-to-end pipeline for all major subsystems.*
