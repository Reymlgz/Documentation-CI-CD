// The words and the page layout around the figure.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STEPS = [
  {
    n: "01", id: "commit", focus: "commit", title: "Commit", machine: "The magazine and its gate",
    body: [
      "Everything starts with a change pushed to the shared repository. The push is an event, and the CI system is subscribed to it: the repository host emits an event (a webhook, for an external CI server), and a pipeline run starts for that exact commit.",
      "In most teams the first run happens before the merge. Opening a pull request triggers the build and tests on the proposed change, and branch protection refuses the merge until those required checks are green. The run on <code>main</code> after the merge then carries the change the rest of the way down the line.",
      "On the line, each blank in the magazine is a commit. The gate lifts, one blank drops onto the belt, and the run gets a number and the commit's short hash. That hash travels with the part all the way down the line, so every result can be traced back to the source that produced it.",
    ],
    real: "<code>git push</code> → a <code>push</code> or <code>pull_request</code> event → the CI system queues a run for commit <code>a1f3c9e</code>. Required status checks and branch protection rules gate the merge.",
    tip: "Small, frequent commits keep each run fast and make a failure easy to pin on one change. That is the “integration” in continuous integration: everyone merges into main often (trunk-based development), and the machine checks every merge.",
  },
  {
    n: "02", id: "build", focus: "build", title: "Build", machine: "The press",
    body: [
      "The build turns source into something that can run: it fetches dependencies, compiles, bundles and minifies. Like a press, it should be repeatable. The same blank under the same die always gives the same part. (Bit-for-bit <em>reproducible</em> builds go further and also pin timestamps, toolchains and file ordering. Most teams aim for repeatable and get there with lockfiles and pinned images.)",
      "The build runs on a clean, ephemeral runner every time, never on someone's laptop. That makes “works on my machine” a problem the pipeline catches, not one your users find. Caches for dependencies and build layers keep a clean build fast without making it dirty.",
    ],
    real: "<code>npm ci &amp;&amp; npm run build</code>, <code>mvn package</code>, <code>go build ./...</code>, <code>cargo build --release</code>; dependency caching with <code>actions/setup-node</code> (<code>cache: npm</code>) or Docker layer cache.",
    tip: "Pin everything the build pulls in: dependencies with a lockfile (<code>npm ci</code> fails if it doesn't match <code>package.json</code>), base images by digest, and CI actions by version or commit SHA. Then next month's rebuild of the same commit gives the same output.",
  },
  {
    n: "03", id: "test", focus: "test", title: "Test", machine: "The gauge bridge, the kicker and the reject bin",
    body: [
      "Automated tests are the gauge. The probe drops onto the part and the dial reads it against a tolerance, here 13.00 ± 0.20 mm. Real suites check thousands of these tolerances: unit tests, integration tests, type checks, linters and security scans.",
      "Suites are usually shaped like a pyramid: many fast unit tests at the base, fewer integration tests that exercise real dependencies (a database in a container, for example), and a thin layer of slow end-to-end tests on top. Static checks such as linting, type checking and security scanning run alongside them, often in parallel jobs.",
      "When a reading is out of tolerance, the kicker throws the part into the reject bin and the line stops for that commit. Nothing downstream runs, no artifact is made, and the version already in production stays live. A red build blocks the change, never the users.",
    ],
    real: "<code>npm test</code>, <code>pytest</code>, <code>go test ./...</code>; plus <code>eslint</code>, <code>tsc --noEmit</code>, dependency audits (<code>npm audit</code>, Dependabot), SAST (CodeQL, Semgrep) and secret scanning.",
    tip: "Fail fast: run the quickest checks first so a broken commit is rejected in seconds. A flaky test (one that sometimes fails for no reason) is a gauge you can't trust. Fix it or quarantine it, and never “retry until green”.",
  },
  {
    n: "04", id: "package", focus: "package artifact", title: "Package", machine: "The crate, the dispenser and the labeler",
    body: [
      "A part that passes is packed into a crate and labelled with a version. That crate is the artifact: a container image, a .jar, a zip or a binary. It must be treated as immutable. Once it is labelled, nobody opens it again.",
      "Immutability has to be enforced, though. A container <em>tag</em> like <code>app:1.4.2</code> is only a movable pointer, and anyone with push rights can point it at a different image. The image's <em>digest</em> (<code>app@sha256:…</code>) is a hash of its content and can never change. Pipelines deploy by digest, or turn on tag immutability in the registry.",
      "This is the most important habit in delivery: <strong>build once, deploy many</strong>. The same crate goes to staging and then to production. Nothing is rebuilt between environments, so what you tested is exactly what you ship. What changes between environments is configuration (URLs, credentials, feature flags), which is injected at deploy time and never baked into the crate.",
    ],
    real: "<code>docker build -t registry/app:1.4.2 .</code> then <code>docker push</code>, which prints the <code>sha256</code> digest; or upload to an artifact store (npm, Maven, S3). Registries such as ECR, GHCR and Artifactory can reject overwrites of existing tags.",
    tip: "Tag artifacts with something you can trace: a semantic version, the commit hash, or both, and record the digest. Version numbers are never reused, even for a release that was rolled back.",
  },
  {
    n: "05", id: "staging", focus: "staging crane", title: "Staging", machine: "The staging table and its test tower",
    body: [
      "The crane is the deployment tool: it moves crates and never changes what's inside. Its first stop is staging, an environment built like production but with no real users on it.",
      "There the artifact gets smoke tests and end-to-end checks against real databases, real networking and real configuration. Bugs that only appear when the pieces run together show up here, including database migrations, which should run in staging before they ever touch production.",
      "Staging uses its own configuration and secrets, injected by the deployment. The crate is the same one production will get; only the settings around it differ.",
    ],
    real: "<code>deploy.sh staging app@sha256:…</code> then <code>smoke-test.sh https://staging.example.com</code>; environments with their own secrets in GitHub Actions, GitLab or Argo CD; short-lived preview environments per pull request.",
    tip: "Keep staging as close to production as you can afford: same infrastructure code, same migrations, a realistic data shape. Every difference between them is a place where a bug can hide.",
  },
  {
    n: "06", id: "deploy", focus: "production crane", title: "Deploy", machine: "Two production bays and the router lever",
    body: [
      "Production has two bays, often called blue and green. One is live and the lever (a load balancer, router or service selector) sends all traffic to it. The crane retires whatever was sitting in the idle bay, sets the new crate there, waits for its health checks to pass, and only then does the lever move: new requests switch in one step, and requests already in flight on the old bay are allowed to finish (connection draining), so users see no downtime.",
      "The old version stays in its bay, warm and ready. That is what makes the next step cheap. It also means both versions may briefly run side by side against the same database, so every change has to be backward compatible with the version before it.",
      "Blue/green is one strategy among several. <a href=\"#strategies\">Choosing a deployment strategy</a>, after the stations, compares them.",
    ],
    real: "Blue/green: AWS CodeDeploy, Azure App Service slots, Argo Rollouts. Rolling updates: Kubernetes <code>Deployment</code> (pods are replaced a few at a time). Canary: Argo Rollouts, Flagger, weighted load-balancer rules (1 %, 10 %, 50 %, 100 % of traffic).",
    tip: "<strong>Continuous delivery</strong> means every green run produces a crate that is ready to ship, and a person presses the button. <strong>Continuous deployment</strong> means the line ships it with no one pressing anything.",
  },
  {
    n: "07", id: "monitor", focus: "monitor", title: "Monitor", machine: "The error-rate dial",
    body: [
      "Shipping isn't the end of the pipeline. The dial watches the live bay's error rate under real traffic, with a red mark at the threshold the team agreed on. Here that threshold is 1 % of requests failing.",
      "Some bugs only appear under real load, real data or real users. The tests passed and staging looked fine, but the dial climbs anyway. Watching for a few minutes after every deploy is how you find out.",
      "Teams usually watch the four golden signals: <strong>latency</strong>, <strong>traffic</strong>, <strong>errors</strong> and <strong>saturation</strong>. They compare them with a service level objective (SLO), such as “99.9 % of requests succeed over 30 days”. In mature pipelines a machine reads the dial: automated analysis compares the new version with the old one and triggers the rollback itself.",
    ],
    real: "Error rate, latency (p95/p99), traffic, saturation; dashboards and alerts in Prometheus + Grafana, Datadog or CloudWatch; OpenTelemetry traces; automated canary analysis in Argo Rollouts or Flagger.",
    tip: "Decide the threshold before you deploy, not while the dial is climbing. Tag every metric and log with the version, so a spike points straight at the release that caused it.",
  },
  {
    n: "08", id: "rollback", focus: "production monitor", title: "Rollback", machine: "The lever, back the other way",
    body: [
      "When the dial crosses the red mark, the lever flips back to the previous bay. New requests go to the last good version as soon as the router switches (seconds with a load balancer, longer if the switch depends on DNS caches expiring), and nothing had to be rebuilt or redeployed. The faulty crate sits idle until the next deploy retires it.",
      "The lever only moves code, not data. If the release changed the database schema or wrote data in a new format, flipping back is safe only when the old version can still read it. That is why migrations are made backward compatible (see below).",
      "Then the fix goes through the whole line again as a new commit, with a new version number. A rollback undoes a deployment, not history. When a rollback isn't possible, teams <em>roll forward</em> instead: they ship a small fix quickly through the same line.",
    ],
    real: "<code>switch-traffic.sh previous</code>, <code>kubectl rollout undo deployment/app</code>, <code>argo rollouts abort</code>, a feature flag turned off, or redeploying the last good digest.",
    tip: "A rollback you have never practised is not a plan. Automate it, and run it on purpose now and then. Feature flags give you a second, finer lever: turn off one feature without moving any traffic.",
  },
];

const YAML = `name: ci-cd
on:
  pull_request:                      # 01 commit: every pull request is built and tested before merge
  push:
    branches: [main]                 # 01 commit: every push to main runs the whole line

permissions:
  contents: read                     # least privilege for the built-in GITHUB_TOKEN

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write                # needed only to push the image
    outputs:
      image: ghcr.io/\${{ github.repository }}@\${{ steps.image.outputs.digest }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci                  # 02 build: exact versions from the lockfile
      - run: npm run build
      - run: npm test                # 03 test: a failure stops the run here
      - if: github.event_name == 'push'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - if: github.event_name == 'push'  # 04 package: pull requests stop after the tests
        id: image
        uses: docker/build-push-action@v6
        with:
          context: .                 # the Dockerfile copies in the tested build output
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}

  staging:
    needs: build-and-test
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: staging             # staging's own config and secrets
    steps:                           # 05 staging: the same artifact by digest, not a rebuild
      - uses: actions/checkout@v5
      - run: ./deploy.sh staging \${{ needs.build-and-test.outputs.image }}
      - run: ./smoke-test.sh https://staging.example.com

  production:
    needs: [build-and-test, staging]
    runs-on: ubuntu-latest
    environment: production          # required reviewers here = continuous delivery; none = continuous deployment
    concurrency:
      group: production
      cancel-in-progress: false      # one deploy at a time; never interrupt one halfway
    steps:
      - uses: actions/checkout@v5
      - run: ./deploy.sh production \${{ needs.build-and-test.outputs.image }} --slot idle  # 06 deploy to the idle bay
      - run: ./switch-traffic.sh idle                               #    move the lever
      - run: ./watch.sh --max-error-rate 1% --for 10m               # 07 monitor
      - if: failure()
        run: ./switch-traffic.sh previous                           # 08 roll back`;

const GLOSSARY = [
  ["Continuous integration (CI)", "Everyone merges small changes into the main branch often, and every merge is built and tested automatically."],
  ["Continuous delivery", "Every change that passes the pipeline is packaged and ready to release; a person decides when it goes to production."],
  ["Continuous deployment", "Every change that passes the pipeline goes to production automatically, with no manual step."],
  ["Pipeline", "The ordered stages a commit passes through: build, test, package, deploy. Usually defined as code in the repository."],
  ["Artifact", "The built, versioned, immutable output of a run: an image, a package or a binary. The crate."],
  ["Environment", "A place the artifact runs: development, staging, production. Each has its own configuration and secrets."],
  ["Blue/green deployment", "Two identical production slots; deploy to the idle one, then switch traffic. The old one stays ready for a rollback."],
  ["Canary release", "Send a small share of traffic to the new version first, and widen it only while the metrics stay healthy."],
  ["Rollback", "Returning production to the last good version, ideally by flipping traffic rather than rebuilding."],
  ["Flaky test", "A test that passes and fails on the same code. It erodes trust in the gauge and should be fixed or quarantined."],
  ["Pull request (merge request)", "A proposed change that CI builds and tests before it is merged. Branch protection can require those checks to pass."],
  ["Trunk-based development", "Everyone integrates into one main branch at least daily, using short-lived branches and feature flags instead of long-running branches."],
  ["Image digest", "The <code>sha256</code> hash of a container image's content. Unlike a tag, it can never point at different content."],
  ["Smoke test", "A quick check that a freshly deployed system starts and answers its most important requests. It isn't a full test suite."],
  ["Rolling update", "Replacing instances of the old version with the new one a few at a time. It needs no spare capacity, but rolling back is another rollout."],
  ["Feature flag", "A runtime switch that turns a feature on or off without a deploy. It separates deploying code from releasing a feature."],
  ["Expand/contract migration", "Changing a database schema in backward-compatible steps (add, migrate, then remove) so old and new versions can run side by side."],
  ["Infrastructure as code (IaC)", "Servers, networks and clusters described in versioned files (Terraform, OpenTofu, Pulumi, CloudFormation) and changed through the same review and pipeline as application code."],
  ["GitOps", "Infrastructure as code where a controller (Argo CD, Flux) keeps the cluster in sync with a Git repository, so a deploy is a commit."],
  ["SLO", "Service level objective: a target for a reliability measure, such as 99.9 % of requests succeeding over 30 days. It sets the thresholds the monitor watches."],
  ["OIDC federation", "Letting a CI job trade a short-lived identity token for cloud credentials, so no long-lived keys are stored as secrets."],
  ["SBOM", "Software bill of materials: a list of every component and version inside an artifact, used to find affected releases when a vulnerability is announced."],
  ["DORA metrics", "Four measures of delivery performance: deployment frequency, change lead time, change fail rate and failed deployment recovery time."],
];

const STRATEGIES = [
  ["Recreate", "Stop the old version, start the new one.", "Yes, while it restarts", "Redeploy the old version", "None"],
  ["Rolling update", "Replace instances a few at a time.", "No, if health checks gate each batch", "Another rollout, in reverse", "Small (a surge of a few instances)"],
  ["Blue/green", "Deploy to an idle copy, then switch all traffic.", "No", "Flip the router back: seconds", "Double, during the deploy"],
  ["Canary", "Send 1 %, then 10 %, 50 %, 100 % of traffic to the new version while metrics stay healthy.", "No", "Send the canary's traffic back: seconds, and few users affected", "Small; needs good metrics"],
  ["Feature flags", "Ship the code switched off, then turn the feature on for chosen users.", "No", "Turn the flag off: no deploy at all", "Flag service and cleanup of old flags"],
];

const QUIZ = [
  ["A test fails on commit 28c629c. What happens to production?", "Nothing. The kicker rejects the part at the test station, no artifact is built, and the version already live keeps serving users."],
  ["Why does the crane carry the same crate from staging to production instead of building a new one?", "Build once, deploy many. Rebuilding could produce something slightly different from what was tested; reusing the artifact guarantees production runs exactly what passed staging."],
  ["The new version passed every test, but errors climb after the switch. Why is the rollback so fast?", "Because the previous version is still running in the other bay. Rolling back is moving the lever, not rebuilding or redeploying."],
  ["What's the difference between continuous delivery and continuous deployment?", "Both keep every green build releasable. Delivery waits for a person to press the button for production; deployment ships automatically."],
  ["Staging tested <code>app:1.4.2</code>. Why should production deploy <code>app@sha256:…</code> instead of the tag?", "A tag is a movable pointer, and it could have been re-pushed between staging and production. The digest is a hash of the content, so it guarantees production gets the exact image that was tested."],
  ["A release renamed a database column, and errors climb. Why might flipping the lever back not fix it?", "The old version still expects the old column name. Rollback moves code, not data, so schema changes have to be backward compatible: add the new column, migrate and dual-write, and remove the old one only in a later release."],
];

export function article({ card, controls, minis = {} }) {
  const nav = STEPS.map((s) => `<a href="#${s.id}" data-nav="${s.id}"><span>${s.n}</span>${s.title}</a>`).join("");
  const steps = STEPS.map((s) => `
    <section class="cd-step" id="${s.id}" data-step="${s.id}">
      <div class="cd-step-head">
        <span class="cd-step-n">${s.n}</span>
        <div>
          <h2>${s.title}</h2>
          <p class="cd-machine">On the line: ${s.machine}</p>
        </div>
        <button type="button" class="cd-show" data-show="${s.focus}">Show on the line ↑</button>
      </div>
      ${minis[s.id] ? `<div class="cd-close">${minis[s.id]}</div>` : ""}
      ${s.body.map((p) => `<p>${p}</p>`).join("")}
      <p class="cd-real"><span>In real pipelines</span>${s.real}</p>
      <p class="cd-tip">${s.tip}</p>
    </section>`).join("");
  return `
<header class="cd-top">
  <a class="cd-brand" href="#top">ci/cd<span>, taken apart</span></a>
  <button type="button" class="cd-theme" data-theme-toggle aria-label="Switch between light and dark">◐</button>
</header>
<main class="cd-page" id="top">
  <section class="cd-hero">
    <p class="cd-kicker">An illustrated guide</p>
    <h1>How CI/CD works,<br>on one workbench</h1>
    <p class="cd-lede">Continuous integration and continuous delivery are a production line for software. Every change is built, tested, packaged, deployed and watched by the same machine, the same way, every time. Push a commit below and follow it down the line.</p>
  </section>
  <section class="cd-figure" id="line" aria-label="Interactive figure">
    ${card}
    ${controls}
  </section>
  <section class="cd-why">
    <h2>Why a production line?</h2>
    <p>Before CI/CD, releases were assembled by hand: someone built the code on their machine, someone else ran the tests (sometimes), and a third person copied files onto servers late at night. Every step could go a little differently each time.</p>
    <p>A pipeline replaces that with a machine that does the same thing in the same order for every single change. Stations can't be skipped, a bad part can't sneak past the gauge, and every crate on the shelf is labelled with exactly where it came from. The rest of this page walks through the eight stations. After them come the topics a real line also has to handle: <a href="#strategies">deployment strategies</a>, <a href="#database">database changes</a>, <a href="#security">security</a> and <a href="#metrics">measurement</a>.</p>
    <nav class="cd-nav" aria-label="Stations">${nav}</nav>
  </section>
  ${steps}
  <section class="cd-code" id="workflow">
    <h2>The same line, written as code</h2>
    <p>Real pipelines are defined in a file in the repository, so changes to the line itself are reviewed and versioned like any other code. Here is the whole bench as a GitHub Actions workflow. The numbered comments match the stations above. GitLab CI, Jenkins, CircleCI and Azure Pipelines all express the same idea in their own syntax.</p>
    <pre><code>${esc(YAML)}</code></pre>
    <p class="cd-note-p">Things to notice: pull requests run only the build and tests, while pushes to <code>main</code> go all the way. The token gets only the permissions each job needs. The image is passed between jobs by digest, never rebuilt. The <code>production</code> environment is where you add required reviewers (continuous delivery) or leave them out (continuous deployment). The concurrency group makes sure two deploys never move the lever at the same time. The <code>*.sh</code> scripts stand in for your platform's deploy tooling.</p>
  </section>
  <section class="cd-extra" id="strategies">
    <h2>Choosing a deployment strategy</h2>
    <p>The line uses blue/green because it is the easiest to see. Real teams choose by how much downtime, cost and risk they can accept. Many combine them, for example a canary on top of a rolling update, with feature flags for risky features.</p>
    <div class="cd-table"><table>
      <thead><tr><th scope="col">Strategy</th><th scope="col">How it works</th><th scope="col">Downtime</th><th scope="col">Rollback</th><th scope="col">Extra cost</th></tr></thead>
      <tbody>${STRATEGIES.map(([s, ...c]) => `<tr><th scope="row">${s}</th>${c.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
  </section>
  <section class="cd-extra" id="database">
    <h2>The part the lever can't move: databases</h2>
    <p>Blue and green bays share one database. During a deploy, and again after a rollback, the old and the new version both talk to it. A migration that drops or renames a column breaks whichever version doesn't expect it, and no lever can undo that.</p>
    <p>The safe pattern is <strong>expand/contract</strong> (also called parallel change), spread over several releases:</p>
    <ol>
      <li><strong>Expand:</strong> add the new column or table. Old code ignores it.</li>
      <li><strong>Migrate:</strong> ship code that writes to both and reads from the new one, then backfill existing rows.</li>
      <li><strong>Contract:</strong> once no running version uses the old column, remove it in a later release.</li>
    </ol>
    <p>Migrations are versioned files in the repository (Flyway, Liquibase, Alembic, Prisma Migrate, Rails migrations). They run as their own step before the new code goes live, and they are tested in staging first.</p>
  </section>
  <section class="cd-extra" id="security">
    <h2>Securing the line</h2>
    <p>A pipeline holds the keys to production, so it is a favourite target. If someone can tamper with the line, they can ship anything. The common safeguards:</p>
    <ul>
      <li><strong>No long-lived secrets.</strong> Use OIDC federation so each job gets short-lived cloud credentials. Keep any remaining secrets in the CI secret store, scoped to one environment, and never in the repository.</li>
      <li><strong>Least privilege.</strong> Give the CI token read-only access by default and grant write access only to the job that needs it. Protect the production environment with required reviewers or branch rules.</li>
      <li><strong>Pin what you run.</strong> Third-party actions, base images and tools can change under you. Pin them by version or, better, by commit SHA or digest, and let Dependabot or Renovate propose updates.</li>
      <li><strong>Scan early (“shift left”).</strong> Dependency scanning, static analysis (SAST), secret scanning and image scanning run at the test station, where a finding stops the line like any other failed check.</li>
      <li><strong>Prove where the crate came from.</strong> Generate an SBOM, sign the artifact (Sigstore/cosign) and attach build provenance (the SLSA framework), so the cluster can refuse anything this pipeline didn't build.</li>
    </ul>
  </section>
  <section class="cd-extra" id="metrics">
    <h2>Measuring the line</h2>
    <p>How do you know whether the pipeline is getting better? Google's DORA research program tracks four metrics that, together, measure both speed and stability:</p>
    <dl class="cd-metrics">
      <div><dt>Deployment frequency</dt><dd>How often a change reaches production.</dd></div>
      <div><dt>Change lead time</dt><dd>The time from a commit to that commit running in production.</dd></div>
      <div><dt>Change fail rate</dt><dd>The share of deployments that cause a failure needing a rollback or fix.</dd></div>
      <div><dt>Failed deployment recovery time</dt><dd>How long it takes to recover from a failed deployment (formerly reported as mean time to restore).</dd></div>
    </dl>
    <p>The research consistently finds that speed and stability are not a trade-off: teams that deploy small changes often also tend to fail less and recover faster. That is the whole argument for the line.</p>
  </section>
  <section class="cd-rules">
    <h2>Six rules the line follows</h2>
    <ol>
      <li><strong>Keep main green.</strong> A failing run is the team's top priority; nobody stacks new work on a broken line.</li>
      <li><strong>Small batches.</strong> One small change per run makes failures quick to find and cheap to fix.</li>
      <li><strong>Build once, deploy many.</strong> The artifact that passed staging, identified by its digest, is the artifact that reaches production. Only configuration changes between environments.</li>
      <li><strong>Everything as code.</strong> The pipeline, the infrastructure, the configuration and the database migrations live in the repository.</li>
      <li><strong>Always have a way back.</strong> Keep the previous version ready, keep schema changes backward compatible, and make rollback a single, rehearsed action.</li>
      <li><strong>Guard the line itself.</strong> Short-lived credentials, least-privilege tokens and pinned dependencies, because whoever controls the pipeline controls production.</li>
    </ol>
  </section>
  <section class="cd-quiz">
    <h2>Check yourself</h2>
    ${QUIZ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}
  </section>
  <section class="cd-gloss" id="glossary">
    <h2>Glossary</h2>
    <dl>${GLOSSARY.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>
  </section>
  <footer class="cd-foot">
    <p>The figures and animations were made with <a href="https://github.com/wheresryan22/anatomy"><em>anatomy</em></a>, an isometric drawing kit (MIT). The line is a teaching model: its timings are compressed, and real pipelines run stages in parallel and queue concurrent commits.</p>
  </footer>
</main>`;
}

export const SITE_CSS = `
*{box-sizing:border-box}
html{color-scheme:light;scroll-behavior:smooth;scroll-padding-top:72px}
body[data-theme="dark"]{color-scheme:dark}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.iso{--cd-amber:#c27c0e}
.iso[data-theme="dark"]{--cd-amber:#f5b14c}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,strong{color:var(--anatomy-strong)}
h1{font-size:clamp(32px,5.4vw,52px);line-height:1.08;letter-spacing:-.02em;margin:0 0 18px;font-weight:600}
h2{font-size:24px;line-height:1.25;letter-spacing:-.01em;margin:0 0 12px;font-weight:600}
a{color:inherit}
code,pre{font-family:var(--anatomy-mono);font-size:.86em}
p code,li code,dd code,summary code,td code{background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-faint);padding:1px 5px;border-radius:4px;color:var(--anatomy-strong)}
.cd-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:12px max(16px,calc((100% - 980px)/2));background:color-mix(in srgb,var(--anatomy-page) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--anatomy-faint)}
.cd-brand{font-family:var(--anatomy-mono);font-size:13px;text-decoration:none;color:var(--anatomy-strong);letter-spacing:.02em}
.cd-brand span{color:var(--anatomy-muted)}
.cd-theme{appearance:none;border:0;background:none;color:var(--anatomy-text);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:6px}
.cd-theme:hover{color:var(--anatomy-strong)}
.cd-page{width:min(980px,100% - 32px);margin:0 auto 96px}
.cd-hero{max-width:720px;margin:64px 0 36px}
.cd-kicker{font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--anatomy-muted);margin:0 0 12px}
.cd-lede{font-size:18px;color:var(--anatomy-text);margin:0}
.cd-figure{margin:0 0 72px}
.cd-figure .iso-figure{margin:0}
.cd-stage{outline:none}
.cd-stage svg{display:block;width:100%;height:auto}
.cd-controls{margin-top:16px;display:grid;gap:14px}
.cd-run{display:flex;flex-wrap:wrap;gap:8px}
.cd-run button,.cd-keys button,.cd-show{appearance:none;font:inherit;font-size:13px;color:var(--anatomy-strong);background:var(--anatomy-card);border:0;box-shadow:0 0 0 1px var(--anatomy-faint);border-radius:7px;padding:8px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;transition:box-shadow .2s,opacity .2s}
.cd-run button:hover:not(:disabled),.cd-keys button:hover,.cd-show:hover{box-shadow:0 0 0 1px var(--anatomy-mid)}
.cd-run button:disabled{opacity:.45;cursor:default}
.cd-run button:focus-visible,.cd-keys button:focus-visible,.cd-show:focus-visible,.cd-theme:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:3px}
.cd-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.cd-dot[data-tone="ok"]{background:var(--anatomy-green)}
.cd-dot[data-tone="fail"]{background:var(--anatomy-red)}
.cd-dot[data-tone="run"]{background:var(--cd-amber)}
.cd-note{margin:0;font-family:var(--anatomy-mono);font-size:12.5px;color:var(--anatomy-strong);min-height:1.6em}
.cd-note-k{color:var(--anatomy-muted);text-transform:uppercase;letter-spacing:.12em;font-size:10.5px;margin-right:6px}
.cd-keys{display:flex;flex-wrap:wrap;gap:6px}
.cd-keys button{font-size:12.5px;padding:6px 10px}
.cd-keys button[aria-pressed="true"]{box-shadow:0 0 0 1px var(--anatomy-strong)}
.cd-num{font-family:var(--anatomy-mono);font-size:10.5px;color:var(--anatomy-muted)}
.cd-caption{margin:0;font-size:13.5px;color:var(--anatomy-muted);max-width:760px}
.cd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cd-why,.cd-step,.cd-code,.cd-rules,.cd-quiz,.cd-gloss,.cd-extra{max-width:720px;margin:0 0 64px}
.cd-extra ul,.cd-extra ol{padding-left:22px}.cd-extra li{margin:0 0 8px}
.cd-note-p{font-size:14px;color:var(--anatomy-muted)}
.cd-table{overflow-x:auto;box-shadow:0 0 0 1px var(--anatomy-faint);border-radius:8px;background:var(--anatomy-card)}
.cd-table table{border-collapse:collapse;width:100%;min-width:620px;font-size:13.5px;line-height:1.45}
.cd-table th,.cd-table td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--anatomy-faint)}
.cd-table tr:last-child>*{border-bottom:0}
.cd-table thead th{font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--anatomy-muted);font-weight:400}
.cd-table tbody th{color:var(--anatomy-strong);font-weight:600;white-space:nowrap}
.cd-metrics{margin:16px 0}
.cd-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:20px}
.cd-nav a{text-decoration:none;font-size:13px;padding:8px 10px;border-radius:7px;box-shadow:0 0 0 1px var(--anatomy-faint);color:var(--anatomy-strong);background:var(--anatomy-card)}
.cd-nav a span{font-family:var(--anatomy-mono);font-size:10.5px;color:var(--anatomy-muted);margin-right:8px}
.cd-nav a[data-active]{box-shadow:0 0 0 1px var(--cd-amber)}
.cd-step-head{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:start;margin-bottom:8px}
.cd-step-head h2{margin:0}
.cd-step-n{font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-muted);padding-top:7px}
.cd-machine{margin:2px 0 0;font-size:13px;color:var(--anatomy-muted)}
.cd-show{font-size:12px;padding:6px 10px;white-space:nowrap}
.cd-real{font-size:14px;border-left:2px solid var(--anatomy-faint);padding:2px 0 2px 14px}
.cd-real span{display:block;font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--anatomy-muted);margin-bottom:2px}
.cd-tip{font-size:14.5px;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-faint);border-radius:8px;padding:12px 16px}
.cd-code{max-width:none}
.cd-code p{max-width:720px}
pre{background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-faint);border-radius:8px;padding:16px 18px;overflow-x:auto;line-height:1.55;color:var(--anatomy-strong)}
.cd-rules ol{padding-left:22px}
.cd-rules li{margin:0 0 8px}
details{box-shadow:0 0 0 1px var(--anatomy-faint);background:var(--anatomy-card);border-radius:8px;padding:12px 16px;margin:0 0 8px}
summary{cursor:pointer;color:var(--anatomy-strong);font-weight:500}
details p{margin:10px 0 0}
dl{margin:0;display:grid;gap:14px}
dt{color:var(--anatomy-strong);font-weight:600}
dd{margin:2px 0 0}
.cd-foot{max-width:720px;border-top:1px solid var(--anatomy-faint);padding-top:20px;font-size:13px;color:var(--anatomy-muted)}
@media (max-width:640px){.cd-nav{grid-template-columns:repeat(2,1fr)}.cd-step-head{grid-template-columns:auto 1fr}.cd-show{grid-column:2;justify-self:start}.cd-hero{margin-top:40px}}
.cd-noscript{max-width:720px;margin:0 auto 40px;padding:12px 16px;border-radius:8px;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid)}
.cd-close{margin:14px 0 18px}
.cd-close .iso-figure{margin:0}
.cd-close .iso-plate{padding:40px 16px}
.cd-mini{overflow:hidden}.cd-mini svg{display:block;width:100%;height:100%;overflow:hidden}
@media (max-width:560px){.cd-close .iso-plate{padding:40px 6px 64px}}
/* figure: lamps, focus, phone scaling */
.cd-lamp{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);transition:fill .35s}
.cd-lamp[data-state="run"]{fill:var(--cd-amber);animation:cd-pulse 1.1s ease-in-out infinite}
.cd-lamp[data-state="ok"]{fill:var(--anatomy-green)}
.cd-lamp[data-state="fail"]{fill:var(--anatomy-red)}
@keyframes cd-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.cd-lamp[data-state="run"]{animation:none}}
.cd-knob{fill:var(--anatomy-hi)}
[data-watch] .iso-solid>.iso-fill{fill:var(--anatomy-face)}
[data-watch] .iso-solid>.iso-top{fill:var(--anatomy-lit-top)}
[data-watch] .iso-solid>.iso-shade{fill:var(--anatomy-lit-shade)}
[data-watch] .iso-solid>.iso-edge{stroke:var(--anatomy-lit)}
.cd-stage svg [data-station]{transition:opacity .4s}
.cd-stage svg[data-focus] [data-station]:not([data-on]):not([data-station="subject"]){
  --anatomy-hi:var(--cd-dim-hi);--anatomy-mid:var(--cd-dim-mid);--anatomy-lo:var(--cd-dim-lo);--anatomy-lit:var(--cd-dim-hi);--anatomy-dot:var(--cd-dim-mid)}
.iso{--cd-dim-hi:#4a4a4a;--cd-dim-mid:#303030;--cd-dim-lo:#242424}
.iso[data-theme="light"]{--cd-dim-hi:#a9a9ad;--cd-dim-mid:#cacacd;--cd-dim-lo:#dcdcde}
.cd-stage svg[data-focus] [data-on] .iso-edge[data-tone="mid"]{stroke:var(--anatomy-hi)}
@media (max-width:640px){.cd-figure .iso-plate{padding-left:0;padding-right:0}.cd-figure .iso-plate-corners{inset:18px 14px}.cd-stage{overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;touch-action:pan-x pan-y}.cd-stage::-webkit-scrollbar{display:none}.cd-stage svg{width:860px;max-width:none}}
`;
