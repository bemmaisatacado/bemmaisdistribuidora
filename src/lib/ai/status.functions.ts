import { createServerFn } from "@tanstack/react-start";

/** Reports only whether provider secrets exist — never their values. */
export const getAiSecretStatus = createServerFn({ method: "GET" }).handler(async () => ({
  openai: Boolean(process.env["OPENAI_API_KEY"]),
}));
