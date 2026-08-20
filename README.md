# MiaoShe Chat Image Generation

MiaoShe Chat 的图片生成工作流与 Codex/Copilot 编排子系统源码。

## Capabilities

- Text-to-image generation, reference-image generation, and batch generation (1-6 images per request)
- Conversation-driven requirement gathering with an explicit Agent confirmation step
- OpenAI- and Anthropic-compatible chat model tool calling
- Codex-backed media workflow planning
- Incremental Server-Sent Events (SSE) updates for generation progress and results
- Generated asset persistence to Alibaba Cloud OSS, with local storage fallback
- MySQL-backed media assets, upload history, Copilot sessions, runs, and tool calls

## Flow

```text
MiaoShe Chat UI
  -> Next.js API proxy
  -> NestJS ContentStudioService
  -> chat model / Codex workflow planning
  -> image generation API
  -> OSS or local storage + MySQL
  -> SSE media artifact updates
```

The conversation model collects requirements and produces a workflow trigger. After the user confirms execution, the server runs the media workflow and calls the image model one image at a time. Batch requests are capped at six images and stream partial results back to the UI.

## Repository Layout

```text
apps/api/src/content-studio/       Chat orchestration, image workflow, SSE, persistence
apps/api/src/copilot-core/         Shared Copilot session and run orchestration
apps/api/src/copilot-session-store/ MySQL session, message, run, and tool-call storage
apps/api/src/copilot-skill-registry/ Product skill definitions
apps/api/src/copilot-tool-registry/ Product tool definitions
apps/api/src/miaoshechat-adapter/  MiaoShe product adapter
apps/api/src/database/             MySQL infrastructure used by the subsystem
apps/web-next/src/components/miaoshe-chat/  Chat workspace UI
apps/web-next/src/app/api/miaoshe-chat/     Next.js backend proxy routes
```

## Configuration

The runtime reads credentials from environment variables. Do not commit real values.

```bash
# Conversation and Agent models
MIAOSHE_CHAT_API_KEY=
MIAOSHE_CHAT_MODEL=
MIAOSHE_CHAT_BASE_URL=
MIAOSHE_AGENT_MODEL=
CODEX_EXECUTOR_MODEL=

# Image generation model
MIAOSHE_IMAGE_API_KEY=
MIAOSHE_IMAGE_MODEL=
MIAOSHE_IMAGE_BASE_URL=

# Optional Alibaba Cloud OSS persistence
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=
OSS_REGION=
OSS_PUBLIC_BASE_URL=
```

## Scope

This repository intentionally contains the MiaoShe image-generation and Codex/Copilot subsystem, not the full product. Host-application modules such as account authentication, brand management, and unrelated IDE Copilot or Codex Gateway features remain in the primary application repository.
