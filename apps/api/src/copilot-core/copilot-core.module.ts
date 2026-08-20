import { Module } from '@nestjs/common';
import { CopilotSessionStoreModule } from '../copilot-session-store/copilot-session-store.module';
import { CopilotSkillRegistryModule } from '../copilot-skill-registry/copilot-skill-registry.module';
import { CopilotToolRegistryModule } from '../copilot-tool-registry/copilot-tool-registry.module';
import { CopilotCoreService } from './copilot-core.service';

@Module({
  imports: [
    CopilotSessionStoreModule,
    CopilotSkillRegistryModule,
    CopilotToolRegistryModule,
  ],
  providers: [CopilotCoreService],
  exports: [CopilotCoreService],
})
export class CopilotCoreModule {}
