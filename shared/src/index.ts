import { athleteCatalog } from "./catalog";
import { requiredWebEnvKeys } from "./env";

export const appMeta = {
  name: "ONE Portrait",
  tagline: "Your Smile Becomes Their Strength",
} as const;

export { athleteCatalog, requiredWebEnvKeys };
