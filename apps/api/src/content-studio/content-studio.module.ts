import { Module } from '@nestjs/common';
import { ContentStudioController, PublicContentStudioController } from './content-studio.controller';
import { ContentStudioService } from './content-studio.service';
import { MysqlModule } from '../database/mysql.module';
import { OrganizationStoreModule } from '../organization-store/organization-store.module';
import { AuthModule } from '../auth/auth.module';
import { CodexExecutorService } from './codex-executor.service';

@Module({
  imports: [MysqlModule, OrganizationStoreModule, AuthModule],
  controllers: [ContentStudioController, PublicContentStudioController],
  providers: [ContentStudioService, CodexExecutorService],
  exports: [CodexExecutorService],
})
export class ContentStudioModule {}
