const fs = require("fs");
const https = require("https");

const username = process.env.GITHUB_USERNAME || "Yang1Bai";
const token = process.env.GITHUB_TOKEN || "";
const outputPath = process.argv[2] || "github-stats.svg";

function requestJson(url, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : null;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Yang1Bai-profile-stats",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: body ? "POST" : "GET", headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API returned ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        resolve(JSON.parse(data));
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function fetchStatsWithGraphql() {
  if (!token) {
    return null;
  }

  const query = `
    query($login: String!) {
      user(login: $login) {
        followers { totalCount }
        following { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: UPDATED_AT, direction: DESC}) {
          totalCount
          nodes {
            stargazerCount
            forkCount
            isFork
          }
        }
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
        }
      }
    }
  `;

  const result = await requestJson("https://api.github.com/graphql", {
    body: { query, variables: { login: username } },
  });

  if (result.errors) {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }

  const user = result.data.user;
  const repos = user.repositories.nodes;
  return {
    publicRepos: user.repositories.totalCount,
    stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    forks: repos.reduce((sum, repo) => sum + repo.forkCount, 0),
    followers: user.followers.totalCount,
    contributions: user.contributionsCollection.contributionCalendar.totalContributions,
  };
}

async function fetchStatsWithRest() {
  const user = await requestJson(`https://api.github.com/users/${username}`);
  const repos = await requestJson(`https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=updated`);

  return {
    publicRepos: user.public_repos,
    stars: repos.reduce((sum, repo) => sum + repo.stargazers_count, 0),
    forks: repos.reduce((sum, repo) => sum + repo.forks_count, 0),
    followers: user.followers,
    contributions: null,
  };
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statBlock(x, y, label, value, color) {
  return `
    <g transform="translate(${x} ${y})">
      <circle cx="7" cy="7" r="5" fill="${color}" />
      <text x="20" y="13" class="label">${escapeXml(label)}</text>
      <text x="20" y="40" class="value">${escapeXml(formatNumber(value))}</text>
    </g>`;
}

function buildSvg(stats) {
  const updated = new Date().toISOString().slice(0, 10);
  const contributionLabel = stats.contributions === null ? "Forks" : "Contributions";
  const contributionValue = stats.contributions === null ? stats.forks : stats.contributions;

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} GitHub Stats</title>
  <desc id="desc">Generated GitHub profile statistics for ${escapeXml(username)}.</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; }
    .title { fill: #e6edf3; font: 700 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .subtitle, .label { fill: #8b949e; font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .value { fill: #e6edf3; font: 700 25px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect class="card" x="0.5" y="0.5" width="494" height="194" rx="8" />
  <text x="24" y="38" class="title">${escapeXml(username)}'s GitHub Stats</text>
  <text x="24" y="61" class="subtitle">Auto-generated from the GitHub API • updated ${updated}</text>
  ${statBlock(24, 88, "Public Repos", stats.publicRepos, "#58a6ff")}
  ${statBlock(170, 88, "Total Stars", stats.stars, "#f2cc60")}
  ${statBlock(300, 88, "Followers", stats.followers, "#3fb950")}
  ${statBlock(24, 143, contributionLabel, contributionValue, "#bc8cff")}
</svg>
`;
}

async function main() {
  const stats = (await fetchStatsWithGraphql().catch(() => null)) || (await fetchStatsWithRest());
  fs.writeFileSync(outputPath, buildSvg(stats), "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
