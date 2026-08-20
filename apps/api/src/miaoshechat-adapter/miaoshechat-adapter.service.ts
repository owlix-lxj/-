import { Injectable } from '@nestjs/common';

@Injectable()
export class MiaoshechatAdapterService {
  getAdapterBlueprint() {
    return {
      productType: 'miaoshechat',
      scopeTypes: ['brand'],
      scenes: ['brand_content', 'distribution', 'insight'],
      notes: 'Preserves MiaoShe Chat product semantics while delegating shared orchestration to copilot-core.',
    };
  }
}
