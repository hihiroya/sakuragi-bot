import fs from "node:fs";

const lockfile = JSON.parse(fs.readFileSync("package-lock.json", "utf-8"));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));

const allowedRegistryPrefix = "https://registry.npmjs.org/";
const unsafeSpecPattern = /^(?:git\+|git:|github:|http:|https:|file:)/i;
const failures = [];

for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
  const dependencies = packageJson[field] ?? {};
  for (const [name, spec] of Object.entries(dependencies)) {
    if (typeof spec === "string" && unsafeSpecPattern.test(spec)) {
      failures.push(`package.json ${field}.${name} uses unsupported external spec: ${spec}`);
    }
  }
}

for (const [name, entry] of Object.entries(lockfile.packages ?? {})) {
  if (name === "" || !entry || typeof entry !== "object") {
    continue;
  }

  const resolved = entry.resolved;
  if (typeof resolved === "string" && !resolved.startsWith(allowedRegistryPrefix)) {
    failures.push(`package-lock.json ${name} resolves outside npm registry: ${resolved}`);
  }
}

if (failures.length > 0) {
  console.error("Lockfile security check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Lockfile security check passed.");
