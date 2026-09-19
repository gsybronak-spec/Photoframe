/**
 * Next.js instrumentation hook — runs once per server process at startup.
 * Used to validate production configuration before the first request lands.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateProductionConfig } = await import("./server/config-check");
    validateProductionConfig();
  }
}
