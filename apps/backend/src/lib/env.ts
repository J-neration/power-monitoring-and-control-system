import { parseEnv } from "../server.js";

export const loadEnv = () => {
  return parseEnv(process.env);
};
