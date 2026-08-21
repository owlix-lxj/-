# MiaoShe Chat 生图与 Copilot 编排子系统

本仓库包含 MiaoShe Chat 的图片生成工作流，以及为该工作流提供编排能力的Copilot 子系统源码。

## 已支持的能力

- 文生图、参考图生图，以及单次 1 至 6 张的批量生成
- 通过对话补齐生成需求，并在真正执行前由用户确认
- 兼容 OpenAI 与 Anthropic 协议的主会话模型和工具调用
- 使用 Codex 进行媒体工作流规划
- 通过 Server-Sent Events（SSE）持续返回生成进度和结果
- 优先将生成素材存入阿里云 OSS，失败时回退至本地存储
- 使用 MySQL 保存素材、上传记录、Copilot 会话、运行记录与工具调用记录

## 调用链路

```text
MiaoShe Chat 页面
  -> Next.js API proxy
  -> NestJS ContentStudioService
  -> 对话模型 / Codex 工作流规划
  -> 图片生成模型 API
  -> OSS 或本地存储 + MySQL
  -> SSE 图片产物与进度事件
```

主会话模型负责理解需求、补充主体、风格、用途、比例与数量等信息，并输出工作流触发标记。用户确认后，服务端启动媒体工作流，逐张调用图片模型并持续向页面返回结果。批量生图上限为 6 张。

## 目录说明

```text
apps/api/src/content-studio/          对话编排、生图执行、SSE、素材持久化
apps/api/src/copilot-core/            Copilot 会话与运行编排
apps/api/src/copilot-session-store/   MySQL 会话、消息、运行和工具调用存储
apps/api/src/copilot-skill-registry/  产品技能定义
apps/api/src/copilot-tool-registry/   产品工具定义
apps/api/src/miaoshechat-adapter/     MiaoShe 产品适配器
apps/api/src/database/                本子系统使用的 MySQL 基础设施
apps/web-next/src/components/miaoshe-chat/  聊天工作区界面
apps/web-next/src/app/api/miaoshe-chat/     Next.js 后端代理路由
```

## 环境配置

运行时从环境变量读取凭证，不能提交真实密钥。

```bash
# 对话模型和 Agent 模型
MIAOSHE_CHAT_API_KEY=
MIAOSHE_CHAT_MODEL=
MIAOSHE_CHAT_BASE_URL=
MIAOSHE_AGENT_MODEL=
CODEX_EXECUTOR_MODEL=

# 图片生成模型
MIAOSHE_IMAGE_API_KEY=
MIAOSHE_IMAGE_MODEL=
MIAOSHE_IMAGE_BASE_URL=

# 可选：阿里云 OSS 素材持久化
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=
OSS_REGION=
OSS_PUBLIC_BASE_URL=
```

## 范围说明

本仓库刻意只包含 MiaoShe Chat 生图功能与其 Codex/Copilot 编排子系统，不包含完整产品。账号认证、品牌管理，以及无关的 IDE Copilot、Codex Gateway 等模块仍保留在主应用仓库中。
