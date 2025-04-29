import * as fs from 'fs';
import * as path from 'path';
import { components } from './components';

type PrismLanguageEntry = {
  title: string;
  alias?: string[] | string;
  require?: string | string[];
};

type ComponentsJSON = {
  languages: Record<string, PrismLanguageEntry>;
};

export class PrismAliasResolver {
  private aliasMap: Map<string, string> = new Map();
  private officialLanguages: Set<string> = new Set();

  constructor() {
    const data = components;

    for (const [langId, entry] of Object.entries(data.languages)) {
      if (langId === 'meta') {continue;}; // Skip meta entry
      this.officialLanguages.add(langId);
      this.aliasMap.set(langId, langId);

      const aliases = 'alias' in entry && entry.alias
        ? Array.isArray(entry.alias)
          ? entry.alias
          : [entry.alias]
        : [];

      for (const alias of aliases) {
        this.aliasMap.set(alias, langId);
      }
    }
  }

  public resolveLanguage(lang: string): string | undefined {
    return this.aliasMap.get(lang.toLowerCase());
  }

  public getAllLanguages(): string[] {
    return Array.from(this.officialLanguages);
  }
}
