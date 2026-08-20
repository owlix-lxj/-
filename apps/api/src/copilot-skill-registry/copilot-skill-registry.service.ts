import { Injectable } from '@nestjs/common';

export interface CopilotSkillDefinition {
  name: string;
  allowedProducts: string[];
  allowedTools: string[];
}

@Injectable()
export class CopilotSkillRegistryService {
  listBlueprintSkills(): CopilotSkillDefinition[] {
    return [
      {
        name: 'intent_router',
        allowedProducts: ['ide'],
        allowedTools: [
          'diagnostics.getProblems',
          'workspace.getTree',
          'fs.readFile',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.findReferences',
          'codebase.getFileContext',
          'codebase.getSymbolGraph',
          'codebase.getIndexStats',
          'editor.getActiveFile',
        ],
      },
      {
        name: 'direct_answer',
        allowedProducts: ['ide'],
        allowedTools: [],
      },
      {
        name: 'explain_error',
        allowedProducts: ['ide'],
        allowedTools: [
          'diagnostics.getProblems',
          'fs.readFile',
          'workspace.getTree',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.getFileContext',
          'codebase.getIndexStats',
        ],
      },
      {
        name: 'fix_error',
        allowedProducts: ['ide'],
        allowedTools: [
          'diagnostics.getProblems',
          'fs.readFile',
          'workspace.getTree',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.getFileContext',
          'codebase.getSymbolGraph',
          'codebase.getIndexStats',
          'fs.applyPatch',
        ],
      },
      {
        name: 'refactor_symbol',
        allowedProducts: ['ide'],
        allowedTools: [
          'fs.readFile',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.findReferences',
          'codebase.getFileContext',
          'codebase.getSymbolGraph',
          'codebase.getIndexStats',
          'fs.applyPatch',
        ],
      },
      {
        name: 'generate_tests',
        allowedProducts: ['ide'],
        allowedTools: [
          'workspace.getTree',
          'fs.readFile',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.findReferences',
          'codebase.getFileContext',
          'codebase.getSymbolGraph',
          'codebase.getIndexStats',
        ],
      },
      {
        name: 'codebase_qa',
        allowedProducts: ['ide'],
        allowedTools: [
          'workspace.getTree',
          'fs.readFile',
          'diagnostics.getProblems',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.findReferences',
          'codebase.getFileContext',
          'codebase.getSymbolGraph',
          'codebase.getIndexStats',
        ],
      },
      {
        name: 'terminal_assistant',
        allowedProducts: ['ide'],
        allowedTools: [
          'workspace.getTree',
          'fs.readFile',
          'fs.searchText',
          'codebase.searchSymbols',
          'codebase.searchSemantic',
          'codebase.getIndexStats',
        ],
      },
      {
        name: 'brand_content_workflow',
        allowedProducts: ['miaoshechat'],
        allowedTools: ['brand.generateContent'],
      },
    ];
  }
}
