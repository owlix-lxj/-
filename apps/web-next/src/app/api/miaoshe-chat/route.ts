import { NextRequest, NextResponse } from 'next/server';

import { getBackendBaseUrl } from '@/lib/api';

function cookieHeader(request: NextRequest) {
  return request.headers.get('cookie') ?? '';
}

async function proxyJson(response: Response) {
  const contentType = response.headers.get('content-type') ?? 'application/json; charset=utf-8';
  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    status: response.status,
    headers: { 'content-type': contentType },
  });
}

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId')?.trim();
  const wantsAssets = request.nextUrl.searchParams.get('assets') === '1';
  const wantsUploads = request.nextUrl.searchParams.get('uploads') === '1';
  const wantsActivities = request.nextUrl.searchParams.get('activities') === '1';

  if (!brandId || (!wantsAssets && !wantsUploads && !wantsActivities)) {
    return NextResponse.json({ message: 'brandId is required' }, { status: 400 });
  }

  if (wantsActivities) {
    // The dashboard chat currently only needs a lightweight activity list.
    // Return an empty list instead of surfacing MCP/API-key-only errors in the browser.
    return NextResponse.json({ opportunities: [], total: 0 }, { status: 200 });
  }

  if (wantsUploads) {
    const threadId = request.nextUrl.searchParams.get('threadId')?.trim();
    if (!threadId) {
      return NextResponse.json({ uploads: [] }, { status: 200 });
    }
    const upstream = await fetch(
      `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(brandId)}/miaoshe-chat-uploads?threadId=${encodeURIComponent(threadId)}`,
      {
        method: 'GET',
        headers: { cookie: cookieHeader(request) },
        cache: 'no-store',
      },
    );

    return proxyJson(upstream);
  }

  const params = new URLSearchParams();
  const type = request.nextUrl.searchParams.get('type')?.trim();
  const limit = request.nextUrl.searchParams.get('limit')?.trim();
  if (type) params.set('type', type);
  if (limit) params.set('limit', limit);

  const upstream = await fetch(
    `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(brandId)}/media-assets${
      params.size > 0 ? `?${params}` : ''
    }`,
    {
      method: 'GET',
      headers: { cookie: cookieHeader(request) },
      cache: 'no-store',
    },
  );

  return proxyJson(upstream);
}

export async function POST(request: NextRequest) {
  const wantsLayout = request.nextUrl.searchParams.get('layout') === '1';
  const wantsTitle = request.nextUrl.searchParams.get('title') === '1';
  const uploadBrandId = request.nextUrl.searchParams.get('brandId')?.trim();
  const wantsUpload = request.nextUrl.searchParams.get('upload') === '1';
  if (wantsUpload) {
    if (!uploadBrandId) {
      return NextResponse.json({ message: 'brandId is required' }, { status: 400 });
    }
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ message: '请选择要上传的文件' }, { status: 400 });
    }
    const upstream = await fetch(
      `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(uploadBrandId)}/media-assets/upload`,
      {
        method: 'POST',
        headers: { cookie: cookieHeader(request) },
        body: formData,
        cache: 'no-store',
      },
    );

    return proxyJson(upstream);
  }

  const body = await request.json().catch(() => ({}));
  const brandId = body.brandId?.trim();
  if (!brandId) {
    return NextResponse.json({ message: 'brandId is required' }, { status: 400 });
  }

  if (wantsLayout) {
    const { brandId: _brandId, ...payload } = body;
    const upstream = await fetch(
      `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(brandId)}/miaoshe-chat/layout`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader(request),
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    );

    return proxyJson(upstream);
  }

  if (wantsTitle) {
    const { brandId: _brandId, ...payload } = body;
    const upstream = await fetch(
      `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(brandId)}/miaoshe-chat/title`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader(request),
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      },
    );

    return proxyJson(upstream);
  }

  const { brandId: _brandId, ...payload } = body;
  const upstream = await fetch(
    `${getBackendBaseUrl()}/monitor/brands/${encodeURIComponent(brandId)}/miaoshe-chat`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader(request),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  return proxyJson(upstream);
}
