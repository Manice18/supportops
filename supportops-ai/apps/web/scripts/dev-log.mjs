import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const logFile = process.env.WEB_LOG_FILE ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../logs/web.log");
mkdirSync(dirname(logFile), { recursive: true });
console.log(`Web logs: ${logFile}`);

const output = createWriteStream(logFile, { flags: "a" });
output.write(`\n--- next dev ${new Date().toISOString()} ---\n`);

const child = spawn("next", ["dev", "--port", "3000"], {
  stdio: ["inherit", "pipe", "pipe"],
  env: process.env,
});
child.stdout?.pipe(output);
child.stderr?.pipe(output);
child.on("exit", (code) => process.exit(code ?? 0));
