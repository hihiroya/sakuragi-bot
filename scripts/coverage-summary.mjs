import fs from "fs";

const summaryPath = "coverage/coverage-summary.json";
const outputPath = process.env.GITHUB_STEP_SUMMARY;

if (!fs.existsSync(summaryPath)) {
  const message = "Coverage summary was not generated.";
  if (outputPath) {
    fs.appendFileSync(outputPath, `## Coverage\n\n${message}\n`);
  } else {
    console.log(message);
  }
  process.exit(0);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
const total = summary.total;

const rows = [
  ["Statements", total.statements.pct],
  ["Branches", total.branches.pct],
  ["Functions", total.functions.pct],
  ["Lines", total.lines.pct]
];

const markdown = [
  "## Coverage",
  "",
  "| Metric | Coverage |",
  "| --- | ---: |",
  ...rows.map(([name, pct]) => `| ${name} | ${pct}% |`),
  ""
].join("\n");

if (outputPath) {
  fs.appendFileSync(outputPath, markdown);
} else {
  console.log(markdown);
}
