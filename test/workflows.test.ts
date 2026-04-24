import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontendCiWorkflow = readFileSync(
  new URL("../.github/workflows/frontend-ci.yml", import.meta.url),
  "utf8",
);

const deployWebWorkflowUrl = new URL(
  "../.github/workflows/deploy-web.yml",
  import.meta.url,
);

const readDeployWebWorkflow = () => readFileSync(deployWebWorkflowUrl, "utf8");

const githubExpression = (scope: "secrets" | "vars", name: string) =>
  ["$", "{{ ", scope, ".", name, " }}"].join("");

describe("frontend-ci workflow", () => {
  it("validates the deployment manifest in PR CI", () => {
    expect(frontendCiWorkflow).toMatch(
      /\b(deployment-env\.mjs check-drift|pnpm run check:deployment)\b/,
    );
  });

  it("runs the Web build in PR CI", () => {
    expect(frontendCiWorkflow).toContain("--filter web run build");
  });

  it("validates the Cloudflare dry-run bundle path without deploying", () => {
    expect(frontendCiWorkflow).toContain("--filter web run test:bundle-size");
    expect(frontendCiWorkflow).not.toMatch(
      /\b(opennextjs-cloudflare upload|wrangler deploy|pnpm (?:run )?(?:deploy|upload)|--filter web run (?:deploy|upload))\b/,
    );
  });

  it("does not require Cloudflare credentials in PR CI", () => {
    expect(frontendCiWorkflow).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(frontendCiWorkflow).not.toContain("CLOUDFLARE_ACCOUNT_ID");
  });
});

describe("deploy-web workflow", () => {
  it("exists", () => {
    expect(existsSync(deployWebWorkflowUrl)).toBe(true);
  });

  it("runs only on main push and manual dispatch", () => {
    const workflow = readDeployWebWorkflow();

    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\n\s*-\s*main/);
    expect(workflow).toMatch(/\bworkflow_dispatch:\s*(?:\n|$)/);
    expect(workflow).not.toMatch(/\bpull_request:/);
  });

  it("deploys the Web worker with the deploy wrapper", () => {
    expect(readDeployWebWorkflow()).toContain(
      "corepack pnpm --filter web run deploy",
    );
  });

  it("uses GitHub Secrets for Cloudflare credentials", () => {
    const workflow = readDeployWebWorkflow();

    expect(workflow).toContain(
      `CLOUDFLARE_API_TOKEN: ${githubExpression("secrets", "CLOUDFLARE_API_TOKEN")}`,
    );
    expect(workflow).toContain(
      `CLOUDFLARE_ACCOUNT_ID: ${githubExpression("secrets", "CLOUDFLARE_ACCOUNT_ID")}`,
    );
  });

  it("uses GitHub Variables for optional runtime URLs", () => {
    const workflow = readDeployWebWorkflow();

    expect(workflow).toContain(
      `OP_GENERATOR_BASE_URL: ${githubExpression("vars", "OP_GENERATOR_BASE_URL")}`,
    );
    expect(workflow).toContain(
      `OP_FINALIZE_DISPATCH_URL: ${githubExpression("vars", "OP_FINALIZE_DISPATCH_URL")}`,
    );
    expect(workflow).toContain(
      `OP_GENERATOR_RUNTIME_URL_OVERRIDE: ${githubExpression("vars", "OP_GENERATOR_RUNTIME_URL_OVERRIDE")}`,
    );
  });
});
