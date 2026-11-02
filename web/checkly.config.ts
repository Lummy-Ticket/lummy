// lummy.id watched from outside (docs/config/06-monitoring.md): Checkly runs the @smoke browser
// tests and an uptime check on its own schedule and emails when they fail. Not on GitHub Actions,
// whose minutes this private repo runs out of. Nothing here deploys itself: `npx checkly deploy`,
// by hand, after the account exists. The checks are in monitoring/.
import { defineConfig } from "checkly";

export default defineConfig({
  projectName: "Lummy Ticket",
  logicalId: "lummy-web",
  checks: {
    checkMatch: "monitoring/**/*.check.ts",
    ignoreDirectoriesMatch: [".next/**"],
    // Singapore, beside lummy.id's servers and near its visitors, and Sydney as a second view. A
    // check takes them in turn rather than both at once, so the second costs no extra runs.
    locations: ["ap-southeast-1", "ap-southeast-2"],
    tags: ["lummy.id"],
  },
  cli: { runLocation: "ap-southeast-1" },
});
