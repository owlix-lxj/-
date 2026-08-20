import { Module } from '@nestjs/common';
import { CopilotToolRegistryService } from './copilot-tool-registry.service';

@Module({
  providers: [CopilotToolRegistryService],
  exports: [CopilotToolRegistryService],
})
export class CopilotToolRegistryModule {}
