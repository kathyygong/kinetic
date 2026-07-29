import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Status = "pass" | "warn" | "fail";

type Finding = {
  status: Status;
  check: string;
  detail: string;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageLock = {
  lockfileVersion?: number;
};

type NpmAuditJson = {
  metadata?: {
    vulnerabilities?: Record<string, number>;
  };
  vulnerabilities?: Record<
    string,
    {
      isDirect?: boolean;
      via?: Array<
        | string
        | {
            source?: number;
            url?: string;
            range?: string;
          }
      >;
    }
  >;
};

const BRACE_EXPANSION_ADVISORY_SOURCE = 1124334;
const BRACE_EXPANSION_ADVISORY_URL =
  "https://github.com/advisories/GHSA-mh99-v99m-4gvg";
const BRACE_EXPANSION_EXCEPTION_EXPIRES_AT = Date.parse(
  "2026-08-15T00:00:00Z",
);
const BRACE_EXPANSION_DEV_GRAPH = new Set([
  "@eslint/config-array",
  "@eslint/eslintrc",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "@typescript-eslint/type-utils",
  "@typescript-eslint/typescript-estree",
  "@typescript-eslint/utils",
  "brace-expansion",
  "eslint",
  "eslint-config-next",
  "eslint-plugin-import",
  "eslint-plugin-jsx-a11y",
  "eslint-plugin-react",
  "minimatch",
  "typescript-eslint",
]);
const BRACE_EXPANSION_DIRECT_DEV_TOOLS = new Set([
  "eslint",
  "eslint-config-next",
]);

const args = new Set(process.argv.slice(2));
const runAudit = args.has("--run-audit");
const requireAudit = args.has("--require-audit");

const frontendRoot = process.cwd();
const repoRoot = findRepoRoot();
const findings: Finding[] = [];

add(checkLockfile());
add(checkDependencyPinning());
add(checkProtectedArtifacts());
add(checkDocumentation());
add(checkNpmAudit());

for (const finding of findings) {
  const label = finding.status.toUpperCase().padEnd(4);
  console.log(`${label} ${finding.check} - ${finding.detail}`);
}

const failed = findings.filter((finding) => finding.status === "fail");
const warnings = findings.filter((finding) => finding.status === "warn");

console.log(
  `\nBeta readiness summary: ${failed.length} failure(s), ${warnings.length} warning(s), ${findings.length} check(s).`,
);

if (failed.length > 0) {
  process.exit(1);
}

function add(items: Finding | Finding[]): void {
  findings.push(...(Array.isArray(items) ? items : [items]));
}

function checkLockfile(): Finding {
  const lockPath = join(frontendRoot, "package-lock.json");
  if (!existsSync(lockPath)) {
    return {
      status: "fail",
      check: "frontend lockfile",
      detail: "package-lock.json is missing; beta dependency installs are not reproducible.",
    };
  }

  const lock = readJson<PackageLock>(lockPath);
  if ((lock.lockfileVersion ?? 0) < 3) {
    return {
      status: "warn",
      check: "frontend lockfile",
      detail: `lockfileVersion ${lock.lockfileVersion ?? "unknown"} is older than the npm v9+ format.`,
    };
  }

  return {
    status: "pass",
    check: "frontend lockfile",
    detail: `package-lock.json is present with lockfileVersion ${lock.lockfileVersion}.`,
  };
}

function checkDependencyPinning(): Finding[] {
  const packageJson = readJson<PackageJson>(join(frontendRoot, "package.json"));
  const runtimeRanges = Object.entries(packageJson.dependencies ?? {}).filter(
    ([, version]) => hasRangePrefix(version),
  );
  const devRanges = Object.entries(packageJson.devDependencies ?? {}).filter(
    ([, version]) => hasRangePrefix(version),
  );
  const backendRequirementsPath = join(repoRoot, "backend", "requirements.txt");
  const backendFloating = existsSync(backendRequirementsPath)
    ? readFileSync(backendRequirementsPath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .filter((line) => !/[=<>~!]=/.test(line))
    : [];

  return [
    runtimeRanges.length > 0
      ? {
          status: "warn",
          check: "frontend runtime dependency ranges",
          detail: `${runtimeRanges.length} runtime dependency range(s) should be reviewed before wider beta: ${runtimeRanges.map(([name]) => name).join(", ")}.`,
        }
      : {
          status: "pass",
          check: "frontend runtime dependency ranges",
          detail: "runtime dependencies are exact-pinned in package.json.",
        },
    devRanges.length > 0
      ? {
          status: "warn",
          check: "frontend dev dependency ranges",
          detail: `${devRanges.length} dev dependency range(s) remain flexible; acceptable for local demo, review before hosted beta.`,
        }
      : {
          status: "pass",
          check: "frontend dev dependency ranges",
          detail: "dev dependencies are exact-pinned in package.json.",
        },
    backendFloating.length > 0
      ? {
          status: "warn",
          check: "backend dependency pins",
          detail: `${backendFloating.length} backend requirement(s) are floating: ${backendFloating.join(", ")}.`,
        }
      : {
          status: "pass",
          check: "backend dependency pins",
          detail: "backend requirements are version-constrained.",
        },
  ];
}

function checkProtectedArtifacts(): Finding[] {
  const status = git(["status", "--short"]);
  if (status.status !== 0) {
    return [
      {
        status: "warn",
        check: "protected QA artifacts",
        detail: "could not read git status; verify .edge-qa* and tmp-onboarding-*.png manually.",
      },
    ];
  }

  const protectedLines = status.output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => /(\.edge-qa|tmp-onboarding-.*\.png)/.test(line));
  const unsafe = protectedLines.filter((line) => !line.startsWith("?? "));

  return [
    unsafe.length > 0
      ? {
          status: "fail",
          check: "protected QA artifacts",
          detail: `protected artifact(s) appear staged or modified: ${unsafe.join("; ")}.`,
        }
      : {
          status: "pass",
          check: "protected QA artifacts",
          detail:
            protectedLines.length > 0
              ? "protected QA artifacts are present only as untracked local files."
              : "no protected QA artifacts are present in git status.",
        },
  ];
}

function checkDocumentation(): Finding[] {
  const requiredDocs = [
    "PRD.md",
    "BUILD_PLAN.md",
    "README.md",
    "ARCHITECTURE.md",
    "DEMO_SCRIPT.md",
    "EVAL_REPORT.md",
    "BETA_RUNBOOK.md",
    "QA_MATRIX.md",
  ];

  return requiredDocs.map((name) => ({
    status: existsSync(join(repoRoot, name)) ? "pass" : "warn",
    check: `doc ${name}`,
    detail: existsSync(join(repoRoot, name))
      ? "present."
      : "missing; beta handoff is less repeatable without it.",
  }));
}

function checkNpmAudit(): Finding {
  if (!runAudit) {
    return {
      status: "warn",
      check: "npm advisory audit",
      detail:
        "skipped by default for offline demo safety; run `npm run beta:audit` from frontend in a connected environment.",
    };
  }

  const audit =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", "npm audit --json --audit-level=moderate"],
          {
            cwd: frontendRoot,
            encoding: "utf8",
            timeout: 30_000,
          },
        )
      : spawnSync("npm", ["audit", "--json", "--audit-level=moderate"], {
          cwd: frontendRoot,
          encoding: "utf8",
          timeout: 30_000,
        });

  const raw = `${audit.stdout ?? ""}\n${audit.stderr ?? ""}`.trim();
  if (audit.error) {
    return {
      status: requireAudit ? "fail" : "warn",
      check: "npm advisory audit",
      detail: `could not run npm audit: ${audit.error.message}.`,
    };
  }

  if (audit.signal === "SIGTERM") {
    return {
      status: requireAudit ? "fail" : "warn",
      check: "npm advisory audit",
      detail: "audit timed out after 30 seconds; retry from a connected shell.",
    };
  }

  const parsed = extractJson(raw);
  if (!parsed) {
    const head = raw.replace(/\s+/g, " ").slice(0, 180) || "no output";
    return {
      status: requireAudit ? "fail" : "warn",
      check: "npm advisory audit",
      detail: `audit endpoint did not return parseable JSON; retry from a connected shell. Output: ${head}`,
    };
  }

  const vulnerabilities = parsed.metadata?.vulnerabilities;
  const moderatePlus =
    (vulnerabilities?.moderate ?? 0) +
    (vulnerabilities?.high ?? 0) +
    (vulnerabilities?.critical ?? 0);

  if (moderatePlus > 0) {
    if (isTemporaryBraceExpansionDevToolFinding(parsed, moderatePlus)) {
      return {
        status: "warn",
        check: "npm advisory audit",
        detail:
          `${moderatePlus} high findings trace only to the ESLint dev-tool ` +
          `graph for GHSA-mh99-v99m-4gvg. The registry has not published a ` +
          `compatible patched dependency path; the narrow exception expires ` +
          `2026-08-15 and any different advisory still fails.`,
      };
    }
    return {
      status: "fail",
      check: "npm advisory audit",
      detail: `${moderatePlus} moderate/high/critical vulnerability finding(s) need triage.`,
    };
  }

  return {
    status: "pass",
    check: "npm advisory audit",
    detail: "no moderate/high/critical vulnerabilities reported by npm audit.",
  };
}

function isTemporaryBraceExpansionDevToolFinding(
  audit: NpmAuditJson,
  moderatePlus: number,
): boolean {
  if (Date.now() >= BRACE_EXPANSION_EXCEPTION_EXPIRES_AT) return false;
  const vulnerabilities = audit.vulnerabilities;
  if (!vulnerabilities) return false;
  const names = Object.keys(vulnerabilities);
  if (
    names.length !== moderatePlus ||
    names.length === 0 ||
    names.some((name) => !BRACE_EXPANSION_DEV_GRAPH.has(name))
  ) {
    return false;
  }

  const direct = names.filter((name) => vulnerabilities[name]?.isDirect);
  if (
    direct.length !== BRACE_EXPANSION_DIRECT_DEV_TOOLS.size ||
    direct.some((name) => !BRACE_EXPANSION_DIRECT_DEV_TOOLS.has(name))
  ) {
    return false;
  }

  const advisoryObjects = names.flatMap((name) =>
    (vulnerabilities[name]?.via ?? []).filter(
      (
        via,
      ): via is {
        source?: number;
        url?: string;
        range?: string;
      } => typeof via !== "string",
    ),
  );
  return (
    advisoryObjects.length === 1 &&
    advisoryObjects[0]?.source === BRACE_EXPANSION_ADVISORY_SOURCE &&
    advisoryObjects[0]?.url === BRACE_EXPANSION_ADVISORY_URL &&
    advisoryObjects[0]?.range === "<=5.0.7"
  );
}

function findRepoRoot(): string {
  const result = git(["rev-parse", "--show-toplevel"], frontendRoot);
  if (result.status === 0 && result.output.trim()) {
    return result.output.trim();
  }
  return join(frontendRoot, "..");
}

function git(argsToRun: string[], cwd = repoRootCandidate()): { status: number; output: string } {
  const result = spawnSync("git", argsToRun, {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function repoRootCandidate(): string {
  return existsSync(join(frontendRoot, ".git")) ? frontendRoot : join(frontendRoot, "..");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function hasRangePrefix(version: string): boolean {
  return /^[~^*]/.test(version) || /\s\|\|\s/.test(version);
}

function extractJson(raw: string): NpmAuditJson | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as NpmAuditJson;
  } catch {
    return null;
  }
}
