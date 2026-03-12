import "dotenv/config";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const env = {
  xaiToken: readEnv("XAI_TOKEN"),
  groqApiKey: readEnv("GROQ_API_KEY"),
  supabaseProjectId: readEnv("SUPABASE_PROJECT_ID"),
  supabaseSecretKey: readEnv("SUPABASE_SECRET_KEY"),
  supabasePassword: readEnv("SUPABASE_PW")
};
