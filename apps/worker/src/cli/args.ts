export function parseFlags(argv: string[]) {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=", 2);
    if (v !== undefined) flags.set(k!, v);
    else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) flags.set(k!, argv[++i]!);
    else flags.set(k!, true);
  }
  return flags;
}
