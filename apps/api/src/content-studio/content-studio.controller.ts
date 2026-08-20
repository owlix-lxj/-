import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ContentStudioService } from './content-studio.service';

@UseGuards(AuthGuard)
@Controller('monitor')
export class ContentStudioController {
  constructor(private readonly contentStudioService: ContentStudioService) {}

  @Get('brands/:brandId/content-drafts')
  listDrafts(@CurrentUser() user: AuthUser, @Param('brandId') brandId: string) {
    return this.contentStudioService.listDrafts(user.sub, brandId);
  }

  @Get('brands/:brandId/content-webhook-config')
  getContentWebhookConfig(@CurrentUser() user: AuthUser, @Param('brandId') brandId: string) {
    return this.contentStudioService.getContentWebhookConfig(user.sub, brandId);
  }

  @Put('brands/:brandId/content-webhook-config')
  saveContentWebhookConfig(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body()
    body: {
      webhookUrl?: string;
      webhookSecret?: string;
      isActive?: boolean;
    },
  ) {
    return this.contentStudioService.saveContentWebhookConfig(user.sub, brandId, body);
  }

  @Post('brands/:brandId/content-drafts')
  createDraft(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body() body: { title?: string; content?: string },
  ) {
    return this.contentStudioService.createDraft(user.sub, brandId, body);
  }

  @Get('content-drafts/:draftId')
  getDraft(@CurrentUser() user: AuthUser, @Param('draftId') draftId: string) {
    return this.contentStudioService.getDraft(user.sub, draftId);
  }

  @Patch('content-drafts/:draftId')
  updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
    @Body() body: { title?: string; content?: string },
  ) {
    return this.contentStudioService.updateDraft(user.sub, draftId, body);
  }

  @Delete('content-drafts/:draftId')
  deleteDraft(@CurrentUser() user: AuthUser, @Param('draftId') draftId: string) {
    return this.contentStudioService.deleteDraft(user.sub, draftId);
  }

  @Delete('content-drafts/:draftId/messages')
  clearMessages(@CurrentUser() user: AuthUser, @Param('draftId') draftId: string) {
    return this.contentStudioService.clearMessages(user.sub, draftId);
  }

  @Post('content-drafts/:draftId/chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
    @Body()
    body: {
      message?: string;
      customContext?: string;
      title?: string;
      content?: string;
    },
  ) {
    return this.contentStudioService.chat(user.sub, draftId, body);
  }

  @Post('brands/:brandId/miaoshe-chat')
  miaosheChat(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body()
    body: {
      message?: string;
      mode?: 'chat' | 'agent';
      history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
      workspaceContext?: string;
      locale?: string;
      threadId?: string;
      clientMessageId?: string;
      displayMessage?: string;
      executeConfirmed?: boolean;
      latestArticleArtifact?: {
        title?: string;
        markdown?: string;
        format?: string;
      };
      uploadedAttachments?: Array<{
        url?: string;
        thumbnailUrl?: string;
        title?: string;
        mimeType?: string;
        type?: 'image' | 'file';
      }>;
    },
  ) {
    return this.contentStudioService.chatWithMiaoshe(user.sub, brandId, body);
  }

  @Post('brands/:brandId/miaoshe-chat/title')
  miaosheChatTitle(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body()
    body: {
      mode?: 'chat' | 'agent';
      history?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
      workspaceContext?: string;
      locale?: string;
      latestArticleArtifact?: {
        title?: string;
        markdown?: string;
        format?: string;
      };
    },
  ) {
    return this.contentStudioService.summarizeMiaosheConversationTitle(user.sub, brandId, body);
  }

  @Post('brands/:brandId/miaoshe-chat/stream')
  async streamMiaosheChat(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body() body: Parameters<ContentStudioService['chatWithMiaoshe']>[2],
    @Res() response: Response,
  ) {
    await this.contentStudioService.streamChatWithMiaoshe(user.sub, brandId, body, response);
  }

  @Post('brands/:brandId/miaoshe-chat/layout')
  miaosheSmartLayout(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body()
    body: {
      title?: string;
      markdown?: string;
      targetPlatform?: string;
    },
  ) {
    return this.contentStudioService.layoutMiaosheMarkdown(user.sub, brandId, body);
  }

  @Get('brands/:brandId/miaoshe-chat-uploads')
  listMiaosheChatUploads(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Query('threadId') threadId?: string,
  ) {
    return this.contentStudioService.listMiaosheChatUploads(user.sub, brandId, threadId);
  }

  @Get('brands/:brandId/media-assets')
  listMediaAssets(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentStudioService.listMediaAssets(user.sub, brandId, { type, limit });
  }

  @UseInterceptors(
    AnyFilesInterceptor({
      limits: {
        files: 50,
        fileSize: 20 * 1024 * 1024,
      },
    }),
  )
  @Post('brands/:brandId/media-assets/upload')
  uploadMediaAssets(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @UploadedFiles()
    files: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }>,
  ) {
    return this.contentStudioService.uploadMediaAssets(user.sub, brandId, files);
  }

  @Get('brands/:brandId/platform-data/status')
  platformDataStatus(@CurrentUser() user: AuthUser, @Param('brandId') brandId: string) {
    return this.contentStudioService.getPlatformDataStatus(user.sub, brandId);
  }

  @Get('brands/:brandId/wechat-sync-bridge-session')
  async wechatSyncBridgeSession(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
  ) {
    const status = await this.contentStudioService.getPlatformDataStatus(user.sub, brandId);
    return {
      ...status.bridge,
      session: status.bridge,
      bridge: status.bridge,
      connections: status.connections,
    };
  }

  @Post('brands/:brandId/platform-data/refresh')
  refreshPlatformData(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Body()
    body: {
      platforms?: string[];
      forceRefresh?: boolean;
    },
  ) {
    return this.contentStudioService.refreshPlatformData(user.sub, brandId, body);
  }

  @Get('brands/:brandId/platform-data/report')
  platformDataReport(
    @CurrentUser() user: AuthUser,
    @Param('brandId') brandId: string,
    @Query('platforms') platforms?: string | string[],
    @Query('days') days?: string,
  ) {
    const platformList = Array.isArray(platforms)
      ? platforms
      : typeof platforms === 'string'
        ? platforms
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    return this.contentStudioService.getPlatformDataReport(user.sub, brandId, {
      platforms: platformList,
      days,
    });
  }
}

@Controller('monitor')
export class PublicContentStudioController {
  constructor(private readonly contentStudioService: ContentStudioService) {}

  @Post('public-image/generations')
  generatePublicImage(
    @Body()
    body: {
      id?: string;
      accountId?: string;
      userId?: string;
      prompt?: string;
      size?: string;
    },
    @Req() request: Request,
  ) {
    return this.contentStudioService.generatePublicImage({
      id: body.id,
      accountId: body.accountId,
      userId: body.userId,
      prompt: body.prompt,
      size: body.size,
      ip: request.ip,
    });
  }

  @Get('public-media/:brandId/:fileName')
  async streamMiaosheMedia(
    @Param('brandId') brandId: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    await this.contentStudioService.streamPublicMiaosheMedia(brandId, fileName, response);
  }
}
