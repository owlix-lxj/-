'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useTheme } from 'next-themes';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ImagePreview } from '@douyinfe/semi-ui-19';
import { marked } from 'marked';
import {
  CalendarClock,
  ArrowRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Download,
  FileText,
  ImageIcon,
  ListTodo,
  LoaderCircle,
  Paperclip,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Video,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toolbar as ContentGenerationToolbar } from '@/app/[locale]/(dashboard)/dashboard/content-management/generation/copied/components/Toolbar';
import {
  createClientMessageId,
  loadArtifact,
  loadGeneratedAssets,
  loadMediaArtifact,
  normalizeArtifactPayload,
  rememberUploadBinding,
  saveArtifact,
  saveGeneratedAssets,
  saveMediaArtifact,
  scopedConversationKey,
  type MiaosheArtifactFormat,
  type MiaosheArtifactPayload,
  type MiaosheGeneratedAsset,
} from '@/lib/miaoshe-artifact-storage';
import { cn } from '@/lib/utils';
import { useBrandStore } from '@/stores/use-brand-store';
import type { ContentOpportunity } from '@/types';
import { toast } from 'sonner';

type ChatMode = 'chat' | 'agent';
type DrawerKey = 'integrations' | 'tasks' | 'assets' | 'scheduledTasks' | null;
type MessageRole = 'user' | 'assistant';
type UploadedAssetKind = 'image' | 'video' | 'file';
type EditorTab = 'edit' | 'preview';

type UploadedAsset = {
  id: string;
  type: UploadedAssetKind;
  url: string;
  thumbnailUrl?: string;
  title: string;
  mimeType: string;
  source?: string;
  size?: number;
  createdAt: number;
};

type ArticleArtifact = MiaosheArtifactPayload & {
  streaming?: boolean;
};

type StoryboardItem = {
  shot?: string;
  duration?: string;
  visual?: string;
  camera?: string;
  subtitle?: string;
  voiceover?: string;
};

type MediaArtifactImage = {
  url?: string;
  b64Json?: string;
  mimeType?: string;
  storage?: unknown;
  createdAt?: number;
};

type MediaArtifactVideo = {
  url?: string;
};

type MediaArtifact = {
  id: string;
  type: string;
  kind: 'image' | 'video';
  intent?: string;
  title: string;
  generationStatus?: string;
  summary?: string;
  prompt?: string;
  error?: string;
  taskId?: string;
  aspectRatio?: string;
  duration?: string;
  style?: string;
  videoModel?: string;
  needsClarification?: boolean;
  confirmationRequired?: boolean;
  clarificationQuestions?: string[];
  storyboard?: StoryboardItem[];
  images: MediaArtifactImage[];
  videos?: MediaArtifactVideo[];
};

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  attachments?: UploadedAsset[];
  clientMessageId?: string;
  articleArtifact?: ArticleArtifact;
  mediaArtifact?: MediaArtifact;
  confirmationRequest?: AgentConfirmationRequest;
};

type AgentConfirmationRequest = {
  id: string;
  title: string;
  description: string;
  confirmLabel: string;
  message: string;
  history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
};

type StoredThread = {
  id: string;
  messages: ChatMessage[];
  updatedAt: number;
  mode?: ChatMode;
  title?: string;
};

type StoredChatState = {
  activeThreadId?: string;
  threads?: StoredThread[];
};

type AssistantResponse = {
  assistantMessage?: {
    id?: string;
    role?: string;
    content?: string;
    timestamp?: number;
    articleArtifact?: unknown;
    mediaArtifact?: unknown;
    confirmationRequest?: unknown;
  };
  message?: string;
};

type CodexRunPhase = 'idle' | 'thinking' | 'completed' | 'failed';

type CodexRunState = {
  phase: CodexRunPhase;
  label: string;
  detail?: string;
  updatedAt: number;
};

type DrawerAction = {
  label: string;
  href: string;
  icon: typeof PlugZap;
  drawer: Exclude<DrawerKey, null>;
};

type IntegrationPlatform = {
  id: string;
  label: string;
  badge: string;
  order: number;
  tone: string;
  status: 'idle' | 'connected';
  statusLabel?: string;
};

type IntegrationGroup = {
  key: string;
  label: string;
  platforms: IntegrationPlatform[];
};

type IntegrationBridgeSession = {
  publicId: string;
  wsUrl: string;
  installUrl: string;
  reachable: boolean;
  connected: boolean;
  status: string;
  error: string;
  connectedAt: string | null;
  lastSeenAt: string | null;
  disconnectedAt: string | null;
};

type CreatorPlatformConnection = {
  id: string;
  platform: string;
  platformLabel: string;
  accountName: string;
  status: string;
  lastSeenAt: string | null;
  lastCrawledAt: string | null;
};

type ExtensionBridgeConfigureResult = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  message?: string;
};

declare global {
  interface Window {
    $poster?: {
      configureBridgeSession: (
        payload: Record<string, unknown>,
        callback?: (result?: ExtensionBridgeConfigureResult) => void,
      ) => void;
    };
    $syncer?: {
      configureBridgeSession: (
        payload: Record<string, unknown>,
        callback?: (result?: ExtensionBridgeConfigureResult) => void,
      ) => void;
    };
  }
}

const STARTER_PROMPTS_ZH = [
  '今天适合发什么内容',
  '帮我排一周的小红书内容',
  '写一篇公众号草稿',
  '做一张小红书封面图',
  '把这篇内容改成小红书风格',
  '做一份本周内容战报',
];

const MODE_OPTIONS_ZH: Array<{
  value: ChatMode;
  label: string;
  description: string;
}> = [
  { value: 'chat', label: 'Chat', description: '适合直接对话、提问和临时安排。' },
  { value: 'agent', label: 'Agent', description: '适合下任务，让它持续推进执行。' },
];

const CHAT_COPY = {
  zh: {
    starterPrompts: STARTER_PROMPTS_ZH,
    drawerActions: [
      { label: '集成', href: '/dashboard/integrations', icon: PlugZap, drawer: 'integrations' },
      { label: '素材', href: '/dashboard/content-management/topics', icon: ImageIcon, drawer: 'assets' },
    ] as DrawerAction[],
    modeOptions: MODE_OPTIONS_ZH,
    conversationTitle: '话题对话',
    newConversation: '新建对话',
    searchConversations: '搜索对话...',
    recent: '最近',
    messages: '条消息',
    noMatches: '暂无匹配对话',
    noHistory: '暂无历史会话',
    headline: '直接说需求，我来帮你推进',
    welcome: [
      '把选题、写稿、配图和发布安排直接交给我。',
      '我可以帮你梳理今天发什么、这周怎么排、哪篇先写、哪条先推。',
      '不管是写公众号、小红书改写、做封面图，还是推进多平台发布，直接说你的目标就行。',
    ],
    startersLabel: '试试这些开场：',
    you: '你',
    switchMode: '切换模式',
    uploading: '上传中',
    attachment: '附件',
    inputPlaceholder: '直接输入你的问题、任务、要推进的内容，或者先上传参考图再让我帮你生图。',
    sending: '发送中...',
    send: '发送',
  },
  en: {
    starterPrompts: [
      'What content should I publish today?',
      'Plan a week of social content for me',
      'Draft a newsletter article',
      'Create a social cover image',
      'Rewrite this for social media',
      'Create this week\'s content report',
    ],
    drawerActions: [
      { label: 'Integrations', href: '/dashboard/integrations', icon: PlugZap, drawer: 'integrations' },
      { label: 'Assets', href: '/dashboard/content-management/topics', icon: ImageIcon, drawer: 'assets' },
    ] as DrawerAction[],
    modeOptions: [
      { value: 'chat' as const, label: 'Chat', description: 'For questions, quick conversations, and one-off planning.' },
      { value: 'agent' as const, label: 'Agent', description: 'Assign a task and let the agent carry it through.' },
    ],
    conversationTitle: 'Conversations',
    newConversation: 'New conversation',
    searchConversations: 'Search conversations...',
    recent: 'Recent',
    messages: 'messages',
    noMatches: 'No matching conversations',
    noHistory: 'No conversation history yet',
    headline: 'Tell me what you need. I will move it forward.',
    welcome: [
      'Hand me your topics, writing, visuals, and publishing plan.',
      'I can help prioritize what to publish today, plan the week, and decide what to write first.',
      'From drafting an article and adapting it for social to creating a cover image or coordinating distribution, just tell me your goal.',
    ],
    startersLabel: 'Try one of these prompts:',
    you: 'You',
    switchMode: 'Switch mode',
    uploading: 'Uploading',
    attachment: 'Attach',
    inputPlaceholder: 'Ask a question, assign a task, or upload a reference image and let me create from it.',
    sending: 'Sending...',
    send: 'Send',
  },
} as const;

const DRAWER_COPY = {
  zh: {
    integrations: '集成',
    assets: '素材',
    tasks: '待办',
    scheduledTasks: '定时任务',
    assetsDescription: '已先并回素材抽屉和上传能力，后续再继续把文章编辑器与素材插入动作整体收回源码。',
    generatedAssets: '已生成素材',
    generatedAssetsDescription: '优先显示当前品牌在 MiaoShe Chat 中生成过的图片和视频结果。',
    refresh: '刷新',
    loading: '加载中...',
    noAssets: '暂时还没有可展示的素材',
    goToContent: '前往内容管理',
    preview: '预览',
  },
  en: {
    integrations: 'Integrations',
    assets: 'Assets',
    tasks: 'Tasks',
    scheduledTasks: 'Scheduled tasks',
    assetsDescription: 'Browse generated assets and upload references for your next request.',
    generatedAssets: 'Generated assets',
    generatedAssetsDescription: 'Images and videos generated in MiaoShe Chat for the current brand appear here first.',
    refresh: 'Refresh',
    loading: 'Loading...',
    noAssets: 'No assets to show yet',
    goToContent: 'Go to content management',
    preview: 'Preview',
  },
} as const;

const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    key: 'content-social',
    label: '内容 & 社交',
    platforms: [
      { id: 'wechat', label: '公众号', badge: '微', order: 1, tone: 'bg-[#15c45b] text-white', status: 'idle' },
      { id: 'zhihu', label: '知乎', badge: '知', order: 2, tone: 'bg-[#1677ff] text-white', status: 'idle' },
      { id: 'weibo', label: '微博', badge: '博', order: 3, tone: 'bg-[#ffb21d] text-white', status: 'idle' },
      { id: 'xiaohongshu', label: '小红书', badge: '红', order: 4, tone: 'bg-[#ff2f4f] text-white', status: 'connected', statusLabel: '已连接' },
      { id: 'toutiao', label: '头条号', badge: '头', order: 5, tone: 'bg-[#ff5030] text-white', status: 'connected', statusLabel: '已连接' },
      { id: 'bilibili', label: 'B站', badge: 'B', order: 6, tone: 'bg-[#2ea7ff] text-white', status: 'idle' },
      { id: 'douban', label: '豆瓣', badge: '豆', order: 7, tone: 'bg-[#27b14a] text-white', status: 'idle' },
      { id: 'x', label: 'X', badge: 'X', order: 8, tone: 'bg-[#111827] text-white', status: 'connected', statusLabel: '已连接' },
      { id: 'douyin', label: '抖音', badge: '抖', order: 9, tone: 'bg-[#111827] text-white', status: 'idle' },
    ],
  },
  {
    key: 'tech-community',
    label: '技术社区',
    platforms: [
      { id: 'juejin', label: '掘金', badge: '掘', order: 1, tone: 'bg-[#1e80ff] text-white', status: 'idle' },
      { id: 'csdn', label: 'CSDN', badge: 'C', order: 2, tone: 'bg-[#e65a2f] text-white', status: 'idle' },
      { id: 'jianshu', label: '简书', badge: '简', order: 3, tone: 'bg-[#ff6b3d] text-white', status: 'idle' },
      { id: 'segmentfault', label: '思否', badge: 'sf', order: 4, tone: 'bg-[#22a45d] text-white', status: 'idle' },
      { id: 'cnblogs', label: '博客园', badge: '博', order: 5, tone: 'bg-[#4b83d0] text-white', status: 'idle' },
      { id: '51cto', label: '51CTO', badge: '51', order: 6, tone: 'bg-[#f05d40] text-white', status: 'idle' },
      { id: 'oschina', label: '开源中国', badge: '开', order: 7, tone: 'bg-[#53c46a] text-white', status: 'idle' },
      { id: 'yuque', label: '语雀', badge: '语', order: 8, tone: 'bg-[#7abf43] text-white', status: 'idle' },
      { id: 'imooc', label: '慕课网', badge: '慕', order: 9, tone: 'bg-[#e4423c] text-white', status: 'idle' },
    ],
  },
  {
    key: 'news-vertical',
    label: '资讯 & 垂直',
    platforms: [
      { id: 'baijiahao', label: '百家号', badge: '百', order: 1, tone: 'bg-[#3a6df0] text-white', status: 'idle' },
      { id: 'dayuhao', label: '大鱼号', badge: '鱼', order: 2, tone: 'bg-[#ff9f1c] text-white', status: 'idle' },
      { id: 'wangyihao', label: '网易号', badge: '网', order: 3, tone: 'bg-[#df2f34] text-white', status: 'idle' },
      { id: 'yidian', label: '一点号', badge: '1', order: 4, tone: 'bg-[#ff3b30] text-white', status: 'idle' },
      { id: 'sohuhao', label: '搜狐号', badge: '狐', order: 5, tone: 'bg-[#f5a623] text-slate-900', status: 'idle' },
      { id: 'sohujiaodian', label: '搜狐焦点', badge: '焦', order: 6, tone: 'bg-[#ff5a36] text-white', status: 'idle' },
      { id: 'xueqiu', label: '雪球', badge: '雪', order: 7, tone: 'bg-[#4d7cff] text-white', status: 'idle' },
      { id: 'pm', label: '产品经理', badge: '产', order: 8, tone: 'bg-[#4b83d0] text-white', status: 'idle' },
      { id: 'eastmoney', label: '东方财富', badge: '财', order: 9, tone: 'bg-[#ff7a00] text-white', status: 'idle' },
      { id: 'smzdm', label: '什么值得买', badge: '值', order: 10, tone: 'bg-[#e64037] text-white', status: 'idle' },
    ],
  },
];

const DEFAULT_THREAD_ID = 'default';
const MIAOSHE_CLIENT_HISTORY_TOKEN_BUDGET = 960_000;

function historyStorageKey(brandId: string) {
  return `miaoshe-chat:${brandId}`;
}

function createMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createThreadId() {
  return `thread_${createMessageId()}`;
}

function estimateMiaosheTokenCount(value: string) {
  let total = 0;

  for (const char of String(value || '')) {
    if (char === '\n') {
      total += 0.2;
      continue;
    }
    if (/\s/.test(char)) {
      total += 0.1;
      continue;
    }
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
      total += 1;
      continue;
    }
    total += char.charCodeAt(0) <= 0x7f ? 0.25 : 0.7;
  }

  return Math.max(1, Math.ceil(total));
}

function selectHistoryMessagesForContext(
  items: ChatMessage[],
  tokenBudget = MIAOSHE_CLIENT_HISTORY_TOKEN_BUDGET,
) {
  const normalized = items
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }))
    .filter((item) => item.content);

  if (!normalized.length) {
    return [] as Array<{ role: MessageRole; content: string }>;
  }

  const selected: Array<{ role: MessageRole; content: string }> = [];
  let usedTokens = 0;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const candidate = normalized[index];
    const candidateTokens = estimateMiaosheTokenCount(candidate.content) + 8;
    if (selected.length > 0 && usedTokens + candidateTokens > tokenBudget) {
      break;
    }
    selected.unshift(candidate);
    usedTokens += candidateTokens;
  }

  return selected;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function resolveUploadedAssetUrl(url?: string) {
  const value = String(url || '').trim();
  if (!value) {
    return '';
  }
  if (/^(?:https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  if (value.startsWith('/uploads/')) {
    return `/api/backend${value}`;
  }
  return value;
}

function normalizeUploadedAsset(asset: unknown): UploadedAsset | null {
  const candidate = asset as
    | {
        id?: string;
        url?: string;
        assetUrl?: string;
        type?: string;
        assetType?: string;
        thumbnailUrl?: string;
        thumbnail_url?: string;
        title?: string;
        mimeType?: string;
        mime_type?: string;
        source?: string;
        size?: number;
        metadata?: { size?: number };
        createdAt?: number | string;
        created_at?: number | string;
      }
    | null;

  const url = String(candidate?.url || candidate?.assetUrl || '').trim();
  if (!url) {
    return null;
  }

  const rawType = String(candidate?.type || candidate?.assetType || '').trim().toLowerCase();
  const type: UploadedAssetKind =
    rawType === 'file' ? 'file' : rawType === 'video' ? 'video' : 'image';

  return {
    id: String(candidate?.id || url),
    type,
    url,
    thumbnailUrl: String(
      candidate?.thumbnailUrl || candidate?.thumbnail_url || (type === 'image' ? url : ''),
    ).trim(),
    title: String(
      candidate?.title || (type === 'file' ? '上传文件' : type === 'video' ? '上传视频' : '上传图片'),
    ).trim(),
    mimeType: String(
      candidate?.mimeType ||
        candidate?.mime_type ||
        (type === 'file'
          ? 'application/octet-stream'
          : type === 'video'
            ? 'video/mp4'
            : 'image/png'),
    ).trim(),
    source: String(candidate?.source || '').trim() || undefined,
    size:
      typeof candidate?.size === 'number'
        ? candidate.size
        : typeof candidate?.metadata?.size === 'number'
          ? candidate.metadata.size
          : undefined,
    createdAt: normalizeTimestamp(candidate?.createdAt || candidate?.created_at),
  };
}

function applyThreadModeToMessages(messages: ChatMessage[], mode: ChatMode) {
  if (mode === 'agent') {
    return messages;
  }

  return messages.map((item) =>
    item.role === 'assistant' && item.articleArtifact ? { ...item, articleArtifact: undefined } : item,
  );
}

function normalizeStoredThread(thread: StoredThread | null | undefined): StoredThread | null {
  if (!thread?.id || typeof thread.id !== 'string' || !thread.id.trim()) {
    return null;
  }

  const mode = thread.mode === 'agent' ? 'agent' : 'chat';
  const messages = Array.isArray(thread.messages)
    ? thread.messages.map(normalizeStoredMessage).filter((value): value is ChatMessage => !!value)
    : [];

  return {
    id: thread.id,
    messages,
    updatedAt: normalizeTimestamp(thread.updatedAt),
    mode,
    title: typeof thread.title === 'string' && thread.title.trim() ? thread.title.trim() : undefined,
  };
}

function upsertStoredThread(threads: StoredThread[], nextThread: StoredThread) {
  const existing = threads.find((item) => item.id === nextThread.id);
  const mergedThread: StoredThread = {
    ...existing,
    ...nextThread,
    title:
      typeof nextThread.title === 'string'
        ? nextThread.title.trim() || undefined
        : existing?.title?.trim() || undefined,
  };
  const rest = threads.filter((item) => item.id !== nextThread.id);
  return [mergedThread, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
}

function truncateThreadTitle(value: string, maxLength = 18) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function deriveThreadFallbackText(thread: StoredThread) {
  const firstUserMessage = thread.messages.find((item) => item.role === 'user' && item.content.trim());
  const latestMessage = [...thread.messages]
    .reverse()
    .find((item) => item.content.trim() || item.articleArtifact?.title?.trim());

  return (
    firstUserMessage?.content.trim() ||
    latestMessage?.articleArtifact?.title?.trim() ||
    latestMessage?.content.trim() ||
    '新对话'
  );
}

function summarizeThread(thread: StoredThread) {
  const fullText = thread.title?.trim() || deriveThreadFallbackText(thread);

  return {
    id: thread.id,
    title: truncateThreadTitle(fullText),
    fullText,
    count: thread.messages.length,
    updatedAt: thread.updatedAt,
  };
}

function normalizeGeneratedAsset(asset: unknown): UploadedAsset | null {
  const normalized = normalizeUploadedAsset(asset);
  if (!normalized || normalized.source === '用户上传') {
    return null;
  }
  return normalized;
}

function normalizeArticleArtifact(artifact: unknown): ArticleArtifact | null {
  const normalized = normalizeArtifactPayload(artifact);
  if (!normalized.title && !normalized.markdown) {
    return null;
  }
  const html = renderArticleRichHtml(normalized.markdown, normalized.format);
  return {
    title: normalized.title,
    markdown: html,
    format: 'html',
  };
}

function normalizeConfirmationRequest(value: unknown): AgentConfirmationRequest | null {
  const candidate = value as
    | {
        id?: string;
        title?: string;
        description?: string;
        confirmLabel?: string;
        message?: string;
        history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
      }
    | null;

  const message = String(candidate?.message || '').trim();
  if (!message) {
    return null;
  }

  return {
    id: String(candidate?.id || createMessageId()),
    title: String(candidate?.title || '切换到 Agent 并执行').trim(),
    description: String(
      candidate?.description || '当前任务需要切换到 Agent 模式后再继续执行。',
    ).trim(),
    confirmLabel: String(candidate?.confirmLabel || '切换到 Agent 并执行').trim(),
    message,
    history: Array.isArray(candidate?.history)
      ? candidate.history
          .map((item) => ({
            role: item?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: String(item?.content || '').trim(),
          }))
          .filter((item) => item.content)
      : undefined,
  };
}

function looksLikeWorkflowMessage(content: string) {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    return false;
  }

  return /当前进度[:：]|识别任务目标|检查平台登录状态|等待文章内容|等待目标平台|等待切换到 Agent|切换到 Agent|媒体发布任务|平台数据任务|桥接状态|执行单|创建平台草稿|抓取平台数据|请立即处理这篇文章的发布任务|目标平台：|发布时间：|立即发布|登录状态|可发布性/.test(
    normalizedContent,
  );
}

function looksLikeAssistantIntroMessage(content: string) {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    return false;
  }

  return (
    /(你好|您好|hello|hi)[!！，,\s]/i.test(normalizedContent) &&
    /(我是\s*\*{0,2}MiaoShe Chat\*{0,2}|妙设AIO\s*的内容运营助手|有什么我可以帮你的|品牌洞察|内容创作|平台分发|AIGEO\s*策略)/i.test(
      normalizedContent,
    )
  );
}

function shouldIncludeMessageInThreadTitleHistory(message: ChatMessage) {
  const normalizedContent = String(message.content || '').trim();
  if (!normalizedContent) {
    return Boolean(message.articleArtifact?.title?.trim());
  }

  if (looksLikeWorkflowMessage(normalizedContent) || looksLikeAssistantIntroMessage(normalizedContent)) {
    return false;
  }

  return true;
}

function shouldGenerateAiThreadTitle(thread: StoredThread) {
  if (thread.title?.trim()) {
    return false;
  }

  const titleMessages = thread.messages.filter(shouldIncludeMessageInThreadTitleHistory);
  const hasUserMessage = titleMessages.some((item) => item.role === 'user');
  const hasAssistantMessage = titleMessages.some(
    (item) => item.role === 'assistant' && (item.content.trim() || item.articleArtifact?.title?.trim()),
  );

  return hasUserMessage && hasAssistantMessage;
}

function buildThreadTitleRequestPayload(thread: StoredThread) {
  const history = thread.messages
    .filter(shouldIncludeMessageInThreadTitleHistory)
    .slice(-12)
    .map((item) => ({
      role: item.role,
      content: item.content.trim() || item.articleArtifact?.title?.trim() || '',
    }))
    .filter((item) => item.content);
  const latestArticleArtifact = [...thread.messages]
    .reverse()
    .map((item) => item.articleArtifact)
    .find((artifact) => artifact?.title?.trim() || artifact?.markdown?.trim());

  return {
    mode: thread.mode === 'agent' ? 'agent' : 'chat',
    history,
    latestArticleArtifact: latestArticleArtifact
      ? {
          title: latestArticleArtifact.title,
          markdown: latestArticleArtifact.markdown.slice(0, 600),
          format: latestArticleArtifact.format,
        }
      : undefined,
  };
}

function shouldShowArticleArtifact(content: string) {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    return false;
  }

  if (looksLikeWorkflowMessage(normalizedContent) || looksLikeAssistantIntroMessage(normalizedContent)) {
    return false;
  }

  return true;
}

function normalizeMediaArtifact(artifact: unknown): MediaArtifact | null {
  const candidate = artifact as
    | {
        id?: string;
        type?: string;
        kind?: string;
        intent?: string;
        title?: string;
        generationStatus?: string;
        summary?: string;
        prompt?: string;
        error?: string;
        taskId?: string;
        aspectRatio?: string;
        duration?: string;
        style?: string;
        videoModel?: string;
        needsClarification?: boolean;
        confirmationRequired?: boolean;
        clarificationQuestions?: unknown[];
        storyboard?: unknown[];
        images?: unknown[];
        videos?: unknown[];
      }
    | null;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const intent = typeof candidate.intent === 'string' ? candidate.intent : undefined;
  if (intent === 'video_storyboard') {
    return null;
  }

  const kind = candidate.kind === 'video' ? 'video' : 'image';
  const images = (
    Array.isArray(candidate.images)
      ? candidate.images
          .map((image) => {
            const item = image as
              | {
                  url?: string;
                  b64Json?: string;
                  mimeType?: string;
                  storage?: unknown;
                  createdAt?: number;
                }
              | null;
            const hasRenderable = Boolean(item?.url || item?.b64Json);
            if (!hasRenderable) {
              return null;
            }
            return {
              url: typeof item?.url === 'string' ? item.url : undefined,
              b64Json: typeof item?.b64Json === 'string' ? item.b64Json : undefined,
              mimeType: typeof item?.mimeType === 'string' ? item.mimeType : undefined,
              storage: item?.storage,
              createdAt: typeof item?.createdAt === 'number' ? item.createdAt : undefined,
            } satisfies MediaArtifactImage;
          })
          .filter(Boolean)
      : []
  ) as MediaArtifactImage[];
  const videos = (
    Array.isArray(candidate.videos)
      ? candidate.videos
          .map((video) => {
            const item = video as { url?: string } | null;
            if (typeof item?.url !== 'string' || !item.url.trim()) {
              return null;
            }
            return { url: item.url } satisfies MediaArtifactVideo;
          })
          .filter(Boolean)
      : []
  ) as MediaArtifactVideo[];

  const generationStatus =
    typeof candidate.generationStatus === 'string' ? candidate.generationStatus : undefined;
  const shouldRetainArtifact =
    (kind === 'video' &&
      (videos.length > 0 ||
        generationStatus === 'generating' ||
        generationStatus === 'processing' ||
        generationStatus === 'completed' ||
        generationStatus === 'failed')) ||
    images.length > 0 ||
    videos.length > 0 ||
    generationStatus === 'generating' ||
    generationStatus === 'processing' ||
    generationStatus === 'failed';

  if (!shouldRetainArtifact) {
    return null;
  }

  return {
    id: String(candidate.id || createMessageId()),
    type: String(candidate.type || 'media_generation'),
    kind,
    intent,
    title: String(candidate.title || '').trim() || (kind === 'video' ? '视频生成结果' : '图片生成结果'),
    generationStatus,
    summary: typeof candidate.summary === 'string' ? candidate.summary : undefined,
    prompt: typeof candidate.prompt === 'string' ? candidate.prompt : undefined,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
    taskId: typeof candidate.taskId === 'string' ? candidate.taskId : undefined,
    aspectRatio: typeof candidate.aspectRatio === 'string' ? candidate.aspectRatio : undefined,
    duration: typeof candidate.duration === 'string' ? candidate.duration : undefined,
    style: typeof candidate.style === 'string' ? candidate.style : undefined,
    videoModel: typeof candidate.videoModel === 'string' ? candidate.videoModel : undefined,
    needsClarification: Boolean(candidate.needsClarification),
    confirmationRequired: Boolean(candidate.confirmationRequired),
    clarificationQuestions: Array.isArray(candidate.clarificationQuestions)
      ? candidate.clarificationQuestions.map((item) => String(item || '').trim()).filter(Boolean)
      : undefined,
    storyboard: Array.isArray(candidate.storyboard)
      ? candidate.storyboard.map((item) => {
          const row = item as StoryboardItem | null;
          return {
            shot: row?.shot,
            duration: row?.duration,
            visual: row?.visual,
            camera: row?.camera,
            subtitle: row?.subtitle,
            voiceover: row?.voiceover,
          };
        })
      : undefined,
    images,
    videos,
  };
}

function normalizeStoredMessage(item: unknown): ChatMessage | null {
  const candidate = item as
    | {
        id?: string;
        role?: string;
        content?: string;
        timestamp?: number | string;
        attachments?: unknown[];
        clientMessageId?: string;
        articleArtifact?: unknown;
        mediaArtifact?: unknown;
        confirmationRequest?: unknown;
      }
    | null;

  const content = String(candidate?.content || '');
  const attachments = Array.isArray(candidate?.attachments)
    ? candidate.attachments.map(normalizeUploadedAsset).filter((value): value is UploadedAsset => !!value)
    : [];
  const suppressArticleArtifact = candidate?.role === 'assistant' && !shouldShowArticleArtifact(content);
  const normalizedArtifact = suppressArticleArtifact ? null : normalizeArticleArtifact(candidate?.articleArtifact);
  const articleArtifact = normalizedArtifact;
  const rawMediaArtifact = normalizeMediaArtifact(candidate?.mediaArtifact);
  const mediaArtifact = rawMediaArtifact?.kind === 'video' ? rawMediaArtifact : undefined;
  const mergedAttachments =
    rawMediaArtifact?.kind === 'image'
      ? mergeGeneratedAssets(attachments, assetsFromMediaArtifact(rawMediaArtifact))
      : attachments;
  const confirmationRequest = normalizeConfirmationRequest(candidate?.confirmationRequest);

  if (
    !content.trim() &&
    mergedAttachments.length === 0 &&
    !articleArtifact &&
    !mediaArtifact &&
    !confirmationRequest
  ) {
    return null;
  }

  return {
    id: typeof candidate?.id === 'string' && candidate.id.trim() ? candidate.id : createMessageId(),
    role: candidate?.role === 'assistant' ? 'assistant' : 'user',
    content,
    timestamp: normalizeTimestamp(candidate?.timestamp),
    attachments: mergedAttachments,
    clientMessageId:
      typeof candidate?.clientMessageId === 'string' && candidate.clientMessageId.trim()
        ? candidate.clientMessageId
        : undefined,
    articleArtifact: articleArtifact || undefined,
    mediaArtifact: mediaArtifact || undefined,
    confirmationRequest: confirmationRequest || undefined,
  };
}

function normalizeHistory(raw: string | null): {
  messages: ChatMessage[];
  mode: ChatMode;
  activeThreadId: string;
  threads: StoredThread[];
} {
  const fallback = {
    messages: [] as ChatMessage[],
    mode: 'chat' as ChatMode,
    activeThreadId: DEFAULT_THREAD_ID,
    threads: [] as StoredThread[],
  };

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as StoredChatState | ChatMessage[] | null;
    if (Array.isArray(parsed)) {
      const messages = parsed.map(normalizeStoredMessage).filter((value): value is ChatMessage => !!value);
      const thread: StoredThread = {
        id: DEFAULT_THREAD_ID,
        messages,
        updatedAt: Date.now(),
        mode: 'chat',
      };
      return {
        messages,
        mode: 'chat' as ChatMode,
        activeThreadId: DEFAULT_THREAD_ID,
        threads: messages.length > 0 ? [thread] : [],
      };
    }

    const threads = Array.isArray(parsed?.threads)
      ? parsed.threads.map(normalizeStoredThread).filter((value): value is StoredThread => !!value)
      : [];
    const activeThreadId =
      typeof parsed?.activeThreadId === 'string' && parsed.activeThreadId.trim()
        ? parsed.activeThreadId
        : DEFAULT_THREAD_ID;
    const activeThread =
      threads.find((item) => item?.id === activeThreadId) ||
      threads.find((item) => item?.id === DEFAULT_THREAD_ID) ||
      threads[0];

    const messages = Array.isArray(activeThread?.messages) ? activeThread.messages : [];
    const mode = activeThread?.mode === 'agent' ? 'agent' : 'chat';

    return {
      messages: applyThreadModeToMessages(messages, mode),
      mode,
      activeThreadId: activeThread?.id || activeThreadId,
      threads,
    };
  } catch (loadError) {
    console.error('Failed to restore Miaoshe chat history', loadError);
    return fallback;
  }
}

function serializeHistory(threads: StoredThread[], activeThreadId: string): StoredChatState {
  return {
    activeThreadId,
    threads,
  };
}

function formatTimestamp(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function formatConversationListTimestamp(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= 0) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hour}:${minute}`;
}

function formatFileSize(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return '';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtensionLabel(name: string) {
  const ext = String(name || '')
    .split('.')
    .pop()
    ?.trim()
    .slice(0, 4)
    .toUpperCase();
  return ext || 'FILE';
}

function takeTypingChars(value: string, count: number) {
  return Array.from(value).slice(0, count).join('');
}

function dropTypingChars(value: string, count: number) {
  return Array.from(value).slice(count).join('');
}

function stripArticleMarkup(value: string, format?: MiaosheArtifactFormat) {
  const content = String(value || '');
  if ((format || inferArtifactFormat(content)) === 'html') {
    return content
      .replace(/<(br|\/p|\/div|\/section|\/article|\/li|\/h[1-6]|\/blockquote|\/tr)\s*>/gi, '\n')
      .replace(/<\/(ul|ol|table|thead|tbody)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"');
  }
  return content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1');
}

function inferArtifactFormat(value: string): MiaosheArtifactFormat {
  return /<\/?(article|section|h1|h2|h3|h4|h5|h6|p|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|strong|em|a|img|figure|figcaption)(\s|>)/i.test(
    String(value || '').trim(),
  )
    ? 'html'
    : 'markdown';
}

function countArtifactStats(artifact: ArticleArtifact) {
  const rawText = stripArticleMarkup(artifact.markdown, artifact.format);
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  const cnChars = normalizedText.match(/[\u4e00-\u9fa5]/g) || [];
  const words = normalizedText
    .replace(/[\u4e00-\u9fa5]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return {
    words: cnChars.length + words,
    lines: rawText ? rawText.split('\n').filter((line) => line.trim()).length : 0,
  };
}

function plainPreview(artifact: ArticleArtifact) {
  return stripArticleMarkup(artifact.markdown, artifact.format)
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 260);
}

function mergeGeneratedAssets(
  localItems: MiaosheGeneratedAsset[],
  remoteItems: UploadedAsset[],
) {
  const merged = new Map<string, UploadedAsset>();

  for (const item of localItems.map(normalizeGeneratedAsset)) {
    if (item && !merged.has(item.url)) {
      merged.set(item.url, item);
    }
  }

  for (const item of remoteItems) {
    if (!merged.has(item.url)) {
      merged.set(item.url, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function integrationPlatformIconSrc(platformId: string) {
  const iconMap: Record<string, string> = {
    wechat: '/integrations/platforms/wechat_official_account.png',
    zhihu: '/integrations/platforms/zhihu.png',
    weibo: '/integrations/platforms/weibo.png',
    xiaohongshu: '/integrations/platforms/xiaohongshu.png',
    toutiao: '/integrations/platforms/toutiao.png',
    bilibili: '/integrations/platforms/bilibili.png',
    douban: '/integrations/platforms/douban.png',
    x: '/integrations/platforms/x.png',
    douyin: '/integrations/platforms/douyin.png',
    juejin: '/integrations/platforms/juejin.png',
    csdn: '/integrations/platforms/csdn.png',
    jianshu: '/integrations/platforms/jianshu.png',
    segmentfault: '/integrations/platforms/segmentfault.png',
    cnblogs: '/integrations/platforms/cnblogs.png',
    '51cto': '/integrations/platforms/51cto.png',
    oschina: '/integrations/platforms/oschina.png',
    yuque: '/integrations/platforms/yuque.svg',
    imooc: '/integrations/platforms/imooc.png',
    baijiahao: '/integrations/platforms/baijiahao.png',
    dayuhao: '/integrations/platforms/dayu.png',
    wangyihao: '/integrations/platforms/netease.png',
    yidian: '/integrations/platforms/yidian.png',
    sohuhao: '/integrations/platforms/sohu.png',
    sohujiaodian: '/integrations/platforms/sohufocus.png',
    xueqiu: '/integrations/platforms/xueqiu.png',
    pm: '/integrations/platforms/woshipm.png',
    eastmoney: '/integrations/platforms/eastmoney.png',
    smzdm: '/integrations/platforms/smzdm.svg',
  };

  return iconMap[platformId] || '';
}

function integrationPlatformLoginUrl(platformId: string) {
  const loginMap: Record<string, string> = {
    wechat: 'https://mp.weixin.qq.com/',
    zhihu: 'https://www.zhihu.com/signin?next=%2Fcreator',
    weibo: 'https://weibo.com/login.php',
    xiaohongshu: 'https://creator.xiaohongshu.com/',
    toutiao: 'https://mp.toutiao.com/',
    bilibili: 'https://member.bilibili.com/platform/home',
    douban: 'https://www.douban.com/',
    x: 'https://x.com/login',
    douyin: 'https://creator.douyin.com/',
    juejin: 'https://juejin.cn/',
    csdn: 'https://mp.csdn.net/',
    jianshu: 'https://www.jianshu.com/sign_in',
    segmentfault: 'https://segmentfault.com/',
    cnblogs: 'https://i.cnblogs.com/',
    '51cto': 'https://blog.51cto.com/',
    oschina: 'https://my.oschina.net/',
    yuque: 'https://www.yuque.com/login',
    imooc: 'https://www.imooc.com/',
    baijiahao: 'https://baijiahao.baidu.com/',
    dayuhao: 'https://mp.dayu.com/',
    wangyihao: 'https://mp.163.com/',
    yidian: 'https://mp.yidianzixun.com/',
    sohuhao: 'https://mp.sohu.com/',
    sohujiaodian: 'https://mp.sohu.com/',
    xueqiu: 'https://xueqiu.com/',
    pm: 'https://www.woshipm.com/',
    eastmoney: 'https://mp.eastmoney.com/',
    smzdm: 'https://post.smzdm.com/',
  };

  return loginMap[normalizeIntegrationPlatformKey(platformId)] || '';
}

function normalizeIntegrationPlatformKey(platformId: string) {
  const normalized = String(platformId || '')
    .trim()
    .toLowerCase();
  const aliasMap: Record<string, string> = {
    wechat: 'wechat',
    wechat_official_account: 'wechat',
    mpwechat: 'wechat',
    weixin: 'wechat',
    zhihu: 'zhihu',
    weibo: 'weibo',
    xiaohongshu: 'xiaohongshu',
    xhs: 'xiaohongshu',
    toutiao: 'toutiao',
    douyin: 'douyin',
    bilibili: 'bilibili',
    douban: 'douban',
    x: 'x',
    twitter: 'x',
    juejin: 'juejin',
    csdn: 'csdn',
    jianshu: 'jianshu',
    segmentfault: 'segmentfault',
    cnblogs: 'cnblogs',
    '51cto': '51cto',
    oschina: 'oschina',
    yuque: 'yuque',
    imooc: 'imooc',
    baijiahao: 'baijiahao',
    dayuhao: 'dayuhao',
    wangyihao: 'wangyihao',
    yidian: 'yidian',
    sohuhao: 'sohuhao',
    sohujiaodian: 'sohujiaodian',
    xueqiu: 'xueqiu',
    pm: 'pm',
    eastmoney: 'eastmoney',
    smzdm: 'smzdm',
  };

  return aliasMap[normalized] || normalized;
}

function normalizeIntegrationBridgeSession(value: unknown): IntegrationBridgeSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const publicId = String(record.publicId || record.id || '').trim();
  const wsUrl = String(record.wsUrl || '').trim();
  if (!publicId && !wsUrl) {
    return null;
  }

  return {
    publicId,
    wsUrl,
    installUrl: String(record.installUrl || '').trim(),
    reachable: Boolean(record.reachable),
    connected: Boolean(record.connected),
    status: String(record.status || '').trim(),
    error: String(record.error || '').trim(),
    connectedAt: typeof record.connectedAt === 'string' ? record.connectedAt : null,
    lastSeenAt: typeof record.lastSeenAt === 'string' ? record.lastSeenAt : null,
    disconnectedAt: typeof record.disconnectedAt === 'string' ? record.disconnectedAt : null,
  };
}

function normalizeCreatorPlatformConnection(value: unknown): CreatorPlatformConnection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = String(record.id || '').trim();
  const platform = normalizeIntegrationPlatformKey(String(record.platform || ''));
  if (!id || !platform) {
    return null;
  }

  return {
    id,
    platform,
    platformLabel: String(record.platformLabel || record.platform || '').trim() || platform,
    accountName: String(record.accountName || record.platformLabel || record.platform || '').trim() || platform,
    status: String(record.status || '').trim(),
    lastSeenAt: typeof record.lastSeenAt === 'string' ? record.lastSeenAt : null,
    lastCrawledAt: typeof record.lastCrawledAt === 'string' ? record.lastCrawledAt : null,
  };
}

function mediaKindLabel(artifact: MediaArtifact) {
  return artifact.kind === 'video' ? '视频' : '图片';
}

function mediaIntentLabel(artifact: MediaArtifact) {
  if (artifact.intent === 'video_generate') return '生成';
  if (artifact.intent === 'media_edit') return '编辑';
  return '生成';
}

function mediaArtifactTitle(artifact: MediaArtifact) {
  const rawTitle = String(artifact.title || '').trim();
  if (artifact.kind === 'image' && (!rawTitle || /图片生成执行单|图片执行单/.test(rawTitle))) {
    return '图片生成需求';
  }
  if (artifact.kind === 'video' && (!rawTitle || /视频分镜执行单|视频生成执行单|视频执行单/.test(rawTitle))) {
    return '视频生成结果';
  }
  return rawTitle || `${mediaKindLabel(artifact)}结果`;
}

function mediaArtifactStatusText(artifact: MediaArtifact) {
  if (artifact.kind === 'image') {
    return `已整理好${mediaKindLabel(artifact)}生成需求`;
  }
  if (artifact.generationStatus === 'failed') {
    return '视频生成失败';
  }
  if (artifact.generationStatus === 'generating' || artifact.generationStatus === 'processing') {
    return '视频生成中';
  }
  if ((artifact.videos?.length || 0) > 0) {
    return `已生成 ${artifact.videos?.length || 0} 个视频`;
  }
  return '视频结果已准备好';
}

function mediaImageItems(artifact: MediaArtifact) {
  return artifact.images
    .map((image, index) => {
      const src = image.url
        ? image.url
        : image.b64Json
          ? `data:${image.mimeType || 'image/png'};base64,${image.b64Json}`
          : '';
      return src ? { src, index } : null;
    })
    .filter((value): value is { src: string; index: number } => !!value);
}

function mediaVideoSrc(artifact: MediaArtifact) {
  return artifact.videos?.[0]?.url || '';
}

const videoArtifactFrameStyle: CSSProperties = {
  borderRadius: '28px',
  overflow: 'hidden',
  clipPath: 'inset(0 round 28px)',
  WebkitMaskImage: '-webkit-radial-gradient(white, black)',
  transform: 'translateZ(0)',
};

function VideoArtifactPlayer({ artifact }: { artifact: MediaArtifact }) {
  const videoSrc = mediaVideoSrc(artifact);
  if (!videoSrc) {
    return null;
  }

  return (
    <div className="mt-3 flex w-full justify-center">
      <div
        className="w-full max-w-[320px] rounded-[28px] bg-black md:max-w-[360px]"
        style={videoArtifactFrameStyle}
      >
        <div
          className="flex h-[380px] items-center justify-center rounded-[28px] bg-black md:h-[420px]"
          style={videoArtifactFrameStyle}
        >
          <video
            src={videoSrc}
            controls
            playsInline
            preload="metadata"
            className="block h-full w-full rounded-[28px] bg-black object-contain"
            style={videoArtifactFrameStyle}
          />
        </div>
      </div>
    </div>
  );
}

function assetsFromMediaArtifact(artifact: MediaArtifact): UploadedAsset[] {
  if (artifact.kind !== 'image') {
    return [];
  }

  return mediaImageItems(artifact).map((item) => ({
    id: `${artifact.id}:${item.index}`,
    type: 'image',
    url: item.src,
    thumbnailUrl: item.src,
    title: artifact.title || `生成图片 ${item.index + 1}`,
    mimeType: artifact.images[item.index]?.mimeType || 'image/png',
    source: 'MiaoShe Chat',
    createdAt: Date.now(),
  }));
}

function sanitizeUrl(url: string, kind: 'a' | 'img') {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\//.test(value)) return value;
  if (kind === 'img' && /^data:image\//i.test(value)) return value;
  return '';
}

function resolvePreviewAssetUrl(asset: UploadedAsset) {
  return resolveUploadedAssetUrl(asset.url);
}

function buildPreviewSrcList(assets: UploadedAsset[]) {
  return assets
    .filter((asset) => asset.type === 'image')
    .map((asset) => resolvePreviewAssetUrl(asset))
    .filter(Boolean);
}

function clampPreviewIndex(index: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), total - 1);
}

function findAssetIndex(assets: UploadedAsset[], target: UploadedAsset) {
  const index = assets.findIndex((asset) =>
    asset.id && target.id ? asset.id === target.id : asset.url === target.url,
  );
  return Math.max(index, 0);
}

function sanitizeArticleHtml(value: string) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (typeof document === 'undefined') {
    return raw;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${raw}</body>`, 'text/html');
  const allowedTags = new Set([
    'a',
    'article',
    'b',
    'blockquote',
    'br',
    'code',
    'div',
    'em',
    'figure',
    'figcaption',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'img',
    'i',
    'input',
    'li',
    'ol',
    'p',
    'pre',
    'section',
    'strong',
    'table',
    'tbody',
    'td',
    'thead',
    'th',
    'tr',
    'ul',
  ]);
  const allowedAttrs: Record<string, string[]> = {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title'],
    input: ['type', 'checked', 'disabled'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  };
  const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form']);

  function cleanNode(node: Node, outputDoc: Document): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return outputDoc.createTextNode(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tag = String((node as Element).tagName || '').toLowerCase();
    if (!tag || blockedTags.has(tag)) {
      return null;
    }
    if (!allowedTags.has(tag)) {
      const fragment = outputDoc.createDocumentFragment();
      Array.from(node.childNodes || []).forEach((child) => {
        const cleanedChild = cleanNode(child, outputDoc);
        if (cleanedChild) fragment.appendChild(cleanedChild);
      });
      return fragment;
    }

    const element = outputDoc.createElement(tag);
    const attrs = allowedAttrs[tag] || [];
    attrs.forEach((name) => {
      if (!(node as Element).hasAttribute(name)) return;
      if (tag === 'a' && name === 'href') {
        const href = sanitizeUrl((node as Element).getAttribute(name) || '', 'a');
        if (href) {
          element.setAttribute('href', href);
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noopener noreferrer');
        }
        return;
      }
      if (tag === 'img' && name === 'src') {
        const src = sanitizeUrl((node as Element).getAttribute(name) || '', 'img');
        if (src) element.setAttribute('src', src);
        return;
      }
      if (tag === 'input' && name === 'type') {
        if (String((node as Element).getAttribute(name) || '').toLowerCase() === 'checkbox') {
          element.setAttribute('type', 'checkbox');
        }
        return;
      }
      if (tag === 'input' && (name === 'checked' || name === 'disabled')) {
        if ((node as Element).hasAttribute(name)) element.setAttribute(name, name);
        return;
      }
      const attrValue = String((node as Element).getAttribute(name) || '').trim();
      if (attrValue) {
        element.setAttribute(name, attrValue);
      }
    });

    Array.from(node.childNodes || []).forEach((child) => {
      const cleanedChild = cleanNode(child, outputDoc);
      if (cleanedChild) element.appendChild(cleanedChild);
    });
    return element;
  }

  const cleanDoc = document.implementation.createHTMLDocument('');
  const wrapper = cleanDoc.createElement('div');
  Array.from(doc.body.childNodes || []).forEach((child) => {
    const cleanedChild = cleanNode(child, cleanDoc);
    if (cleanedChild) wrapper.appendChild(cleanedChild);
  });
  return wrapper.innerHTML;
}

function renderArticleRichHtml(value: string, format?: MiaosheArtifactFormat) {
  const content = String(value || '').trim();
  if (!content) {
    return '';
  }

  if ((format || inferArtifactFormat(content)) === 'html') {
    return sanitizeArticleHtml(content);
  }

  const rendered = marked.parse(content, {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;

  return sanitizeArticleHtml(String(rendered || ''));
}

function renderArticleIntoConversation(
  current: ChatMessage[],
  artifact: ArticleArtifact,
  preferredMessageId?: string,
): ChatMessage[] {
  if (preferredMessageId) {
    const index = current.findIndex((item) => item.id === preferredMessageId);
    if (index >= 0) {
      const next = current.slice();
      next[index] = {
        ...next[index],
        articleArtifact: artifact,
      };
      return next;
    }
  }

  for (let index = current.length - 1; index >= 0; index -= 1) {
    if (current[index].role === 'assistant' && current[index].articleArtifact) {
      const next = current.slice();
      next[index] = {
        ...next[index],
        articleArtifact: artifact,
      };
      return next;
    }
  }

  const synthetic: ChatMessage = {
    id: preferredMessageId || createMessageId(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    articleArtifact: artifact,
  };

  return [...current, synthetic];
}

function renderMediaIntoConversation(
  current: ChatMessage[],
  artifact: MediaArtifact,
  preferredMessageId?: string,
): ChatMessage[] {
  if (preferredMessageId) {
    const index = current.findIndex((item) => item.id === preferredMessageId);
    if (index >= 0) {
      const next = current.slice();
      next[index] = {
        ...next[index],
        mediaArtifact: artifact,
      };
      return next;
    }
  }

  for (let index = current.length - 1; index >= 0; index -= 1) {
    if (current[index].role === 'assistant' && current[index].mediaArtifact) {
      const next = current.slice();
      next[index] = {
        ...next[index],
        mediaArtifact: artifact,
      };
      return next;
    }
  }

  const synthetic: ChatMessage = {
    id: preferredMessageId || createMessageId(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    mediaArtifact: artifact,
  };

  return [...current, synthetic];
}

function renderAttachmentsIntoConversation(
  current: ChatMessage[],
  attachments: UploadedAsset[],
  preferredMessageId?: string,
): ChatMessage[] {
  if (!attachments.length) {
    return current;
  }

  const mergeAttachments = (existing: UploadedAsset[] | undefined) => {
    const merged = new Map<string, UploadedAsset>();
    for (const item of existing || []) {
      merged.set(item.url, item);
    }
    for (const item of attachments) {
      merged.set(item.url, item);
    }
    return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
  };

  const applyAt = (index: number) => {
    const next = current.slice();
    next[index] = {
      ...next[index],
      attachments: mergeAttachments(next[index]?.attachments),
    };
    return next;
  };

  if (preferredMessageId) {
    const index = current.findIndex((item) => item.id === preferredMessageId);
    if (index >= 0) {
      return applyAt(index);
    }
  }

  for (let index = current.length - 1; index >= 0; index -= 1) {
    if (current[index].role === 'assistant') {
      return applyAt(index);
    }
  }

  const synthetic: ChatMessage = {
    id: preferredMessageId || createMessageId(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    attachments,
  };

  return [...current, synthetic];
}

function AttachmentPreview({ asset }: { asset: UploadedAsset }) {
  const previewUrl = resolveUploadedAssetUrl(asset.thumbnailUrl || asset.url);

  if (asset.type === 'image') {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/70">
        <img
          src={previewUrl}
          alt={asset.title}
          className="block h-28 w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        {asset.type === 'video' ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{asset.title}</p>
        <p className="truncate text-xs text-slate-500">
          {[asset.mimeType, formatFileSize(asset.size)].filter(Boolean).join(' · ') || '文件'}
        </p>
      </div>
    </div>
  );
}

function MessageAttachmentGallery({ attachments }: { attachments: UploadedAsset[] }) {
  const imageAttachments = attachments.filter((asset) => asset.type === 'image');
  const otherAttachments = attachments.filter((asset) => asset.type !== 'image');

  return (
    <div className="mt-3 space-y-3">
      {imageAttachments.length ? <ImageAttachmentCarousel assets={imageAttachments} /> : null}
      {otherAttachments.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {otherAttachments.map((asset) => (
            <AttachmentPreview key={asset.id || asset.url} asset={asset} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImageAttachmentCarousel({ assets }: { assets: UploadedAsset[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const total = assets.length;
  const previewSrcList = useMemo(() => buildPreviewSrcList(assets), [assets]);
  const safeActiveIndex = clampPreviewIndex(activeIndex, total);
  const activeAsset = assets[safeActiveIndex];
  const activePreviewUrl = activeAsset ? resolveUploadedAssetUrl(activeAsset.thumbnailUrl || activeAsset.url) : '';

  if (!activeAsset) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative flex w-full justify-center">
        {total > 1 ? (
          <button
            type="button"
            onClick={() => setActiveIndex((current) => (current - 1 + total) % total)}
            className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-slate-600 transition hover:bg-white hover:text-slate-900"
            aria-label="上一张图片"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setPreviewVisible(true)}
          className="flex w-full max-w-[520px] justify-center"
          aria-label={`预览${activeAsset.title}`}
        >
          <div className="flex h-[220px] w-full items-center justify-center overflow-hidden sm:h-[280px] md:h-[320px]">
            <div className="flex h-full w-full items-center justify-center">
              <img
                src={activePreviewUrl}
                alt={activeAsset.title}
                className="max-h-full max-w-full rounded-[16px] object-contain"
              />
            </div>
          </div>
        </button>

        {total > 1 ? (
          <button
            type="button"
            onClick={() => setActiveIndex((current) => (current + 1) % total)}
            className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-slate-600 transition hover:bg-white hover:text-slate-900"
            aria-label="下一张图片"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-1">
          {assets.map((asset, index) => (
            <button
              key={asset.id || asset.url}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === safeActiveIndex ? 'w-4 bg-slate-900' : 'w-1.5 bg-slate-300 hover:bg-slate-400',
              )}
              aria-label={`查看第 ${index + 1} 张图片`}
            />
          ))}
        </div>
      ) : null}

      {previewSrcList.length ? (
        <ImagePreview
          src={previewSrcList}
          visible={previewVisible}
          currentIndex={safeActiveIndex}
          onVisibleChange={setPreviewVisible}
          onChange={(index) => setActiveIndex(index)}
        />
      ) : null}
    </div>
  );
}

function ComposerAttachmentPreview({
  asset,
  onRemove,
}: {
  asset: UploadedAsset;
  onRemove?: () => void;
}) {
  const previewUrl = resolveUploadedAssetUrl(asset.thumbnailUrl || asset.url);

  if (asset.type === 'image') {
    return (
      <div className="group relative h-[76px] w-[76px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
        <img
          src={previewUrl}
          alt={asset.title}
          className="block h-full w-full object-cover"
        />
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/72 text-white opacity-0 shadow-sm transition-opacity hover:bg-slate-950 group-hover:opacity-100"
            aria-label={`删除${asset.title}`}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group relative flex h-[76px] w-[144px] shrink-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 shadow-sm">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {asset.type === 'video' ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <p className="truncate pr-5 text-[12px] font-medium text-slate-900">{asset.title}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {asset.type === 'video'
            ? [asset.mimeType, formatFileSize(asset.size)].filter(Boolean).join(' · ') || '视频'
            : [fileExtensionLabel(asset.title), formatFileSize(asset.size)].filter(Boolean).join(' · ') || '文件'}
        </p>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/72 text-white opacity-0 shadow-sm transition-opacity hover:bg-slate-950 group-hover:opacity-100"
          aria-label={`删除${asset.title}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

function CodexRunFeedback({ state }: { state: CodexRunState }) {
  if (state.phase === 'thinking') {
    return (
      <div className="w-full py-1">
        <div className="text-sm font-semibold">
          <span className="miaoshe-status-shine">
            {state.label}
          </span>
        </div>
      </div>
    );
  }

  const icon =
    state.phase === 'completed' ? (
      <Check className="h-4 w-4 text-emerald-600" />
    ) : (
      <X className="h-4 w-4 text-rose-600" />
    );

  const tone =
    state.phase === 'completed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <div className={cn('w-full py-1', tone)}>
      <div className="flex items-center gap-2.5 text-sm font-medium">
        {icon}
        <span>{state.label}</span>
      </div>
      {state.detail ? <p className="mt-1 pl-6 text-xs opacity-80">{state.detail}</p> : null}
    </div>
  );
}

function ArticleArtifactCard({
  artifact,
  onOpen,
  onCopy,
}: {
  artifact: ArticleArtifact;
  onOpen: () => void;
  onCopy: () => void;
}) {
  const stats = countArtifactStats(artifact);

  return (
    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white text-slate-800 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/65 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef4ff] font-mono text-[11px] font-bold text-[#315a9d]">
            {artifact.format === 'html' ? 'RT' : 'MD'}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">文章草稿</p>
            <p className="text-[11px] text-slate-500">
              {artifact.streaming ? '正在生成结构化文章草稿...' : '已生成 1 个结构化文章草稿'}
            </p>
          </div>
        </div>
        <div className="text-xs font-medium text-slate-500">
          +{stats.lines} 行 · {stats.words} 字
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {artifact.title || '未命名文章'}
          </p>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-500">
            {plainPreview(artifact) || '文章草稿已生成。'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={onOpen}
          >
            打开编辑
          </Button>
          <Button type="button" variant="outline" onClick={onCopy}>
            复制正文
          </Button>
        </div>
      </div>
    </div>
  );
}

function MediaArtifactCard({
  artifact,
  onCopyPrompt,
}: {
  artifact: MediaArtifact;
  onCopyPrompt: () => void;
}) {
  if (artifact.kind === 'video') {
    return <VideoArtifactPlayer artifact={artifact} />;
  }

  const images = mediaImageItems(artifact);
  const kindLabel = mediaKindLabel(artifact);
  const chips = [
    artifact.aspectRatio ? `比例 ${artifact.aspectRatio}` : '',
    artifact.duration ? `时长 ${artifact.duration}` : '',
    artifact.style ? `风格 ${artifact.style}` : '',
    artifact.confirmationRequired ? '需要确认' : '',
  ].filter(Boolean);
  const questions = artifact.clarificationQuestions || [];

  return (
    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white text-slate-800 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/65 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 font-mono text-[11px] font-bold text-emerald-700">
            {artifact.kind === 'video' ? 'VD' : 'IMG'}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{mediaArtifactTitle(artifact)}</p>
            <p className="text-[11px] text-slate-500">{mediaArtifactStatusText(artifact)}</p>
          </div>
        </div>
        <div className="text-xs font-medium text-slate-500">{mediaIntentLabel(artifact)}</div>
      </div>

      <div className="space-y-3 px-4 py-4">
        <p className="text-sm font-semibold text-slate-900">
          {artifact.summary || `${kindLabel}生成参数已整理好`}
        </p>

        {chips.length ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {artifact.generationStatus === 'generating' || artifact.generationStatus === 'processing' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {artifact.kind === 'video' ? '视频生成中，完成后会存入 OSS...' : '图片生成中...'}
            {artifact.taskId ? ` 任务 ID：${artifact.taskId}` : ''}
          </div>
        ) : null}

        {artifact.generationStatus === 'failed' ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {artifact.error || (artifact.kind === 'video' ? '视频生成失败' : '图片生成失败')}
          </div>
        ) : null}

        {images.length ? (
          <div className={cn('grid gap-2', images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
            {images.map((item) => (
              <a
                key={item.src}
                href={item.src}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
              >
                <img
                  src={item.src}
                  alt={`生成图片 ${item.index + 1}`}
                  className="block aspect-square w-full object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}

        {questions.length ? (
          <p className="text-sm leading-6 text-slate-500">{questions.join(' / ')}</p>
        ) : null}

        {artifact.prompt ? (
          <pre className="max-h-40 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-600 whitespace-pre-wrap">
            {artifact.prompt}
          </pre>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={onCopyPrompt}
            disabled={!artifact.prompt}
          >
            复制提示词
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArticlePreview({ artifact }: { artifact: ArticleArtifact }) {
  const safeHtml = useMemo(
    () =>
      artifact.format === 'html'
        ? sanitizeArticleHtml(artifact.markdown)
        : '',
    [artifact.format, artifact.markdown],
  );

  if (artifact.format === 'html') {
    return (
      <div
        className="prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return <Markdown className="prose prose-slate max-w-none">{artifact.markdown}</Markdown>;
}

function ArticleEditorSheet({
  open,
  artifact,
  tab,
  generatedAssets,
  assetsLoading,
  publishBusy,
  onTabChange,
  onOpenChange,
  onChange,
  onPublish,
}: {
  open: boolean;
  artifact: ArticleArtifact | null;
  tab: EditorTab;
  generatedAssets: UploadedAsset[];
  assetsLoading: boolean;
  publishBusy: boolean;
  onTabChange: (value: EditorTab) => void;
  onOpenChange: (open: boolean) => void;
  onChange: (next: ArticleArtifact) => void;
  onPublish: (article: ArticleArtifact) => Promise<void>;
}) {
  if (!artifact) {
    return null;
  }

  const { resolvedTheme, theme } = useTheme();
  const isDark = (resolvedTheme ?? theme) === 'dark';
  const currentArtifact =
    artifact.format === 'html'
      ? artifact
      : {
          ...artifact,
          markdown: renderArticleRichHtml(artifact.markdown, artifact.format),
          format: 'html' as MiaosheArtifactFormat,
        };
  const initialEditorHtml =
    renderArticleRichHtml(currentArtifact.markdown, currentArtifact.format) || '<p></p>';
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastSyncedHtmlRef = useRef('');
  const appliedArtifactSignatureRef = useRef('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [pickerPreviewVisible, setPickerPreviewVisible] = useState(false);
  const [pickerPreviewIndex, setPickerPreviewIndex] = useState(0);
  const [editorMountKey, setEditorMountKey] = useState(0);
  const [editorTitle, setEditorTitle] = useState(currentArtifact.title);
  const [editorSnapshotHtml, setEditorSnapshotHtml] = useState(initialEditorHtml);
  const imageAssets = generatedAssets.filter((item) => item.type === 'image');
  const imagePreviewSrcList = useMemo(() => buildPreviewSrcList(imageAssets), [imageAssets]);
  const editorArtifact: ArticleArtifact = {
    ...currentArtifact,
    title: editorTitle,
    markdown: editorSnapshotHtml,
    format: 'html',
  };
  const stats = countArtifactStats(editorArtifact);
  const isEditorEmpty = !stripArticleMarkup(editorSnapshotHtml, 'html').trim();

  useEffect(() => {
    if (!open || artifact.format === 'html') {
      return;
    }
    const nextHtml = renderArticleRichHtml(artifact.markdown, artifact.format);
    if (!nextHtml) {
      return;
    }
    onChange({
      ...artifact,
      markdown: nextHtml,
      format: 'html',
    });
  }, [artifact, onChange, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const incomingSignature = `${currentArtifact.title}\u0000${initialEditorHtml}`;
    if (incomingSignature === appliedArtifactSignatureRef.current) {
      return;
    }
    setEditorTitle(currentArtifact.title);
    setEditorSnapshotHtml(initialEditorHtml);
    lastSyncedHtmlRef.current = initialEditorHtml;
    appliedArtifactSignatureRef.current = incomingSignature;
    setEditorMountKey((current) => current + 1);
  }, [currentArtifact.title, initialEditorHtml, open]);

  function emitEditorChange(nextTitle: string, nextHtml: string) {
    const normalizedHtml = nextHtml || '<p></p>';
    const nextArtifact: ArticleArtifact = {
      ...currentArtifact,
      title: nextTitle,
      markdown: normalizedHtml,
      format: 'html',
    };
    lastSyncedHtmlRef.current = normalizedHtml;
    appliedArtifactSignatureRef.current = `${nextTitle}\u0000${normalizedHtml}`;
    setEditorSnapshotHtml(normalizedHtml);
    onChange(nextArtifact);
  }

  function syncEditorContent() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const nextHtml = editor.innerHTML || '<p></p>';
    if (nextHtml === lastSyncedHtmlRef.current) {
      return;
    }
    emitEditorChange(editorTitle, nextHtml);
  }

  function captureSelection() {
    if (typeof window === 'undefined') {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    if (typeof window === 'undefined') {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    if (savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  }

  function focusEditor() {
    editorRef.current?.focus();
    restoreSelection();
  }

  function escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentSelectionText() {
    if (typeof window === 'undefined') {
      return '';
    }
    const selection = window.getSelection();
    return selection ? selection.toString() : '';
  }

  function insertHtmlAtCursor(html: string) {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    focusEditor();
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.setEndAfter(lastNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      captureSelection();
      syncEditorContent();
      return;
    }
    editor.insertAdjacentHTML('beforeend', html);
    syncEditorContent();
  }

  function runExecCommand(command: string, value?: string) {
    focusEditor();
    if (typeof document !== 'undefined') {
      document.execCommand(command, false, value);
    }
    captureSelection();
    syncEditorContent();
  }

  function applyHeading(level: 1 | 2 | 3) {
    const selectedText = currentSelectionText().trim();
    if (!selectedText) {
      insertHtmlAtCursor(`<h${level}>${escapeHtml(`标题 ${level}`)}</h${level}><p></p>`);
      return;
    }
    runExecCommand('formatBlock', `H${level}`);
  }

  function applyEditorCommand(commandId: string) {
    switch (commandId) {
      case 'h1':
        applyHeading(1);
        return;
      case 'h2':
        applyHeading(2);
        return;
      case 'h3':
        applyHeading(3);
        return;
      case 'bold':
        runExecCommand('bold');
        return;
      case 'italic':
        runExecCommand('italic');
        return;
      case 'ul':
        runExecCommand('insertUnorderedList');
        return;
      case 'ol':
        runExecCommand('insertOrderedList');
        return;
      case 'quote': {
        const selectedText = currentSelectionText().trim();
        if (!selectedText) {
          insertHtmlAtCursor('<blockquote><p>引用引言</p></blockquote><p></p>');
          return;
        }
        insertHtmlAtCursor(`<blockquote><p>${escapeHtml(selectedText)}</p></blockquote><p></p>`);
        return;
      }
      case 'code': {
        const selectedText = currentSelectionText().trim();
        if (!selectedText) {
          insertHtmlAtCursor('<pre><code>code</code></pre><p></p>');
          return;
        }
        insertHtmlAtCursor(`<code>${escapeHtml(selectedText)}</code>`);
        return;
      }
      case 'tasklist':
        insertHtmlAtCursor('<p><input type="checkbox" disabled /> 未完事项</p>');
        return;
      case 'link': {
        const href = window.prompt('请输入链接地址', 'https://example.com')?.trim();
        if (!href) {
          return;
        }
        const selectedText = currentSelectionText().trim() || '链接描述';
        insertHtmlAtCursor(
          `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(selectedText)}</a>`,
        );
        return;
      }
      case 'table':
        insertHtmlAtCursor(
          [
            '<table><thead><tr><th>表头1</th><th>表头2</th><th>表头3</th></tr></thead>',
            '<tbody><tr><td>内容1</td><td>内容2</td><td>内容3</td></tr>',
            '<tr><td>内容4</td><td>内容5</td><td>内容6</td></tr></tbody></table><p></p>',
          ].join(''),
        );
        return;
      default:
        return;
    }
  }

  function insertAssetIntoArticle(asset: UploadedAsset) {
    const title = asset.title || (asset.type === 'image' ? '素材图片' : '素材文件');
    if (asset.type === 'image') {
      insertHtmlAtCursor(
        `<figure><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(title)}" title="${escapeHtml(title)}" /><figcaption>${escapeHtml(title)}</figcaption></figure><p></p>`,
      );
      return;
    }

    insertHtmlAtCursor(
      `<p><a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></p>`,
    );
  }

  function sanitizeEditorContent() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const sanitized = sanitizeArticleHtml(editor.innerHTML || '');
    if (!sanitized) {
      editor.innerHTML = '<p></p>';
      syncEditorContent();
      return;
    }
    if (sanitized !== editor.innerHTML) {
      editor.innerHTML = sanitized;
    }
    emitEditorChange(editorTitle, editor.innerHTML || '<p></p>');
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="miaoshe-chat-shell__article-sheet w-full border-l border-slate-200 bg-slate-50 p-0 data-[side=right]:max-w-none sm:data-[side=right]:w-[min(1080px,calc(100vw-10rem))] sm:data-[side=right]:max-w-none"
      >
        <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-10">
            <SheetTitle className="text-base text-slate-900">文章 DIY 编辑</SheetTitle>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-full bg-slate-900 px-4 text-white hover:bg-slate-800"
              onClick={() =>
                void onPublish({
                  ...editorArtifact,
                  title: editorTitle.trim() || editorArtifact.title || '未命名文章',
                })
              }
              disabled={publishBusy}
            >
              {publishBusy ? '发送中...' : '发布'}
            </Button>
          </div>
        </SheetHeader>

        <div className="flex h-full min-h-0 flex-col bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-slate-500">
              <div className="text-sm font-medium">
                {stats.lines} 行 · {stats.words} 字 · UTF-8 | Structured Rich Text
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <Tabs value={tab} onValueChange={(value) => onTabChange(value as EditorTab)} className="h-full">
              <TabsList variant="line" className="mx-5 mb-0 mt-4 border-slate-200">
                <TabsTrigger value="edit">编辑</TabsTrigger>
                <TabsTrigger value="preview">预览</TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="mt-0 h-[calc(100%-3.75rem)]">
                <div className="flex h-full min-h-0 flex-col bg-slate-50">
                  <div className="px-5 py-4">
                    <Input
                      value={editorTitle}
                      onChange={(event) => {
                        const nextTitle = event.target.value;
                        setEditorTitle(nextTitle);
                        emitEditorChange(nextTitle, editorRef.current?.innerHTML || lastSyncedHtmlRef.current || '<p></p>');
                      }}
                      placeholder="文章标题"
                      className="h-11 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="mx-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <ContentGenerationToolbar
                      onCommand={applyEditorCommand}
                      setShowHelpModal={setShowHelpModal}
                      theme={isDark ? 'dark' : 'light'}
                      onInsertImage={() => {
                        captureSelection();
                        setShowImagePickerModal(true);
                      }}
                    />
                    <div className="relative h-[560px] min-h-[560px] bg-white">
                      <div
                        key={editorMountKey}
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        dangerouslySetInnerHTML={{
                          __html: initialEditorHtml,
                        }}
                        role="textbox"
                        aria-multiline="true"
                        onInput={syncEditorContent}
                        onBlur={() => {
                          captureSelection();
                          sanitizeEditorContent();
                        }}
                        onKeyUp={captureSelection}
                        onMouseUp={captureSelection}
                        onPaste={(event) => {
                          const html = event.clipboardData.getData('text/html').trim();
                          const text = event.clipboardData.getData('text/plain').trim();
                          if (!html && !text) {
                            return;
                          }
                          event.preventDefault();
                          if (html) {
                            insertHtmlAtCursor(sanitizeArticleHtml(html));
                            return;
                          }
                          insertHtmlAtCursor(renderArticleRichHtml(text, 'markdown'));
                        }}
                        className="h-full min-h-full w-full overflow-y-auto px-6 py-6 font-sans text-[15px] leading-relaxed text-slate-800 outline-none [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-slate-500 [&_figure]:my-4 [&_h1]:mt-6 [&_h1]:text-[30px] [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:text-[24px] [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-[20px] [&_h3]:font-semibold [&_img]:max-h-[320px] [&_img]:rounded-xl [&_img]:object-contain [&_img]:shadow-sm [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:text-slate-100 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
                      />
                      {isEditorEmpty ? (
                        <div className="pointer-events-none absolute left-6 top-6 text-[15px] text-slate-400">
                          在这里开始书写文章、大纲或者纪要吧...
                        </div>
                      ) : null}
                      <div className="pointer-events-none absolute bottom-4 right-4 select-none rounded border border-slate-200 bg-white/90 px-2 py-1 font-mono text-[9px] text-slate-400 shadow-sm">
                        UTF-8 | Structured Rich Text
                      </div>
                    </div>
                  </div>

                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-0 h-[calc(100%-3.75rem)]">
                <div className="mx-5 h-full overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="mx-auto max-w-4xl p-8 md:p-12">
                    <div className="mb-8 border-b border-slate-200 pb-4">
                      <h1 className="mt-1 text-3xl font-serif font-extrabold leading-tight tracking-tight text-slate-900">
                        {editorArtifact.title || '无标题草稿'}
                      </h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-slate-500">
                        <span>修订中</span>
                        <span>•</span>
                        <span>{stats.words} 字</span>
                      </div>
                    </div>
                    {editorArtifact.markdown.trim() ? (
                      <ArticlePreview artifact={editorArtifact} />
                    ) : (
                      <div className="py-20 text-center text-xs italic text-slate-400">
                        还没有内容可预览。在编辑器中开始书写吧。
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {showHelpModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-xs">
            <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
                <h3 className="text-sm font-bold text-slate-900">富文本排版工具参考</h3>
                <button
                  type="button"
                  onClick={() => setShowHelpModal(false)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4 overflow-y-auto bg-white p-6 font-sans text-xs leading-relaxed text-slate-600">
                <p>
                  这里已经切成结构化富文本编辑。上方工具栏会直接对正文生效，不再插入 Markdown 符号。
                </p>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3">
                  <div>
                    <h4 className="mb-1.5 border-b border-slate-200 pb-1 text-xs font-bold text-slate-900">文字样式</h4>
                    <ul className="space-y-1.5 text-slate-500">
                      <li><strong className="text-slate-800">H1 / H2 / H3</strong> - 直接设置标题层级</li>
                      <li><strong className="text-slate-800">B / I</strong> - 直接对选中文字加粗、斜体</li>
                      <li><strong className="text-slate-800">&lt;&gt;</strong> - 插入代码片段</li>
                      <li><strong className="text-slate-800">链接</strong> - 为选中文字添加真实超链接</li>
                      <li><strong className="text-slate-800">图片</strong> - 打开素材弹窗并插入图片</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-1.5 border-b border-slate-200 pb-1 text-xs font-bold text-slate-900">结构布局</h4>
                    <ul className="space-y-1.5 text-slate-500">
                      <li><strong className="text-slate-800">引用</strong> - 生成引用块</li>
                      <li><strong className="text-slate-800">列表</strong> - 生成无序 / 有序列表</li>
                      <li><strong className="text-slate-800">任务</strong> - 插入复选任务项</li>
                      <li><strong className="text-slate-800">表格</strong> - 插入可继续编辑的表格结构</li>
                      <li><strong className="text-slate-800">粘贴</strong> - 自动按结构化 HTML / 文本导入</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <Dialog open={showImagePickerModal} onOpenChange={setShowImagePickerModal}>
          <DialogContent className="miaoshe-chat-shell__dialog max-w-[760px] rounded-[24px] border border-slate-200 bg-white p-0 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.25)]">
            <DialogHeader className="border-b border-slate-200 px-6 py-5">
              <DialogTitle className="text-[16px] font-semibold text-slate-900">选择图片素材</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-6 text-slate-500">
                点击图片可预览，点击插入按钮会放入当前文章正文中。
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              {assetsLoading && imageAssets.length === 0 ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50 text-center">
                  <LoaderCircle className="h-8 w-8 animate-spin text-slate-300" />
                  <p className="mt-4 text-sm font-medium text-slate-600">正在加载图片素材...</p>
                  <p className="mt-1 text-xs text-slate-400">稍等一下，正在同步历史图片记录。</p>
                </div>
              ) : imageAssets.length === 0 ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50 text-center">
                  <ImageIcon className="h-8 w-8 text-slate-300" />
                  <p className="mt-4 text-sm font-medium text-slate-600">暂时还没有可用的图片素材</p>
                  <p className="mt-1 text-xs text-slate-400">先在 MiaoShe Chat 里生成图片，稍后再回来选择。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {imageAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group overflow-hidden rounded-[18px] border border-slate-200 bg-white text-left transition-colors hover:border-slate-300"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPickerPreviewIndex(findAssetIndex(imageAssets, asset));
                          setPickerPreviewVisible(true);
                        }}
                        className="relative block aspect-square w-full overflow-hidden bg-slate-100"
                        aria-label={`预览${asset.title}`}
                      >
                        <img
                          src={resolveUploadedAssetUrl(asset.thumbnailUrl || asset.url)}
                          alt={asset.title}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-3 py-2">
                          <span className="inline-flex rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            点击预览
                          </span>
                        </div>
                      </button>
                      <div className="px-3 py-2.5">
                        <p className="truncate text-sm font-medium text-slate-900">{asset.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {[asset.mimeType, formatTimestamp(asset.createdAt)].filter(Boolean).join(' · ')}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 w-full"
                          onClick={() => {
                            insertAssetIntoArticle(asset);
                            setShowImagePickerModal(false);
                          }}
                        >
                          插入正文
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {imagePreviewSrcList.length ? (
              <ImagePreview
                src={imagePreviewSrcList}
                visible={pickerPreviewVisible}
                currentIndex={clampPreviewIndex(pickerPreviewIndex, imagePreviewSrcList.length)}
                onVisibleChange={setPickerPreviewVisible}
                onChange={setPickerPreviewIndex}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

export function MiaosheChatWorkspaceClient() {
  const locale = useLocale();
  const copy = CHAT_COPY[locale === 'zh' ? 'zh' : 'en'];
  const drawerCopy = DRAWER_COPY[locale === 'zh' ? 'zh' : 'en'];
  const searchParams = useSearchParams();
  const brand = useBrandStore((state) => state.getActiveBrand());

  const [draft, setDraft] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [mode, setMode] = useState<ChatMode>('chat');
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [activeThreadId, setActiveThreadId] = useState(DEFAULT_THREAD_ID);
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [activities, setActivities] = useState<ContentOpportunity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [generatedAssets, setGeneratedAssets] = useState<UploadedAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetsReloadKey, setAssetsReloadKey] = useState(0);
  const [integrationBridge, setIntegrationBridge] = useState<IntegrationBridgeSession | null>(null);
  const [integrationConnections, setIntegrationConnections] = useState<CreatorPlatformConnection[]>([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationRefreshing, setIntegrationRefreshing] = useState(false);
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAsset[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [codexRunState, setCodexRunState] = useState<CodexRunState>({
    phase: 'idle',
    label: '',
    updatedAt: 0,
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [activeArticleArtifact, setActiveArticleArtifact] = useState<ArticleArtifact | null>(null);
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [assetPreviewVisible, setAssetPreviewVisible] = useState(false);
  const [assetPreviewIndex, setAssetPreviewIndex] = useState(0);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const codexStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bridgeSessionSyncRef = useRef('');
  const threadTitleRequestKeysRef = useRef<Set<string>>(new Set());
  const generatedImageAssets = useMemo(
    () => generatedAssets.filter((asset) => asset.type === 'image'),
    [generatedAssets],
  );
  const generatedImagePreviewSrcList = useMemo(
    () => buildPreviewSrcList(generatedImageAssets),
    [generatedImageAssets],
  );

  const primaryDomain =
    brand?.domains.find((item) => item.isPrimary)?.domain ?? brand?.domains[0]?.domain ?? null;
  const connectedIntegrationLabels = useMemo(
    () =>
      Array.from(
        new Set(
          integrationConnections
            .map((item) => item.platformLabel || item.accountName || item.platform)
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ),
    [integrationConnections],
  );
  const scopeKey = useMemo(
    () => (brand?.id ? scopedConversationKey(brand.id, activeThreadId) : ''),
    [activeThreadId, brand?.id],
  );

  useEffect(() => {
    return () => {
      if (codexStatusTimerRef.current) {
        clearTimeout(codexStatusTimerRef.current);
      }
      if (streamRenderTimerRef.current) {
        clearTimeout(streamRenderTimerRef.current);
      }
    };
  }, []);

  const workspaceContext = useMemo(() => {
    if (!brand) {
      return '';
    }

    if (locale !== 'zh') {
      return [
        `Current brand: ${brand.name}`,
        `Primary domain: ${primaryDomain || 'Not configured'}`,
        `Connected channels: ${connectedIntegrationLabels.length ? connectedIntegrationLabels.join(', ') : 'None'}`,
        'Reply in English. Keep plans, generated copy, and action labels in English unless the user explicitly requests another language.',
      ].join('\n');
    }

    return [
      `当前品牌：${brand.name}`,
      `主域名：${primaryDomain || '未配置'}`,
      `已连接渠道：${connectedIntegrationLabels.length ? connectedIntegrationLabels.join('、') : '暂无'}`,
      `已绑定平台：暂无`,
      `最近活跃渠道：暂无数据`,
    ].join('\n');
  }, [brand, connectedIntegrationLabels, locale, primaryDomain]);

  const modeMeta = copy.modeOptions.find((item) => item.value === mode) ?? copy.modeOptions[0];
  const recentConversations = useMemo(() => {
    return threads
      .filter((item) => item.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 12)
      .map(summarizeThread);
  }, [threads]);
  const filteredConversations = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) {
      return recentConversations;
    }
    return recentConversations.filter((item) => item.fullText.toLowerCase().includes(query));
  }, [historyQuery, recentConversations]);

  const scheduledTaskTimeline = useMemo(
    () =>
      activities
        .filter((item) => item.status !== 'dismissed')
        .map((item) => ({
          id: item.id,
          title: item.title,
          createdAt: item.updatedAt || item.createdAt,
          statusLabel:
            item.status === 'done'
              ? '已完成'
              : item.status === 'sent' || item.status === 'in_progress'
                ? '执行中'
                : '待执行',
          detail: item.sourceData.promptText || item.description || '等待进入执行流程',
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [activities],
  );
  const integrationGroups = useMemo(() => {
    const connectionMap = new Map<string, CreatorPlatformConnection[]>();
    for (const item of integrationConnections) {
      const key = normalizeIntegrationPlatformKey(item.platform);
      const current = connectionMap.get(key) ?? [];
      current.push(item);
      connectionMap.set(key, current);
    }

    return INTEGRATION_GROUPS.map((group) => ({
      ...group,
      platforms: group.platforms.map((platform) => {
        const matches = connectionMap.get(normalizeIntegrationPlatformKey(platform.id)) ?? [];
        if (matches.length === 0) {
          return {
            ...platform,
            status: 'idle' as const,
            statusLabel: undefined,
          };
        }

        const accountNames = Array.from(
          new Set(
            matches
              .map((item) => item.accountName.trim())
              .filter(Boolean),
          ),
        );

        return {
          ...platform,
          status: 'connected' as const,
          statusLabel:
            matches.length > 1
              ? `已连接 ${matches.length} 个账号`
              : accountNames[0] || matches[0]?.platformLabel || '已连接',
        };
      }),
    }));
  }, [integrationConnections]);
  const publishPlatforms = useMemo(
    () =>
      integrationGroups
        .flatMap((group) => group.platforms)
        .sort((a, b) => {
          if (a.status === b.status) {
            return a.order - b.order;
          }
          return a.status === 'connected' ? -1 : 1;
        }),
    [integrationGroups],
  );

  function restoreThreadState(threadId: string, nextThreads: StoredThread[]) {
    const targetThread =
      nextThreads.find((item) => item.id === threadId) ||
      nextThreads.find((item) => item.id === DEFAULT_THREAD_ID) ||
      nextThreads[0] ||
      null;
    const nextThreadId = targetThread?.id || threadId;
    const nextMode = targetThread?.mode === 'agent' ? 'agent' : 'chat';
    const nextMessages = applyThreadModeToMessages(targetThread?.messages || [], nextMode);
    const nextScopeKey =
      brand?.id && nextThreadId ? scopedConversationKey(brand.id, nextThreadId) : '';
    const storedArticle = nextScopeKey ? normalizeArticleArtifact(loadArtifact(nextScopeKey)) : null;
    const storedMedia = nextScopeKey ? normalizeMediaArtifact(loadMediaArtifact(nextScopeKey)) : null;
    let hydratedMessages = nextMessages.slice();

    if (
      storedArticle &&
      !hydratedMessages.some((item) => item.articleArtifact?.markdown === storedArticle.markdown)
    ) {
      hydratedMessages = renderArticleIntoConversation(hydratedMessages, storedArticle);
    }
    if (
      storedMedia &&
      storedMedia.kind !== 'image' &&
      !hydratedMessages.some((item) => item.mediaArtifact?.id === storedMedia.id)
    ) {
      hydratedMessages = renderMediaIntoConversation(hydratedMessages, storedMedia);
    }

    setActiveThreadId(nextThreadId);
    setMessages(hydratedMessages);
    setMode(nextMode);
    setDraft('');
    setUploadedAssets([]);
    setUploadStatus(null);
    setActiveArticleArtifact(storedArticle);
  }

  function handleSelectThread(threadId: string) {
    restoreThreadState(threadId, threads);
  }

  function handleCreateThread() {
    const nextThread: StoredThread = {
      id: createThreadId(),
      messages: [],
      updatedAt: Date.now(),
      mode: 'chat',
    };
    const nextThreads = upsertStoredThread(threads, nextThread);
    setThreads(nextThreads);
    restoreThreadState(nextThread.id, nextThreads);
    setChatBusy(false);
    setStreamingAssistantId(null);
  }

  async function handleRefreshIntegrations() {
    if (!brand?.id) {
      toast.error('请先选择品牌，再刷新集成状态。');
      return;
    }

    setIntegrationRefreshing(true);
    try {
      const response = await fetch(
        `/api/backend/monitor/brands/${encodeURIComponent(brand.id)}/platform-data/refresh`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ forceRefresh: true }),
          cache: 'no-store',
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        bridge?: unknown;
        connections?: unknown[];
        summary?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || payload.summary || '刷新集成状态失败，请稍后重试。');
      }

      setIntegrationBridge(normalizeIntegrationBridgeSession(payload.bridge));
      setIntegrationConnections(
        Array.isArray(payload.connections)
          ? payload.connections
              .map(normalizeCreatorPlatformConnection)
              .filter((value): value is CreatorPlatformConnection => !!value)
          : [],
      );
      toast.success(payload.summary || payload.message || '已刷新集成状态。');
    } catch (refreshError) {
      toast.error(refreshError instanceof Error ? refreshError.message : '刷新集成状态失败，请稍后重试。');
    } finally {
      setIntegrationRefreshing(false);
    }
  }

  async function pollIntegrationBridgeConnection(brandId: string, attempts = 8, delayMs = 1500) {
    for (let index = 0; index < attempts; index += 1) {
      try {
        const response = await fetch(
          `/api/backend/monitor/brands/${encodeURIComponent(brandId)}/platform-data/status`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          bridge?: unknown;
          connections?: unknown[];
        };

        if (response.ok) {
          const nextBridge = normalizeIntegrationBridgeSession(payload.bridge);
          const nextConnections = Array.isArray(payload.connections)
            ? payload.connections
                .map(normalizeCreatorPlatformConnection)
                .filter((value): value is CreatorPlatformConnection => !!value)
            : [];

          setIntegrationBridge(nextBridge);
          setIntegrationConnections(nextConnections);

          if (nextBridge?.connected) {
            return true;
          }
        }
      } catch {
        // Ignore transient polling errors and keep trying.
      }

      if (index < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return false;
  }

  async function pushBridgeSessionToExtension(options?: {
    silent?: boolean;
    force?: boolean;
  }) {
    if (!integrationBridge?.publicId || !integrationBridge.wsUrl) {
      if (!options?.silent) {
        toast.error('扩展连接信息还没加载出来，请先刷新一次状态。');
      }
      return false;
    }

    const extensionApi =
      window.$poster?.configureBridgeSession || window.$syncer?.configureBridgeSession;
    if (!extensionApi) {
      if (!options?.silent) {
        toast.error('没有检测到扩展注入能力，请先确认扩展已经安装并启用。');
      }
      return false;
    }

    const syncKey = `${integrationBridge.publicId}:${integrationBridge.wsUrl}`;
    if (!options?.force && bridgeSessionSyncRef.current === syncKey) {
      return true;
    }

    const token = (() => {
      try {
        const url = new URL(integrationBridge.wsUrl);
        return url.searchParams.get('token') || '';
      } catch {
        return '';
      }
    })();

    const result = await new Promise<ExtensionBridgeConfigureResult | undefined>((resolve) => {
      try {
        extensionApi(
          {
            publicId: integrationBridge.publicId,
            wsUrl: integrationBridge.wsUrl,
            serverUrl: integrationBridge.wsUrl,
            bridgeUrl: integrationBridge.wsUrl,
            url: integrationBridge.wsUrl,
            token,
          },
          (payload) => resolve(payload),
        );
      } catch (error) {
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : '扩展连接请求发送失败',
        });
      }
    });

    if (result?.ok === false || result?.success === false || result?.error) {
      if (!options?.silent) {
        toast.error(result.error || result.message || '扩展拒绝了连接请求，请稍后重试。');
      }
      return false;
    }

    bridgeSessionSyncRef.current = syncKey;
    return true;
  }

  async function handleConnectExtension() {
    const configured = await pushBridgeSessionToExtension({ force: true });
    if (!configured) {
      return;
    }

    if (integrationBridge?.connected) {
      toast.success('扩展桥接参数已同步到扩展。');
      return;
    }

    if (!brand?.id) {
      toast.success('已向扩展发送连接请求，请稍后刷新查看连接状态。');
      return;
    }

    toast.success('已向扩展发送连接请求，正在等待扩展建立桥接连接。');

    const connected = await pollIntegrationBridgeConnection(brand.id);
    if (!connected) {
      toast.success('连接请求已经发给扩展，如果扩展刚启动，稍后点一下“刷新状态”就会同步回来。');
    }
  }

  function handleDownloadExtension() {
    if (!integrationBridge?.installUrl) {
      toast.error('当前还没有拿到扩展安装地址，请稍后再试。');
      return;
    }

    window.open(integrationBridge.installUrl, '_blank', 'noopener,noreferrer');
  }

  function handleOpenPlatformLogin(platform: IntegrationPlatform) {
    const loginUrl = integrationPlatformLoginUrl(platform.id);
    if (!loginUrl) {
      toast.error(`${platform.label} 暂时还没有配置登录地址。`);
      return;
    }

    window.open(loginUrl, '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    const nextDrawer = searchParams.get('drawer');
    if (
      nextDrawer === 'integrations' ||
      nextDrawer === 'tasks' ||
      nextDrawer === 'assets' ||
      nextDrawer === 'scheduledTasks'
    ) {
      setDrawer(nextDrawer);
      return;
    }

    if (nextDrawer === 'campaigns') {
      setDrawer('scheduledTasks');
    }
  }, [searchParams]);

  useEffect(() => {
    const oauthStatus = searchParams.get('oauth_status');
    if (!oauthStatus) {
      return;
    }

    setDrawer('integrations');
    const message =
      searchParams.get('message') ||
      (oauthStatus === 'success' ? '授权成功' : '授权失败，请稍后重试。');
    if (oauthStatus === 'success') {
      toast.success(message);
    } else {
      toast.error(message);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!brand?.id) {
      threadTitleRequestKeysRef.current.clear();
      setIntegrationBridge(null);
      setIntegrationConnections([]);
      setIntegrationLoading(false);
      setIntegrationRefreshing(false);
      setThreads([]);
      setActiveThreadId(DEFAULT_THREAD_ID);
      setMessages([]);
      setMode('chat');
      setUploadedAssets([]);
      setUploadStatus(null);
      setActiveArticleArtifact(null);
      return;
    }

    threadTitleRequestKeysRef.current.clear();
    const restored = normalizeHistory(window.localStorage.getItem(historyStorageKey(brand.id)));
    const nextThreads =
      restored.threads.length > 0
        ? restored.threads
        : [
            {
              id: DEFAULT_THREAD_ID,
              messages: restored.messages,
              updatedAt: Date.now(),
              mode: restored.mode,
            },
          ].filter((item) => item.messages.length > 0 || item.id === DEFAULT_THREAD_ID);

    setThreads(nextThreads);
    restoreThreadState(restored.activeThreadId || DEFAULT_THREAD_ID, nextThreads);
  }, [brand?.id]);

  useEffect(() => {
    if (!brand?.id) {
      return;
    }

    const brandId = brand.id;
    let cancelled = false;
    const shouldNotifyError = drawer === 'integrations';

    async function loadIntegrationStatus() {
      if (!cancelled) {
        setIntegrationLoading(true);
      }

      try {
        const response = await fetch(
          `/api/backend/monitor/brands/${encodeURIComponent(brandId)}/platform-data/status`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          bridge?: unknown;
          connections?: unknown[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message || '集成状态加载失败，请稍后重试。');
        }

        if (!cancelled) {
          setIntegrationBridge(normalizeIntegrationBridgeSession(payload.bridge));
          setIntegrationConnections(
            Array.isArray(payload.connections)
              ? payload.connections
                  .map(normalizeCreatorPlatformConnection)
                  .filter((value): value is CreatorPlatformConnection => !!value)
              : [],
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setIntegrationBridge(null);
          setIntegrationConnections([]);
          if (shouldNotifyError) {
            toast.error(loadError instanceof Error ? loadError.message : '集成状态加载失败，请稍后重试。');
          }
        }
      } finally {
        if (!cancelled) {
          setIntegrationLoading(false);
        }
      }
    }

    void loadIntegrationStatus();

    return () => {
      cancelled = true;
    };
  }, [brand?.id, drawer]);

  useEffect(() => {
    if (!integrationBridge?.publicId || !integrationBridge.wsUrl) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      if (cancelled) {
        return;
      }

      const configured = await pushBridgeSessionToExtension({ silent: true });
      attempts += 1;

      if (!configured && attempts < 5 && !cancelled) {
        timer = setTimeout(() => {
          void sync();
        }, 1200);
      }
    };

    void sync();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [integrationBridge?.publicId, integrationBridge?.wsUrl]);

  useEffect(() => {
    if (!brand?.id || !activeThreadId) {
      return;
    }

    setThreads((current) =>
      upsertStoredThread(current, {
        id: activeThreadId,
        messages: messages.slice(-200),
        updatedAt: Date.now(),
        mode,
      }),
    );
  }, [activeThreadId, brand?.id, messages, mode]);

  useEffect(() => {
    if (!brand?.id) {
      return;
    }

    window.localStorage.setItem(
      historyStorageKey(brand.id),
      JSON.stringify(serializeHistory(threads, activeThreadId)),
    );
  }, [activeThreadId, brand?.id, threads]);

  useEffect(() => {
    if (!brand?.id || chatBusy) {
      return;
    }

    const activeThread = threads.find((item) => item.id === activeThreadId);
    if (!activeThread || !shouldGenerateAiThreadTitle(activeThread)) {
      return;
    }

    const latestTitleMessage = [...activeThread.messages]
      .reverse()
      .find((item) => shouldIncludeMessageInThreadTitleHistory(item));
    const requestKey = `${activeThread.id}:${activeThread.messages.length}:${latestTitleMessage?.id || 'none'}`;
    if (threadTitleRequestKeysRef.current.has(requestKey)) {
      return;
    }

    const activeBrandId = brand.id;
    const threadForTitle = activeThread;
    const titleRequestPayload = buildThreadTitleRequestPayload(threadForTitle);
    threadTitleRequestKeysRef.current.add(requestKey);
    let cancelled = false;

    async function generateThreadTitle() {
      try {
        const response = await fetch('/api/miaoshe-chat?title=1', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            brandId: activeBrandId,
            locale,
            workspaceContext,
            ...titleRequestPayload,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          title?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message || '会话标题生成失败');
        }

        const nextTitle = String(payload.title || '').trim();
        if (!nextTitle || cancelled) {
          return;
        }

        setThreads((current) => {
          const target = current.find((item) => item.id === threadForTitle.id);
          if (!target || target.title?.trim()) {
            return current;
          }
          return upsertStoredThread(current, {
            ...target,
            title: nextTitle,
          });
        });
      } catch (error) {
        console.error('Failed to generate Miaoshe thread title', error);
      }
    }

    void generateThreadTitle();

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, brand?.id, chatBusy, threads, workspaceContext]);

  useEffect(() => {
    const container = threadRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages, chatBusy]);

  useEffect(() => {
    let cancelled = false;

    async function loadActivities() {
      if (!brand?.id) {
        if (!cancelled) {
          setActivities([]);
          setActivitiesLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setActivitiesLoading(true);
      }

      try {
        const params = new URLSearchParams({
          brandId: brand.id,
          limit: '100',
        });
        const response = await fetch(`/api/miaoshe-chat?activities=1&${params.toString()}`, {
          cache: 'no-store',
        });
        const result = (await response.json().catch(() => null)) as
          | { opportunities?: ContentOpportunity[]; total?: number; message?: string }
          | null;
        if (!response.ok) {
          throw new Error(result?.message || 'Failed to load opportunities');
        }
        if (!cancelled) {
          setActivities(Array.isArray(result?.opportunities) ? result.opportunities : []);
        }
      } catch (loadError) {
        console.error('Failed to load miaoshe scheduled tasks', loadError);
        if (!cancelled) {
          setActivities([]);
        }
      } finally {
        if (!cancelled) {
          setActivitiesLoading(false);
        }
      }
    }

    void loadActivities();

    return () => {
      cancelled = true;
    };
  }, [brand?.id]);

  useEffect(() => {
    if (!brand?.id) {
      setGeneratedAssets([]);
      setAssetsError(null);
      setAssetsLoading(false);
      return;
    }

    const shouldLoadAssets = drawer === 'assets' || editorOpen;
    if (!shouldLoadAssets) {
      return;
    }

    const brandId = brand.id;
    let cancelled = false;
    const cached = loadGeneratedAssets()
      .map(normalizeGeneratedAsset)
      .filter((value): value is UploadedAsset => !!value);

    if (cached.length) {
      setGeneratedAssets((current) => mergeGeneratedAssets(current, cached));
    }

    async function loadAssets() {
      setAssetsLoading(true);
      setAssetsError(null);

      try {
        const response = await fetch(
          `/api/miaoshe-chat?brandId=${encodeURIComponent(brandId)}&assets=1&limit=200`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          assets?: unknown[];
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message || '素材加载失败，请稍后重试。');
        }

        const remoteAssets = Array.isArray(payload.assets)
          ? payload.assets
              .map(normalizeGeneratedAsset)
              .filter((value): value is UploadedAsset => !!value)
          : [];
        const merged = mergeGeneratedAssets(loadGeneratedAssets(), remoteAssets);
        saveGeneratedAssets(merged);

        if (!cancelled) {
          setGeneratedAssets(merged);
        }
      } catch (loadError) {
        if (!cancelled) {
          setGeneratedAssets(cached);
          setAssetsError(
            loadError instanceof Error ? loadError.message : '素材加载失败，请稍后重试。',
          );
        }
      } finally {
        if (!cancelled) {
          setAssetsLoading(false);
        }
      }
    }

    void loadAssets();

    return () => {
      cancelled = true;
    };
  }, [assetsReloadKey, brand?.id, drawer, editorOpen]);

  function persistArticleArtifact(next: ArticleArtifact, preferredMessageId?: string) {
    if (scopeKey) {
      saveArtifact(scopeKey, next);
    }
    setActiveArticleArtifact(next);
    setMessages((current) => renderArticleIntoConversation(current, next, preferredMessageId));
  }

  function resolveLatestArticleArtifact() {
    if (activeArticleArtifact?.title && activeArticleArtifact?.markdown) {
      return activeArticleArtifact;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const candidate = messages[index]?.articleArtifact;
      if (candidate?.title && candidate?.markdown) {
        return candidate;
      }
    }

    return null;
  }

  function persistMediaArtifact(next: MediaArtifact, preferredMessageId?: string) {
    if (scopeKey && next.kind !== 'image') {
      saveMediaArtifact(scopeKey, next);
    } else if (scopeKey) {
      saveMediaArtifact(scopeKey, null);
    }
    const derivedAssets = assetsFromMediaArtifact(next);
    setMessages((current) => {
      const withAttachments =
        next.kind === 'image' && derivedAssets.length > 0
          ? renderAttachmentsIntoConversation(current, derivedAssets, preferredMessageId)
          : current;
      return next.kind === 'image'
        ? withAttachments.map((item) =>
            item.id === preferredMessageId ? { ...item, mediaArtifact: undefined } : item,
          )
        : renderMediaIntoConversation(withAttachments, next, preferredMessageId);
    });
    if (derivedAssets.length) {
      setGeneratedAssets((current) => {
        const merged = mergeGeneratedAssets(current, derivedAssets);
        saveGeneratedAssets(merged);
        return merged;
      });
    }
  }

  async function copyArticleArtifact(artifact: ArticleArtifact | null) {
    if (!artifact) {
      return;
    }
    const body =
      artifact.format === 'html'
        ? stripArticleMarkup(artifact.markdown, 'html').replace(/\n{3,}/g, '\n\n').trim()
        : artifact.markdown;
    const text = [`# ${artifact.title || '未命名文章'}`, body].filter(Boolean).join('\n\n').trim();
    await navigator.clipboard.writeText(text);
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    if (!brand?.id) {
      toast.error('请先选择品牌，再上传文件。');
      return;
    }

    setUploadBusy(true);
    setUploadStatus('正在上传中...');

    try {
      const formData = new FormData();
      Array.from(files)
        .slice(0, 50)
        .forEach((file) => formData.append('files', file, file.webkitRelativePath || file.name));

      const response = await fetch(`/api/miaoshe-chat?brandId=${encodeURIComponent(brand.id)}&upload=1`, {
        method: 'POST',
        body: formData,
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        assets?: unknown[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || '文件上传失败');
      }

      const nextAssets = Array.isArray(payload.assets)
        ? payload.assets.map(normalizeUploadedAsset).filter((value): value is UploadedAsset => !!value)
        : [];

      if (nextAssets.length === 0) {
        setUploadStatus('没有文件上传成功');
        return;
      }

      setUploadedAssets((current) => {
        const merged = new Map(current.map((item) => [item.url, item]));
        for (const item of nextAssets) {
          merged.set(item.url, item);
        }
        return Array.from(merged.values()).slice(-50);
      });
      setUploadStatus(null);
    } catch (uploadError) {
      setUploadStatus(uploadError instanceof Error ? uploadError.message : '文件上传失败');
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function consumeEventStream(
    response: Response,
    onEvent: (eventName: string, payload: unknown) => void,
  ) {
    if (!response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split(/\r?\n/);
        const eventName = (lines.find((line) => line.startsWith('event:')) || '').slice(6).trim();
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!eventName || !data) continue;

        try {
          onEvent(eventName, JSON.parse(data));
        } catch (parseError) {
          console.error('Failed to parse miaoshe stream event', parseError);
        }
      }
    }
  }

  async function handleSend(
    nextValue?:
      | string
      | {
          message: string;
          displayMessage?: string;
          modeOverride?: ChatMode;
          executeConfirmed?: boolean;
          articleArtifactOverride?: ArticleArtifact | null;
        },
  ) {
    const payload =
      typeof nextValue === 'string'
        ? { message: nextValue, displayMessage: nextValue }
        : nextValue || { message: draft, displayMessage: draft };
    const message = payload.message.trim();
    const displayMessage = (payload.displayMessage ?? payload.message).trim() || message;
    const requestMode = payload.modeOverride || mode;
    if (!message || chatBusy) {
      return;
    }

    if (!brand?.id) {
      toast.error('请先选择品牌，再开始和 MiaoShe Chat 对话。');
      return;
    }

    const attachments = uploadedAssets.filter((item) => item.url);
    const history = selectHistoryMessagesForContext(messages);
    const latestArticleArtifact = payload.articleArtifactOverride || resolveLatestArticleArtifact();
    const clientMessageId = attachments.length ? createClientMessageId() : '';
    const nextUserOrdinal = messages.filter((item) => item.role === 'user').length + 1;
    const liveAssistantId = createMessageId();

    if (clientMessageId) {
      rememberUploadBinding(brand.id, activeThreadId, clientMessageId, nextUserOrdinal);
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: displayMessage,
      timestamp: Date.now(),
      attachments,
      clientMessageId: clientMessageId || undefined,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    if (requestMode !== mode) {
      setMode(requestMode);
    }
    setChatBusy(true);
    setStreamingAssistantId(liveAssistantId);
    setMessages((current) => [
      ...current,
      {
        id: liveAssistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      },
    ]);
    if (codexStatusTimerRef.current) {
      clearTimeout(codexStatusTimerRef.current);
    }
    setCodexRunState({
      phase: 'thinking',
      label: 'miaoshechat 正在推理',
      detail: requestMode === 'agent' ? '正在规划任务执行路径...' : '正在整理上下文并生成回复...',
      updatedAt: Date.now(),
    });

    let streamingArticle: ArticleArtifact | null = null;
    let streamError: Error | null = null;
    let bufferedAssistantContent = '';
    let pendingAssistantDelta = '';

    const upsertAssistantMessage = (patch: Partial<ChatMessage>) => {
      setMessages((current) => {
        const index = current.findIndex((item) => item.id === liveAssistantId);
        const existing = index >= 0 ? current[index] : null;
        const nextMessage: ChatMessage = {
          id: existing?.id || liveAssistantId,
          role: 'assistant',
          content: typeof patch.content === 'string' ? patch.content : existing?.content || '',
          timestamp:
            typeof patch.timestamp === 'number'
              ? patch.timestamp
              : existing?.timestamp || Date.now(),
          articleArtifact: patch.articleArtifact ?? existing?.articleArtifact,
          mediaArtifact: patch.mediaArtifact ?? existing?.mediaArtifact,
          attachments: patch.attachments ?? existing?.attachments,
          clientMessageId: existing?.clientMessageId,
          confirmationRequest: patch.confirmationRequest ?? existing?.confirmationRequest,
        };

        if (index >= 0) {
          const next = current.slice();
          next[index] = nextMessage;
          return next;
        }

        return [...current, nextMessage];
      });
    };

    const flushAssistantStream = (finalContent?: string) => {
      if (streamRenderTimerRef.current) {
        clearTimeout(streamRenderTimerRef.current);
        streamRenderTimerRef.current = null;
      }

      if (typeof finalContent === 'string') {
        bufferedAssistantContent = finalContent;
        pendingAssistantDelta = '';
        upsertAssistantMessage({
          content: finalContent,
          timestamp: Date.now(),
        });
        return;
      }

      if (!pendingAssistantDelta) {
        return;
      }

      bufferedAssistantContent += pendingAssistantDelta;
      pendingAssistantDelta = '';
      upsertAssistantMessage({
        content: bufferedAssistantContent,
        timestamp: Date.now(),
      });
    };

    const drainAssistantStream = () => {
      if (!pendingAssistantDelta) {
        streamRenderTimerRef.current = null;
        return;
      }

      const step =
        pendingAssistantDelta.length > 320
          ? 4
          : pendingAssistantDelta.length > 180
            ? 3
            : pendingAssistantDelta.length > 72
              ? 2
              : 1;
      const nextChunk = takeTypingChars(pendingAssistantDelta, step);
      pendingAssistantDelta = dropTypingChars(pendingAssistantDelta, step);
      bufferedAssistantContent += nextChunk;

      upsertAssistantMessage({
        content: bufferedAssistantContent,
        timestamp: Date.now(),
      });

      streamRenderTimerRef.current = setTimeout(
        drainAssistantStream,
        pendingAssistantDelta.length > 220 ? 10 : pendingAssistantDelta.length > 80 ? 14 : 22,
      );
    };

    const queueAssistantDelta = (delta: string, fullContent?: string) => {
      const normalizedDelta = delta || '';
      const snapshot = bufferedAssistantContent + pendingAssistantDelta;
      const derivedDelta =
        normalizedDelta ||
        (typeof fullContent === 'string' && fullContent.startsWith(snapshot)
          ? fullContent.slice(snapshot.length)
          : '');

      if (!derivedDelta) {
        if (typeof fullContent === 'string' && fullContent && fullContent !== snapshot) {
          flushAssistantStream(fullContent);
        }
        return;
      }

      pendingAssistantDelta += derivedDelta;
      if (!streamRenderTimerRef.current) {
        drainAssistantStream();
      }
    };

    try {
      const response = await fetch('/api/miaoshe-chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: brand.id,
          mode: requestMode,
          executeConfirmed: Boolean(payload.executeConfirmed),
          threadId: activeThreadId,
          clientMessageId,
          displayMessage,
          message,
          locale,
          history,
          workspaceContext,
          uploadedImages: attachments
            .filter((item) => item.type === 'image')
            .map((item) => ({
              url: item.url,
              title: item.title,
              mimeType: item.mimeType,
            })),
          uploadedAttachments: attachments.map((item) => ({
            url: item.url,
            thumbnailUrl: item.thumbnailUrl || item.url,
            title: item.title,
            mimeType: item.mimeType,
            type: item.type === 'file' ? 'file' : item.type === 'video' ? 'video' : 'image',
          })),
          latestArticleArtifact: latestArticleArtifact
            ? {
                title: latestArticleArtifact.title,
                markdown: latestArticleArtifact.markdown,
                format: latestArticleArtifact.format,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message || 'MiaoShe Chat 暂时没能响应，请稍后重试。');
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        await consumeEventStream(response, (eventName, payload) => {
          const event = payload as
            | {
                artifact?: unknown;
                delta?: string;
                content?: string;
                markdown?: string;
                html?: string;
                title?: string;
                format?: string;
                phase?: string;
                label?: string;
                detail?: string;
                assistantMessage?: AssistantResponse['assistantMessage'];
              }
            | null;

          if (eventName === 'status') {
            const phase = String(event?.phase || '').trim().toLowerCase();
            if (phase === 'thinking') {
              setCodexRunState({
                phase: 'thinking',
                label:
                  typeof event?.label === 'string' && event.label.trim()
                    ? event.label
                    : 'miaoshechat 正在推理',
                detail:
                  typeof event?.detail === 'string' && event.detail.trim()
                    ? event.detail
                    : requestMode === 'agent'
                      ? '正在规划任务执行路径...'
                      : '正在整理上下文并生成回复...',
                updatedAt: Date.now(),
              });
            }
            if (phase === 'completed') {
              setCodexRunState({
                phase: 'completed',
                label:
                  typeof event?.label === 'string' && event.label.trim()
                    ? event.label
                    : 'miaoshechat 已完成',
                detail:
                  typeof event?.detail === 'string' && event.detail.trim()
                    ? event.detail
                    : '回复已经返回。',
                updatedAt: Date.now(),
              });
            }
            return;
          }

          if (eventName === 'message_delta') {
            const nextDelta = typeof event?.delta === 'string' ? event.delta : '';
            const nextContent = typeof event?.content === 'string' ? event.content : '';
            if (nextDelta || nextContent) {
              queueAssistantDelta(nextDelta, nextContent);
            }
            return;
          }

          if (eventName === 'article_artifact_start' && event?.artifact) {
            const initialArtifact = normalizeArticleArtifact(event.artifact) || {
              title: '未命名文章',
              markdown: '',
              format: 'markdown' as MiaosheArtifactFormat,
            };
            streamingArticle = {
              ...initialArtifact,
              streaming: true,
            };
            persistArticleArtifact(streamingArticle, liveAssistantId);
            upsertAssistantMessage({ articleArtifact: streamingArticle });
            return;
          }

          if (eventName === 'article_artifact_delta' && event) {
            const delta = typeof event.delta === 'string' ? event.delta : '';
            const fullMarkdown =
              typeof event.markdown === 'string'
                ? event.markdown
                : typeof event.html === 'string'
                  ? event.html
                  : '';
            const title =
              String(event.title || streamingArticle?.title || activeArticleArtifact?.title || '未命名文章');
            const format =
              String(event.format || streamingArticle?.format || activeArticleArtifact?.format || '')
                .trim()
                .toLowerCase() === 'html'
                ? 'html'
                : inferArtifactFormat(
                    fullMarkdown ||
                      delta ||
                      streamingArticle?.markdown ||
                      activeArticleArtifact?.markdown ||
                      '',
                  );
            const markdown = fullMarkdown || `${streamingArticle?.markdown || ''}${delta}`;
            streamingArticle = {
              title,
              markdown,
              format,
              streaming: true,
            };
            persistArticleArtifact(streamingArticle, liveAssistantId);
            upsertAssistantMessage({ articleArtifact: streamingArticle });
            return;
          }

          if (
            (eventName === 'article_artifact_done' || eventName === 'article_artifact') &&
            event?.artifact
          ) {
            const completedArtifact = normalizeArticleArtifact(event.artifact);
            if (completedArtifact) {
              streamingArticle = {
                ...completedArtifact,
                streaming: false,
              };
              persistArticleArtifact(streamingArticle, liveAssistantId);
              upsertAssistantMessage({ articleArtifact: streamingArticle });
            }
            return;
          }

          if (eventName === 'media_artifact' && event?.artifact) {
            const mediaArtifact = normalizeMediaArtifact(event.artifact);
            if (mediaArtifact) {
              persistMediaArtifact(mediaArtifact, liveAssistantId);
              upsertAssistantMessage({
                mediaArtifact: mediaArtifact.kind === 'image' ? undefined : mediaArtifact,
              });
            } else if (scopeKey) {
              saveMediaArtifact(scopeKey, null);
              upsertAssistantMessage({ mediaArtifact: undefined });
            }
            return;
          }

          if (eventName === 'error') {
            streamError = new Error(
              typeof (payload as { message?: string } | null)?.message === 'string' &&
                (payload as { message?: string }).message?.trim()
                ? (payload as { message?: string }).message!.trim()
                : 'MiaoShe Chat 暂时没能响应，请稍后重试。',
            );
            return;
          }

          if (eventName === 'done') {
            flushAssistantStream(
              typeof event?.assistantMessage?.content === 'string'
                ? event.assistantMessage.content
                : undefined,
            );
            const assistant = event?.assistantMessage;
            const assistantContent =
              typeof assistant?.content === 'string' ? assistant.content : '';
            const articleArtifact = normalizeArticleArtifact(assistant?.articleArtifact);
            const mediaArtifact = normalizeMediaArtifact(assistant?.mediaArtifact);
            const confirmationRequest = normalizeConfirmationRequest(assistant?.confirmationRequest);

            if (articleArtifact) {
              persistArticleArtifact(articleArtifact, liveAssistantId);
            }
            if (mediaArtifact) {
              persistMediaArtifact(mediaArtifact, liveAssistantId);
            } else if (scopeKey) {
              saveMediaArtifact(scopeKey, null);
            }

            upsertAssistantMessage({
              content: assistantContent,
              timestamp:
                typeof assistant?.timestamp === 'number' && Number.isFinite(assistant.timestamp)
                  ? assistant.timestamp
                  : Date.now(),
              articleArtifact:
                requestMode === 'agent' ? articleArtifact || streamingArticle || undefined : undefined,
              mediaArtifact:
                mediaArtifact && mediaArtifact.kind !== 'image' ? mediaArtifact : undefined,
              confirmationRequest: confirmationRequest || undefined,
            });

            setCodexRunState({
              phase: 'completed',
              label: 'miaoshechat 已完成',
              detail: '回复已经返回。',
              updatedAt: Date.now(),
            });
          }
        });
        if (streamError) {
          throw streamError;
        }
      } else {
        const payload = (await response.json().catch(() => ({}))) as AssistantResponse;
        if (!payload.assistantMessage) {
          throw new Error(payload.message || 'MiaoShe Chat 暂时没能响应，请稍后重试。');
        }

        const assistantContent =
          typeof payload.assistantMessage.content === 'string'
            ? payload.assistantMessage.content
            : '';
        const articleArtifact = normalizeArticleArtifact(payload.assistantMessage.articleArtifact);
        const mediaArtifact = normalizeMediaArtifact(payload.assistantMessage.mediaArtifact);
        const confirmationRequest = normalizeConfirmationRequest(
          payload.assistantMessage.confirmationRequest,
        );

        if (articleArtifact) {
          persistArticleArtifact(articleArtifact, liveAssistantId);
        }
        if (mediaArtifact) {
          persistMediaArtifact(mediaArtifact, liveAssistantId);
        } else if (scopeKey) {
          saveMediaArtifact(scopeKey, null);
        }

        upsertAssistantMessage({
          content: assistantContent,
          timestamp:
            typeof payload.assistantMessage.timestamp === 'number' &&
            Number.isFinite(payload.assistantMessage.timestamp)
              ? payload.assistantMessage.timestamp
              : Date.now(),
          articleArtifact: requestMode === 'agent' ? articleArtifact || undefined : undefined,
          mediaArtifact: mediaArtifact && mediaArtifact.kind !== 'image' ? mediaArtifact : undefined,
          confirmationRequest: confirmationRequest || undefined,
        });

        setCodexRunState({
          phase: 'completed',
          label: 'miaoshechat 已完成',
          detail: '回复已经返回。',
          updatedAt: Date.now(),
        });
      }

      setUploadedAssets([]);
      setUploadStatus(null);
    } catch (sendError) {
      flushAssistantStream();
      setCodexRunState({
        phase: 'failed',
        label: 'miaoshechat 运行失败',
        detail:
          sendError instanceof Error
            ? sendError.message
            : 'MiaoShe Chat 暂时没能响应，请稍后重试。',
        updatedAt: Date.now(),
      });
      toast.error(
        sendError instanceof Error ? sendError.message : 'MiaoShe Chat 暂时没能响应，请稍后重试。',
      );
    } finally {
      flushAssistantStream();
      setChatBusy(false);
      setStreamingAssistantId(null);
      codexStatusTimerRef.current = setTimeout(() => {
        setCodexRunState({
          phase: 'idle',
          label: '',
          updatedAt: Date.now(),
        });
      }, 2600);
    }
  }

  async function handlePublishArticle(article: ArticleArtifact) {
    if (chatBusy) {
      toast.error('AI 正在处理中，请等当前回复完成后再发布。');
      return;
    }

    const connectedPlatforms = publishPlatforms.filter((item) => item.status === 'connected');
    const platformLabels = connectedPlatforms.map((item) => item.label).filter(Boolean);
    const publishTitle = article.title?.trim() || '未命名文章';
    const articleBody = stripArticleMarkup(article.markdown, article.format)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const publishPrompt = [
      '请立即处理这篇文章的发布任务。',
      `标题：${publishTitle}`,
      `摘要：${plainPreview(article) || '请根据正文自动提炼合适摘要。'}`,
      '发布时间：立即发布',
      `目标平台：${platformLabels.length ? platformLabels.join('、') : '请先根据当前已连接能力判断可发布平台'}`,
      '请优先检查这些平台的登录状态、桥接状态和可发布性；如果信息足够，就继续执行发布流程。',
      '正文：',
      articleBody,
    ]
      .filter(Boolean)
      .join('\n\n');

    setPublishBusy(true);
    try {
      setEditorOpen(false);
      await handleSend({
        displayMessage: ['请立即处理这篇文章的发布任务。', `文章标题：${publishTitle}`].join('\n'),
        message: publishPrompt,
        articleArtifactOverride: article,
      });
      toast.success(
        `已将发布任务发送给 AI${platformLabels.length ? `：${platformLabels.join('、')}` : '。'}`,
      );
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleAgentConfirmation(request: AgentConfirmationRequest, messageId: string) {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              confirmationRequest: undefined,
            }
          : item,
      ),
    );

    await handleSend({
      displayMessage: `确认切换到 Agent 模式并执行任务\n${request.title}`,
      message: request.message,
      modeOverride: 'agent',
      executeConfirmed: true,
    });
  }

  function handleResetConversation() {
    handleCreateThread();
  }

  return (
    <div className="miaoshe-chat-shell relative h-full min-h-0 overflow-hidden bg-white">
      {mode === 'agent' ? (
        <>
          <div className="aurora-agent-border-glow" aria-hidden="true" />
          <div className="aurora-agent-border" aria-hidden="true" />
        </>
      ) : null}

      <div className="miaoshe-chat-shell__frame relative flex h-full min-h-0 overflow-hidden bg-white text-slate-900">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void handleFileUpload(event.target.files)}
        />

        <aside className="miaoshe-chat-shell__sidebar hidden h-full w-[286px] shrink-0 border-r border-slate-200 bg-white xl:flex xl:flex-col">
        <div className="px-5 pb-5 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{copy.conversationTitle}</h2>
            <button
              type="button"
              onClick={handleResetConversation}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label={copy.newConversation}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-7">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9bb0d8]" />
            <Input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder={copy.searchConversations}
              className="miaoshe-chat-shell__search h-11 rounded-[18px] border-[#d8e4fb] pl-11 text-[13px] text-slate-700 placeholder:text-[#b7c6e3]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <p className="miaoshe-chat-shell__history-heading mb-4 text-xs font-medium text-[#c1cce1]">{copy.recent}</p>
          <div className="space-y-4">
            {filteredConversations.length ? (
              filteredConversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    item.id.startsWith('starter-') ? setDraft(item.fullText) : handleSelectThread(item.id)
                  }
                  className={cn(
                    'miaoshe-chat-shell__history-item block w-full rounded-2xl px-3 py-2 text-left transition-colors hover:bg-slate-50',
                    !item.id.startsWith('starter-') &&
                      item.id === activeThreadId &&
                      'bg-slate-100 miaoshe-chat-shell__history-item--active',
                  )}
                >
                  <div className="miaoshe-chat-shell__history-title text-[13px] font-semibold tracking-tight text-[#364968]">
                    {item.title}
                  </div>
                  <div className="miaoshe-chat-shell__history-meta mt-1 text-[11px] text-[#b7c6df]">
                    {formatConversationListTimestamp(item.updatedAt) || `${item.count} ${copy.messages}`}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-[13px] text-slate-400">
                {historyQuery.trim() ? copy.noMatches : copy.noHistory}
              </div>
            )}
          </div>
        </div>
      </aside>

        <div className="miaoshe-chat-shell__main flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="min-h-0 flex-1 overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 py-8 lg:px-10">
              <div className="mx-auto flex w-full max-w-[1040px] flex-col items-center text-center">
                <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  MIAOSHE CHAT
                </p>
                <h1 className="mt-6 max-w-[700px] text-[24px] font-semibold tracking-tight text-slate-950 md:text-[32px] xl:text-[38px]">
                  {copy.headline}
                </h1>

                <div className="mt-7 space-y-3 text-[13px] leading-6 text-slate-500 md:text-[14px] md:leading-6">
                  {copy.welcome.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>

                <div className="mt-9">
                  <p className="mb-4 text-[13px] text-slate-400">{copy.startersLabel}</p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {copy.starterPrompts.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setDraft(item)}
                        className={cn(
                          'rounded-full border border-[#dbe5f5] px-4 py-2.5 text-[12px] text-slate-600 transition-colors hover:border-[#c8d7f2] hover:bg-slate-50 hover:text-slate-900 md:text-[13px]',
                          draft === item && 'border-[#b8caee] bg-slate-50 text-slate-900',
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div ref={threadRef} className="miaoshe-chat-shell__thread h-full overflow-y-auto px-6 py-6">
              <div className="flex w-full flex-col">
                <div className="space-y-6">
                  {messages.map((item) => (
                    <div key={item.id} className="w-full">
	                      {(() => {
	                        const isStreamingMessage =
	                          item.role === 'assistant' &&
	                          chatBusy &&
	                          streamingAssistantId === item.id;
	                        const inlineRunState =
	                          isStreamingMessage && codexRunState.phase === 'thinking'
	                            ? codexRunState
	                            : null;

                        return (
                      <div
                        className={cn(
                          'flex flex-col gap-3',
                          item.role === 'user'
                            ? 'ml-auto max-w-[calc(100%-48px)] items-end text-right'
                            : 'max-w-[calc(100%-48px)]',
                        )}
                      >
                        <div
                          className={cn(
                            'flex items-center gap-2 text-[10px] font-medium text-slate-400',
                            item.role === 'user' && 'justify-end',
                          )}
                        >
                          <span>{item.role === 'user' ? copy.you : 'MiaoShe Chat'}</span>
                          <span>
                            {new Date(item.timestamp).toLocaleTimeString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {inlineRunState ? <CodexRunFeedback state={inlineRunState} /> : null}

                        {item.attachments?.length ? <MessageAttachmentGallery attachments={item.attachments} /> : null}

	                        {item.content.trim() ? (
	                          item.role === 'assistant' ? (
	                            <div className="space-y-2">
	                              <Markdown className="prose prose-slate max-w-none text-[15px] leading-7 prose-headings:mb-3 prose-headings:mt-5 prose-p:my-0 prose-p:text-[15px] prose-p:leading-7 prose-li:my-1 prose-li:text-[15px] prose-li:leading-7 prose-pre:my-4 prose-table:my-4 prose-td:align-top prose-th:align-top">
                                {item.content}
                              </Markdown>
                              {isStreamingMessage ? (
                                <span
                                  aria-hidden="true"
                                  className="inline-block h-5 w-[2px] animate-pulse rounded-full bg-slate-400"
                                />
                              ) : null}
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
                              {item.content}
                            </div>
                          )
                        ) : null}

                        {item.confirmationRequest ? (
                          <div className="miaoshe-chat-shell__confirmation rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">
                                {item.confirmationRequest.title}
                              </p>
                              <p className="text-sm leading-6 text-slate-500">
                                {item.confirmationRequest.description}
                              </p>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                              <Button
                                type="button"
                                className="h-10 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                                disabled={chatBusy}
                                onClick={() =>
                                  void handleAgentConfirmation(
                                    item.confirmationRequest as AgentConfirmationRequest,
                                    item.id,
                                  )
                                }
                              >
                                {chatBusy ? '执行中...' : item.confirmationRequest.confirmLabel}
                              </Button>
                              <span className="text-xs text-slate-400">
                                执行任务前会自动切换到 Agent 模式。
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {item.articleArtifact ? (
                          <ArticleArtifactCard
                            artifact={item.articleArtifact}
                            onOpen={() => {
                              setActiveArticleArtifact(item.articleArtifact || null);
                              setEditorOpen(true);
                              setEditorTab('edit');
                            }}
                            onCopy={() => void copyArticleArtifact(item.articleArtifact || null)}
                          />
                        ) : null}

                        {item.mediaArtifact &&
                        item.mediaArtifact.kind === 'video' &&
                        item.mediaArtifact.intent !== 'video_storyboard' &&
                        !item.mediaArtifact.needsClarification ? (
                          <MediaArtifactCard
                            artifact={item.mediaArtifact}
                            onCopyPrompt={() =>
                              navigator.clipboard.writeText(item.mediaArtifact?.prompt || '')
                            }
                          />
                        ) : null}
                      </div>
                        );
                      })()}
                    </div>
                  ))}

                </div>
              </div>
            </div>
          )}
        </div>

        <div className="miaoshe-chat-shell__composer shrink-0 border-t border-slate-200 bg-white px-6 py-4 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">
            {uploadedAssets.length > 0 ? (
              <div className="mb-4 -mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex w-max snap-x snap-mandatory gap-2.5">
                  {uploadedAssets.map((asset) => (
                    <div key={asset.url} className="snap-start">
                      <ComposerAttachmentPreview
                        asset={asset}
                        onRemove={() => {
                          setUploadedAssets((current) =>
                            current.filter((item) => item.url !== asset.url),
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {uploadStatus ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  {uploadBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  <span>{uploadStatus}</span>
                </div>
              </div>
            ) : null}

            <div className="border-b border-slate-200 pb-3">
              <div className="flex flex-wrap items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="miaoshe-chat-shell__mode-trigger inline-flex h-10 items-center gap-2 rounded-full border border-[#dbe5f5] px-4 text-left text-[#425779] transition-colors hover:bg-slate-50 focus-visible:outline-none"
                    aria-label={copy.switchMode}
                  >
                    {mode === 'agent' ? (
                      <Bot className="miaoshe-chat-shell__mode-icon h-4 w-4 shrink-0 text-[#7b8faf]" />
                    ) : (
                      <Sparkles className="miaoshe-chat-shell__mode-icon h-4 w-4 shrink-0 text-[#7b8faf]" />
                    )}
                    <span className="miaoshe-chat-shell__mode-label text-[14px] font-semibold">{modeMeta.label}</span>
                    <ChevronsUpDown className="miaoshe-chat-shell__mode-chevron h-3.5 w-3.5 shrink-0 text-[#95a7c5]" />
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    className="miaoshe-chat-shell__mode-menu w-56"
                    align="start"
                    side="top"
                    sideOffset={10}
                  >
                    {copy.modeOptions.map((item) => (
                      <DropdownMenuItem
                        key={item.value}
                        onClick={() => setMode(item.value)}
                        className="miaoshe-chat-shell__mode-menu-item flex items-start gap-2 py-2"
                      >
                        <div className="flex-1">
                          <p className="miaoshe-chat-shell__mode-menu-title text-sm font-medium text-slate-900">{item.label}</p>
                          <p className="miaoshe-chat-shell__mode-menu-description text-xs leading-5 text-slate-500">{item.description}</p>
                        </div>
                        {mode === item.value ? (
                          <Check className="miaoshe-chat-shell__mode-menu-check mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-900" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {copy.drawerActions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => setDrawer(item.drawer)}
                      className="inline-flex items-center gap-2 text-[14px] font-medium text-[#7286a8] transition-colors hover:text-slate-900"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadBusy || chatBusy}
                  className="inline-flex items-center gap-2 text-[14px] font-medium text-[#7286a8] transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadBusy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                  <span>{uploadBusy ? copy.uploading : copy.attachment}</span>
                </button>
              </div>
            </div>

            <div className="flex items-end gap-4 pt-4">
              <div className="min-w-0 flex-1">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={copy.inputPlaceholder}
                  className="miaoshe-chat-shell__draft-input h-12 w-full border-0 bg-transparent px-0 text-[15px] text-slate-700 outline-none placeholder:text-slate-400"
                  disabled={chatBusy}
                />
              </div>

              <Button
                className="miaoshe-chat-shell__send-button h-12 min-w-[96px] rounded-full bg-[#8d96a8] px-5 text-sm font-semibold text-white shadow-none hover:bg-[#798296]"
                onClick={() => void handleSend()}
                disabled={chatBusy || !draft.trim()}
              >
                {chatBusy ? copy.sending : copy.send}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        </div>

        <Sheet open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
          <SheetContent
            side="right"
            className={cn(
              'miaoshe-chat-shell__sheet gap-0 p-0',
              drawer === 'integrations'
                ? 'w-full data-[side=right]:max-w-none sm:data-[side=right]:w-[min(1100px,calc(100vw-12rem))] sm:data-[side=right]:max-w-none'
                : 'w-full sm:max-w-xl',
            )}
          >
            <SheetHeader className={cn('border-b', drawer === 'integrations' ? 'px-4 py-3.5' : 'px-5 py-4')}>
              {drawer === 'integrations' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pr-10">
                  <div>
                    <SheetTitle className="miaoshe-chat-shell__integration-title text-[16px] font-semibold text-slate-900">{drawerCopy.integrations}</SheetTitle>
                    <SheetDescription className="miaoshe-chat-shell__integration-description mt-1 text-[12px] leading-5 text-slate-500">
                      先把要发布内容的平台接进来，后续就可以在对话里直接推进分发和状态同步。
                    </SheetDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadExtension}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      下载安包
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleConnectExtension()}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-slate-900 px-3.5 text-[12px] font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      {integrationBridge?.connected ? '扩展已连接' : '一键连接扩展'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRefreshIntegrations()}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                      <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', integrationRefreshing ? 'animate-spin' : '')} />
                      {integrationRefreshing ? '刷新中...' : '刷新状态'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <SheetTitle className="text-base">
                    {drawer === 'tasks'
                      ? drawerCopy.tasks
                      : drawer === 'assets'
                        ? drawerCopy.assets
                        : drawer === 'scheduledTasks'
                          ? drawerCopy.scheduledTasks
                          : drawerCopy.integrations}
                  </SheetTitle>
                  <SheetDescription className="pr-10 text-sm leading-6">
                    {drawer === 'tasks'
                      ? '这里会承接 MiaoShe Chat 帮你排出来的待执行事项、发布动作和后续复盘。'
                      : drawer === 'assets'
                        ? drawerCopy.assetsDescription
                        : drawer === 'scheduledTasks'
                          ? 'MiaoShe Chat 帮你排好的定时发布与执行事项，会按时间顺序收在这里。'
                          : '先把聊天页并回源码。平台授权与解绑动作下一步继续从运行包逻辑迁回正式源码。'}
                  </SheetDescription>
                </>
              )}
            </SheetHeader>

          <div
            className={cn(
              'flex flex-1 flex-col overflow-y-auto',
              drawer === 'integrations' ? 'miaoshe-chat-shell__integration-body bg-[#fbfcff] px-4 py-4' : 'p-5',
            )}
          >
            {drawer === 'tasks' ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center">
                <div className="w-full max-w-md px-6 py-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(160deg,#eef4ff_0%,#e7edf8_100%)] text-slate-500">
                    <ListTodo className="h-6 w-6" />
                  </div>
                  <p className="mt-5 text-lg font-semibold text-slate-900">队列空空</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    告诉 MiaoShe Chat「今天发什么」，让它先出方案。
                  </p>
                  <Button
                    className="mt-5 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800"
                    onClick={() => {
                      setDraft('今天发什么');
                      setDrawer(null);
                    }}
                  >
                    告诉 MiaoShe Chat
                  </Button>
                </div>
              </div>
            ) : null}

            {drawer === 'scheduledTasks' ? (
              activitiesLoading ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <p className="text-sm text-slate-500">加载中...</p>
                </div>
              ) : scheduledTaskTimeline.length === 0 ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(160deg,#eef4ff_0%,#e7edf8_100%)] text-slate-500">
                    <CalendarClock className="h-6 w-6" />
                  </div>
                  <p className="mt-5 text-lg font-semibold text-slate-900">暂时没有定时任务</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    让 MiaoShe Chat 帮你安排发布时间、平台节奏和后续执行动作，任务会自动收进这里。
                  </p>
                  <Button
                    className="mt-5 rounded-xl bg-slate-900 px-4 text-sm text-white hover:bg-slate-800"
                    onClick={() => {
                      setDraft('帮我安排本周的定时发布计划');
                      setDrawer(null);
                    }}
                  >
                    安排定时任务
                  </Button>
                </div>
              ) : (
                <div className="space-y-0">
                  {scheduledTaskTimeline.map((item, index) => (
                    <div key={item.id} className="relative pl-8">
                      <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-slate-900" />
                      {index !== scheduledTaskTimeline.length - 1 ? (
                        <span className="absolute left-[5px] top-5 h-[calc(100%-0.5rem)] w-px bg-slate-200" />
                      ) : null}
                      <div className="pb-6">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-400">{formatTimestamp(item.createdAt)}</p>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                              item.statusLabel === '已完成'
                                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                                : item.statusLabel === '执行中'
                                  ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                                  : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
                            )}
                          >
                            {item.statusLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {drawer === 'assets' ? (
              <div className="flex flex-1 flex-col">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{drawerCopy.generatedAssets}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {drawerCopy.generatedAssetsDescription}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setAssetsReloadKey((current) => current + 1)}
                    disabled={assetsLoading}
                  >
                    <RefreshCw className={cn('mr-1 h-3.5 w-3.5', assetsLoading && 'animate-spin')} />
                    {drawerCopy.refresh}
                  </Button>
                </div>

                {assetsError ? (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {assetsError}
                  </div>
                ) : null}

                {assetsLoading && generatedAssets.length === 0 ? (
                  <div className="flex min-h-[260px] items-center justify-center">
                    <p className="text-sm text-slate-500">{drawerCopy.loading}</p>
                  </div>
                ) : generatedAssets.length === 0 ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
                    <p className="text-sm text-slate-500">{drawerCopy.noAssets}</p>
                    <Button variant="outline" className="mt-4">
                      <Link href="/dashboard/content-management/topics">{drawerCopy.goToContent}</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {generatedAssets.map((asset) => (
                      <div
                        key={asset.url}
                        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/92 transition-colors hover:border-slate-300"
                      >
                        {asset.type === 'image' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAssetPreviewIndex(findAssetIndex(generatedImageAssets, asset));
                              setAssetPreviewVisible(true);
                            }}
                            className="block w-full text-left"
                            aria-label={`${drawerCopy.preview} ${asset.title}`}
                          >
                            <img
                              src={resolveUploadedAssetUrl(asset.thumbnailUrl || asset.url)}
                              alt={asset.title}
                              className="block aspect-square w-full object-cover"
                            />
                          </button>
                        ) : (
                          <a
                            href={resolveUploadedAssetUrl(asset.url)}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                          >
                            <div className="flex aspect-square items-center justify-center bg-slate-50">
                              {asset.type === 'video' ? (
                                <Video className="h-8 w-8 text-slate-400" />
                              ) : (
                                <FileText className="h-8 w-8 text-slate-400" />
                              )}
                            </div>
                          </a>
                        )}

                        <div className="p-3">
                          <p className="truncate text-sm font-medium text-slate-900">{asset.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {[asset.mimeType, formatTimestamp(asset.createdAt)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {generatedImagePreviewSrcList.length ? (
                  <ImagePreview
                    src={generatedImagePreviewSrcList}
                    visible={assetPreviewVisible}
                    currentIndex={clampPreviewIndex(assetPreviewIndex, generatedImagePreviewSrcList.length)}
                    onVisibleChange={setAssetPreviewVisible}
                    onChange={setAssetPreviewIndex}
                  />
                ) : null}
              </div>
            ) : null}

            {drawer === 'integrations' ? (
              <div className="miaoshe-chat-shell__integration-panel rounded-[24px] border border-[#e7edf8] bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <div className="space-y-3">
                  {integrationGroups.map((group) => (
                    <section
                      key={group.key}
                      className="miaoshe-chat-shell__integration-section rounded-[18px] border border-[#edf2fb] bg-[#fbfdff] p-2.5"
                    >
                      <div className="mb-2.5 flex items-center gap-3">
                        <span className="miaoshe-chat-shell__integration-group-label inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm">
                          {group.label}
                        </span>
                        <div className="miaoshe-chat-shell__integration-divider h-px flex-1 bg-[#e8eef8]" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-8">
                        {group.platforms.map((platform, index) => (
                          <button
                            key={platform.id}
                            type="button"
                            onClick={() => handleOpenPlatformLogin(platform)}
                            disabled={integrationLoading}
                            className={cn(
                              'miaoshe-chat-shell__integration-card flex min-h-[122px] flex-col rounded-[20px] border px-3 py-3 text-left shadow-[0_6px_18px_rgba(15,23,42,0.03)] transition-colors',
                              platform.status === 'connected'
                                ? 'miaoshe-chat-shell__integration-card--connected border-emerald-200 bg-[#f3fcf6] hover:border-emerald-300 hover:bg-[#eefaf2]'
                                : 'miaoshe-chat-shell__integration-card--idle border-[#e8eef7] bg-white hover:border-slate-300 hover:bg-slate-50',
                              integrationLoading ? 'cursor-wait opacity-70' : 'cursor-pointer',
                            )}
                          >
                            <div className="miaoshe-chat-shell__integration-card-meta mb-2 flex items-center justify-between text-[10px] font-medium text-[#c3cee2]">
                              <span>{String(platform.order).padStart(2, '0')}</span>
                              {platform.status === 'connected' ? (
                                <span className="miaoshe-chat-shell__integration-card-badge inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/10 px-1 text-[9px] font-semibold text-emerald-600">
                                  已连
                                </span>
                              ) : index !== group.platforms.length - 1 ? (
                                <ArrowRight className="h-2.5 w-2.5" />
                              ) : null}
                            </div>

                            {integrationPlatformIconSrc(platform.id) ? (
                              <div className="miaoshe-chat-shell__integration-icon-wrap mx-auto flex h-10 w-10 items-center justify-center overflow-hidden rounded-[14px] bg-[#f8fafc] shadow-[inset_0_0_0_1px_rgba(226,232,240,0.9)]">
                                <img
                                  src={integrationPlatformIconSrc(platform.id)}
                                  alt={platform.label}
                                  className="h-6 w-6 object-contain"
                                />
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] text-[11px] font-semibold shadow-sm',
                                  platform.tone,
                                )}
                              >
                                {platform.badge}
                              </div>
                            )}

                            <p className="miaoshe-chat-shell__integration-platform-title mt-2 line-clamp-2 min-h-[36px] text-center text-[12px] font-semibold leading-[18px] text-slate-700">
                              {platform.label}
                            </p>

                            <div className="mt-auto flex justify-center pt-2">
                              {platform.status === 'connected' ? (
                                <span className="miaoshe-chat-shell__integration-status-chip miaoshe-chat-shell__integration-status-chip--connected inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600">
                                  {platform.statusLabel || '已连接'}
                                </span>
                              ) : (
                                <span className="miaoshe-chat-shell__integration-status-chip miaoshe-chat-shell__integration-status-chip--idle inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                                  {integrationLoading ? '加载中' : '去登录'}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          </SheetContent>
        </Sheet>

        <ArticleEditorSheet
          open={editorOpen}
          artifact={activeArticleArtifact}
          tab={editorTab}
          generatedAssets={generatedAssets}
          assetsLoading={assetsLoading}
          publishBusy={publishBusy}
          onTabChange={setEditorTab}
          onOpenChange={setEditorOpen}
          onChange={(next) => persistArticleArtifact(next)}
          onPublish={handlePublishArticle}
        />

        <style jsx global>{`
          .dark .miaoshe-chat-shell {
            background: #101011;
            color: #f3f4f6;
          }

          .dark .miaoshe-chat-shell__frame,
          .dark .miaoshe-chat-shell__sidebar,
          .dark .miaoshe-chat-shell__main,
          .dark .miaoshe-chat-shell__thread,
          .dark .miaoshe-chat-shell__composer {
            background: #101011 !important;
            color: #f3f4f6 !important;
          }

          .dark .miaoshe-chat-shell__sidebar,
          .dark .miaoshe-chat-shell__composer,
          .dark .miaoshe-chat-shell__confirmation,
          .dark .miaoshe-chat-shell__sheet,
          .dark .miaoshe-chat-shell__dialog {
            border-color: rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell [class*='bg-white'],
          .dark .miaoshe-chat-shell [class*='bg-slate-50'],
          .dark .miaoshe-chat-shell [class*='bg-slate-100'] {
            background-color: #17171a !important;
          }

          .dark .miaoshe-chat-shell [class*='border-slate-200'],
          .dark .miaoshe-chat-shell [class*='border-slate-100'] {
            border-color: rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell [class*='text-slate-950'],
          .dark .miaoshe-chat-shell [class*='text-slate-900'],
          .dark .miaoshe-chat-shell [class*='text-slate-800'] {
            color: #fafafa !important;
          }

          .dark .miaoshe-chat-shell [class*='text-slate-700'],
          .dark .miaoshe-chat-shell [class*='text-slate-600'],
          .dark .miaoshe-chat-shell [class*='text-slate-500'] {
            color: #d4d4d8 !important;
          }

          .dark .miaoshe-chat-shell [class*='text-slate-400'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#7286a8\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#95a7c5\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#9bb0d8\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#b7c6df\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#b7c6e3\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#c1cce1\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#364968\\]'],
          .dark .miaoshe-chat-shell [class*='text-\\[\\#425779\\]'] {
            color: #a1a1aa !important;
          }

          .dark .miaoshe-chat-shell__search,
          .dark .miaoshe-chat-shell__mode-trigger {
            background: #18181b !important;
            border-color: rgba(255, 255, 255, 0.08) !important;
            color: #e4e4e7 !important;
          }

          .dark .miaoshe-chat-shell__draft-input {
            color: #f4f4f5 !important;
          }

          .dark .miaoshe-chat-shell__draft-input::placeholder {
            color: #71717a !important;
          }

          .dark .miaoshe-chat-shell__history-item:hover {
            background: rgba(255, 255, 255, 0.05) !important;
          }

          .dark .miaoshe-chat-shell__history-item--active {
            background: rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell__history-heading,
          .dark .miaoshe-chat-shell__history-title,
          .dark .miaoshe-chat-shell__integration-title,
          .dark .miaoshe-chat-shell__integration-group-label,
          .dark .miaoshe-chat-shell__integration-platform-title,
          .dark .miaoshe-chat-shell__mode-label,
          .dark .miaoshe-chat-shell__mode-menu-title,
          .dark .miaoshe-chat-shell__mode-menu-check {
            color: #fafafa !important;
          }

          .dark .miaoshe-chat-shell__history-meta,
          .dark .miaoshe-chat-shell__integration-description,
          .dark .miaoshe-chat-shell__mode-menu-description {
            color: #d4d4d8 !important;
          }

          .dark .miaoshe-chat-shell__send-button {
            background: #2a2a2f !important;
            color: #fafafa !important;
          }

          .dark .miaoshe-chat-shell__send-button:hover {
            background: #3a3a40 !important;
          }

          .dark .miaoshe-chat-shell .prose,
          .dark .miaoshe-chat-shell .prose :where(p, li, strong, em, blockquote, code, h1, h2, h3, h4, th, td) {
            color: #e5e7eb !important;
          }

          .dark .miaoshe-chat-shell .prose code {
            background: rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell__mode-icon,
          .dark .miaoshe-chat-shell__mode-chevron {
            color: #e4e4e7 !important;
          }

          .dark .miaoshe-chat-shell__mode-trigger:hover {
            background: #212125 !important;
          }

          .dark .miaoshe-chat-shell__mode-menu {
            border-color: rgba(255, 255, 255, 0.08) !important;
            background: #18181b !important;
            color: #f4f4f5 !important;
          }

          .dark .miaoshe-chat-shell__mode-menu-item {
            color: #f4f4f5 !important;
          }

          .dark .miaoshe-chat-shell__mode-menu-item:hover,
          .dark .miaoshe-chat-shell__mode-menu-item:focus {
            background: rgba(255, 255, 255, 0.06) !important;
          }

          .dark .miaoshe-chat-shell__integration-body {
            background: #121214 !important;
          }

          .dark .miaoshe-chat-shell__integration-panel {
            border-color: rgba(255, 255, 255, 0.08) !important;
            background: #17171a !important;
            box-shadow: none !important;
          }

          .dark .miaoshe-chat-shell__integration-section {
            border-color: rgba(255, 255, 255, 0.08) !important;
            background: #111113 !important;
          }

          .dark .miaoshe-chat-shell__integration-divider {
            background: rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell__integration-card {
            box-shadow: none !important;
          }

          .dark .miaoshe-chat-shell__integration-card--idle {
            border-color: rgba(255, 255, 255, 0.08) !important;
            background: #1b1b1f !important;
          }

          .dark .miaoshe-chat-shell__integration-card--idle:hover {
            border-color: rgba(255, 255, 255, 0.14) !important;
            background: #232328 !important;
          }

          .dark .miaoshe-chat-shell__integration-card--connected {
            border-color: rgba(52, 211, 153, 0.22) !important;
            background: #18201c !important;
          }

          .dark .miaoshe-chat-shell__integration-card--connected:hover {
            border-color: rgba(52, 211, 153, 0.32) !important;
            background: #1d2822 !important;
          }

          .dark .miaoshe-chat-shell__integration-card-meta {
            color: #71717a !important;
          }

          .dark .miaoshe-chat-shell__integration-card-badge {
            background: rgba(16, 185, 129, 0.16) !important;
            color: #6ee7b7 !important;
          }

          .dark .miaoshe-chat-shell__integration-icon-wrap {
            background: #27272a !important;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell__integration-status-chip--connected {
            background: rgba(16, 185, 129, 0.14) !important;
            color: #86efac !important;
          }

          .dark .miaoshe-chat-shell__integration-status-chip--idle {
            background: rgba(255, 255, 255, 0.08) !important;
            color: #d4d4d8 !important;
          }

          .dark .miaoshe-chat-shell__sheet,
          .dark .miaoshe-chat-shell__article-sheet,
          .dark .miaoshe-chat-shell__dialog {
            background: #121214 !important;
            color: #f3f4f6 !important;
          }

          .dark .miaoshe-chat-shell__sheet [class*='bg-white'],
          .dark .miaoshe-chat-shell__sheet [class*='bg-slate-50'],
          .dark .miaoshe-chat-shell__sheet [class*='bg-slate-100'],
          .dark .miaoshe-chat-shell__article-sheet [class*='bg-white'],
          .dark .miaoshe-chat-shell__article-sheet [class*='bg-slate-50'],
          .dark .miaoshe-chat-shell__article-sheet [class*='bg-slate-100'],
          .dark .miaoshe-chat-shell__dialog [class*='bg-white'],
          .dark .miaoshe-chat-shell__dialog [class*='bg-slate-50'],
          .dark .miaoshe-chat-shell__dialog [class*='bg-slate-100'] {
            background-color: #17171a !important;
          }

          .dark .miaoshe-chat-shell__sheet [class*='border-slate-200'],
          .dark .miaoshe-chat-shell__sheet [class*='border-slate-100'],
          .dark .miaoshe-chat-shell__article-sheet [class*='border-slate-200'],
          .dark .miaoshe-chat-shell__article-sheet [class*='border-slate-100'],
          .dark .miaoshe-chat-shell__dialog [class*='border-slate-200'],
          .dark .miaoshe-chat-shell__dialog [class*='border-slate-100'] {
            border-color: rgba(255, 255, 255, 0.08) !important;
          }

          .dark .miaoshe-chat-shell__sheet [class*='text-slate-950'],
          .dark .miaoshe-chat-shell__sheet [class*='text-slate-900'],
          .dark .miaoshe-chat-shell__sheet [class*='text-slate-800'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-950'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-900'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-800'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-950'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-900'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-800'] {
            color: #fafafa !important;
          }

          .dark .miaoshe-chat-shell__sheet [class*='text-slate-700'],
          .dark .miaoshe-chat-shell__sheet [class*='text-slate-600'],
          .dark .miaoshe-chat-shell__sheet [class*='text-slate-500'],
          .dark .miaoshe-chat-shell__sheet [class*='text-slate-400'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-700'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-600'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-500'],
          .dark .miaoshe-chat-shell__article-sheet [class*='text-slate-400'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-700'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-600'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-500'],
          .dark .miaoshe-chat-shell__dialog [class*='text-slate-400'] {
            color: #d4d4d8 !important;
          }
        `}</style>
      </div>
    </div>
  );
}
