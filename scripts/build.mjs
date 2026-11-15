import { spawnSync } from "node:child_process";

const hostinger =
  process.env.GPOS_HOSTINGER_BUILD === "true" ||
  process.argv.includes("--hostinger");

if (hostinger && !process.env.DATABASE_URL) {
  console.error("Configura DATABASE_URL en Hostinger antes de compilar.");
  process.exit(1);
}

function run(task, options = [], env = process.env) {
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "run", task, ...options],
    { env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (hostinger) run("db:generate");
run("build", ["-w", "apps/api"]);
run("build", ["-w", "apps/web"]);
if (hostinger) run("db:setup", [], { ...process.env, SEED_DEMO: "false" });
