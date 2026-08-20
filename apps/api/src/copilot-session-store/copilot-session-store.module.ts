import { Module } from '@nestjs/common';
import { MysqlModule } from '../database/mysql.module';
import { CopilotSessionStoreService } from './copilot-session-store.service';

@Module({
  imports: [MysqlModule],
  providers: [CopilotSessionStoreService],
  exports: [CopilotSessionStoreService],
})
export class CopilotSessionStoreModule {}
