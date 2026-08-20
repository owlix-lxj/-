import { Injectable } from '@nestjs/common';

export type CopilotRiskLevel = 'low' | 'medium' | 'high';

export interface CopilotToolDefinition {
  name: string;
  riskLevel: CopilotRiskLevel;
  requiresConfirmation: boolean;
  allowedProducts: string[];
}

@Injectable()
export class CopilotToolRegistryService {
  listBlueprintTools(): CopilotToolDefinition[] {
    return [
      {
        name: 'workspace.getTree',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'diagnostics.getProblems',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'fs.readFile',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'fs.searchText',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'codebase.searchSymbols',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'codebase.searchSemantic',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'codebase.findReferences',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'codebase.getFileContext',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'codebase.getSymbolGraph',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'codebase.getIndexStats',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'editor.getActiveFile',
        riskLevel: 'low',
        requiresConfirmation: false,
        allowedProducts: ['ide'],
      },
      {
        name: 'fs.applyPatch',
        riskLevel: 'high',
        requiresConfirmation: true,
        allowedProducts: ['ide'],
      },
      {
        name: 'brand.generateContent',
        riskLevel: 'medium',
        requiresConfirmation: false,
        allowedProducts: ['miaoshechat'],
      },
    ];
  }
}
