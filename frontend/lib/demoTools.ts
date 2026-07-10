export function areDemoToolsEnabled(
  value = process.env.NEXT_PUBLIC_ENABLE_DEMO_TOOLS,
): boolean {
  return value === "true";
}
