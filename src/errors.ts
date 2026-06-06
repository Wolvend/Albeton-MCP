export class AbletonMcpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly nextSteps: string[] = []
  ) {
    super(message);
    this.name = "AbletonMcpError";
  }
}

export function asStructuredError(error: unknown) {
  if (error instanceof AbletonMcpError) {
    return { ok: false, code: error.code, error: error.message, nextSteps: error.nextSteps };
  }
  if (error instanceof Error) {
    return { ok: false, code: "UNEXPECTED_ERROR", error: error.message, nextSteps: ["Check server logs and retry with a narrower request."] };
  }
  return { ok: false, code: "UNKNOWN_ERROR", error: String(error), nextSteps: ["Check server logs and retry."] };
}

export function requireFlag(enabled: boolean, flag: string, action: string) {
  if (!enabled) {
    throw new AbletonMcpError(
      `${action} is disabled by ${flag}=0.`,
      "FEATURE_DISABLED",
      [`Set ${flag}=1 only when you intentionally want to enable this class of action.`, "Use dry_run=true first where supported."]
    );
  }
}
