declare module "markdown-it-texmath" {
  import { PluginWithOptions } from "markdown-it";

  const texmath: PluginWithOptions<{
    engine?: any;
    delimiters?: { left: string; right: string; display: boolean }[];
    macros?: Record<string, string>;
  }>;

  export default texmath;
}
