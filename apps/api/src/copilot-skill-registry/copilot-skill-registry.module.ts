import { Module } from '@nestjs/common';
import { CopilotSkillRegistryService } from './copilot-skill-registry.service';

@Module({
  providers: [CopilotSkillRegistryService],
  exports: [CopilotSkillRegistryService],
})
export class CopilotSkillRegistryModule {}
