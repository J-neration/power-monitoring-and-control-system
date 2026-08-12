import { z } from "zod";
import { EnvConfigError, parseEnv } from "../server.js";

export const loadEnv = () => {
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvConfigError) {
      console.error(`\n🚨 환경변수 설정 오류\n${error.message}\n`);
      process.exit(1);
    }
    if (error instanceof z.ZodError) {
      const details = error.issues
        .map((issue) => `  · ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      console.error(`\n🚨 환경변수 검증 실패\n${details}\n`);
      process.exit(1);
    }
    throw error;
  }
};
