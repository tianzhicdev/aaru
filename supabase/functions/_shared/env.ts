declare const Deno:
  | {
      env: {
        get(name: string): string | undefined;
      };
    }
  | undefined;

function readEnv(name: string): string | undefined {
  // Deno env for edge runtime, process env for local scripts/tests.
  const denoValue = typeof Deno !== "undefined" && "env" in Deno ? Deno.env.get(name) : undefined;
  const processValue =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined;

  return denoValue ?? processValue;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function supabaseUrl(): string {
  return (
    readEnv("SUPABASE_URL") ??
    `https://${readEnv("AARU_PROJECT_ID") ?? requireEnv("SUPABASE_PROJECT_ID")}.supabase.co`
  );
}

export function supabaseServiceRoleKey(): string {
  return (
    readEnv("AARU_SERVICE_ROLE_KEY") ??
    requireEnv("SUPABASE_SECRET_KEY")
  );
}

export function aaruSessionSecret(): string {
  return readEnv("AARU_SESSION_SECRET") ?? requireEnv("AARU_SESSION_SECRET");
}

export function xaiToken(): string | undefined {
  return readEnv("XAI_TOKEN");
}
