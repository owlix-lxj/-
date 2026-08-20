import { NextRequest, NextResponse } from 'next/server';

import { getBackendBaseUrl } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  return new NextResponse(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const body = await request.json().catch(() => ({}));
  const brandId = body.brandId?.trim();

  if (!brandId) {
    return NextResponse.json({ message: 'brandId is required' }, { status: 400 });
  }

  const { brandId: _brandId, ...payload } = body;
  let upstream: Response;

  try {
    upstream = await fetch(
      `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(brandId)}/miaoshe-chat/stream`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: request.headers.get('cookie') ?? '',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    );
  } catch (error) {
    console.error(`[miaoshe-chat.stream] proxy failed requestId=${requestId}`, error);
    return NextResponse.json({ message: 'MiaoShe Chat 服务连接中断，请稍后重试。' }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream') && upstream.body) {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': contentType,
        'cache-control': upstream.headers.get('cache-control') ?? 'no-cache, no-transform',
        'x-accel-buffering': upstream.headers.get('x-accel-buffering') ?? 'no',
      },
    });
  }

  const responseBody = await upstream.json().catch(async () => {
    const text = await upstream.text().catch(() => '');
    return { message: text || 'MiaoShe Chat 暂时没能响应，请稍后重试。' };
  });

  if (!upstream.ok) {
    return NextResponse.json(responseBody, { status: upstream.status });
  }

  const assistantMessage = responseBody?.assistantMessage ?? {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  };

  return sseResponse([
    sse('status', { phase: 'thinking' }),
    sse('done', { assistantMessage }),
  ]);
}
