import { Module } from '@nestjs/common';
import { CopilotCoreModule } from '../copilot-core/copilot-core.module';
import { MiaoshechatAdapterService } from './miaoshechat-adapter.service';

@Module({
  imports: [CopilotCoreModule],
  providers: [MiaoshechatAdapterService],
  exports: [MiaoshechatAdapterService],
})
export class MiaoshechatAdapterModule {}
