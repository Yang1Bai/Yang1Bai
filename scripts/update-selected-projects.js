const fs = require("fs");
const https = require("https");

const username = process.env.GITHUB_USERNAME || "Yang1Bai";
const projectLimit = Number(process.env.PROJECT_LIMIT || 6);
const readmePath = process.env.README_PATH || "README.md";
const token = process.env.GITHUB_TOKEN || "";

const startMarker = "<!-- selected-projects:start -->";
const endMarker = "<!-- selected-projects:end -->";

const featuredOrder = [
  "nature-paper-hub",
  "SciVizKit",
  "github-machine-beacon",
  "codex-research-cli-toolkit",
  "ai-progress-site",
  "video_darkness_analysis",
  "finance-daily-site",
];

const featuredProjects = new Map([
  [
    "nature-paper-hub",
    {
      boost: 120,
      description:
        "AI-assisted workflow for Nature-style manuscript planning, drafting, figures, citations, and reviewer responses",
      signals: "AI agents, academic writing, materials science",
    },
  ],
  [
    "SciVizKit",
    {
      boost: 110,
      description: "Scientific visualization toolkit for choosing and producing publication-ready charts",
      signals: "data visualization, matplotlib, research",
    },
  ],
  [
    "github-machine-beacon",
    {
      boost: 100,
      description: "Experiment in making repositories easier for crawlers, indexers, and AI agents to discover and parse",
      signals: "llms.txt, JSON-LD, observability",
    },
  ],
  [
    "codex-research-cli-toolkit",
    {
      boost: 95,
      description: "Windows-first CLI and MCP toolkit for academic research workflows with Codex",
      signals: "PowerShell, MCP, research tooling",
    },
  ],
  [
    "ai-progress-site",
    {
      boost: 90,
      description: "Daily AI progress monitor focused on leader views, AI news, AI4Science, and AI4Materials",
      signals: "AI monitoring, automation, web publishing",
    },
  ],
  [
    "video_darkness_analysis",
    {
      boost: 85,
      description: "Supporting code for reaction-video optical analysis, including darkness and foam quantification",
      signals: "computer vision, materials science, Python",
    },
  ],
  [
    "finance-daily-site",
    {
      boost: 60,
      description: "Automated market briefing pipeline across indices, macro, earnings, sectors, and central banks",
      signals: "automation, market data, dashboards",
    },
  ],
]);

const topicWeights = new Map([
  ["materials-science", 25],
  ["ai4science", 25],
  ["automation", 20],
  ["machine-learning", 20],
  ["data-visualization", 18],
  ["scientific-computing", 18],
  ["computer-vision", 16],
  ["python", 12],
  ["mcp", 10],
]);

function requestJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${username}-profile-readme`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
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
      })
      .on("error", reject);
  });
}

function cleanDescription(description) {
  if (!description) {
    return "Public project from my GitHub workspace.";
  }

  const cleaned = description
    .replace(/\s*\|\s*[\s\S]*$/, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[\uFE0E\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");

  if (cleaned.length <= 150) {
    return cleaned;
  }

  return `${cleaned.slice(0, 147).replace(/\s+\S*$/, "")}...`;
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSignalTags(value) {
  return String(value)
    .split(",")
    .map((signal) => signal.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((signal) => `<code>${escapeHtml(signal)}</code>`)
    .join(" ");
}

function scoreRepo(repo) {
  const featured = featuredProjects.get(repo.name);
  const pushedAt = new Date(repo.pushed_at || repo.updated_at || repo.created_at).getTime();
  const daysOld = Math.max(0, (Date.now() - pushedAt) / 86400000);
  const recencyScore = Math.max(0, 45 - daysOld / 7);
  const topicScore = (repo.topics || []).reduce((sum, topic) => sum + (topicWeights.get(topic) || 0), 0);
  const description = `${repo.name} ${repo.description || ""}`.toLowerCase();
  const keywordScore = [
    "science",
    "materials",
    "automation",
    "agent",
    "visualization",
    "analysis",
    "ai",
    "machine learning",
  ].reduce((sum, keyword) => sum + (description.includes(keyword) ? 8 : 0), 0);

  return (featured?.boost || 0) + recencyScore + topicScore + keywordScore + repo.stargazers_count * 3;
}

function featuredRank(repoName) {
  const rank = featuredOrder.indexOf(repoName);
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
}

function buildProjectBlock(repos) {
  const cards = repos
    .filter((repo) => !repo.fork && !repo.archived && repo.name !== username)
    .map((repo) => ({ repo, score: scoreRepo(repo) }))
    .sort(
      (a, b) =>
        featuredRank(a.repo.name) - featuredRank(b.repo.name) ||
        b.score - a.score ||
        new Date(b.repo.pushed_at) - new Date(a.repo.pushed_at),
    )
    .slice(0, projectLimit)
    .map(({ repo }) => {
      const featured = featuredProjects.get(repo.name);
      const topics = featured?.signals || (repo.topics || []).slice(0, 3).join(", ") || repo.language || "research software";
      const description = featured?.description || cleanDescription(repo.description);
      return {
        name: repo.name,
        url: repo.html_url,
        description,
        topics,
      };
    });

  const rows = [];
  for (let index = 0; index < cards.length; index += 2) {
    const pair = cards.slice(index, index + 2);
    rows.push("  <tr>");
    pair.forEach((repo) => {
      rows.push("    <td width=\"50%\" valign=\"top\">");
      rows.push(`      <a href="${escapeHtml(repo.url)}"><strong>${escapeHtml(repo.name)}</strong></a><br>`);
      rows.push(`      <sub>${escapeHtml(repo.description)}</sub><br>`);
      rows.push(`      ${buildSignalTags(repo.topics)}`);
      rows.push("    </td>");
    });
    if (pair.length === 1) {
      rows.push("    <td width=\"50%\" valign=\"top\"></td>");
    }
    rows.push("  </tr>");
  }

  return [startMarker, "<table>", ...rows, "</table>", endMarker].join("\n");
}

async function main() {
  const repos = await requestJson(`https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=pushed`);
  const readme = fs.readFileSync(readmePath, "utf8");
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find ${startMarker} / ${endMarker} in ${readmePath}`);
  }

  const nextBlock = buildProjectBlock(repos);
  const nextReadme = `${readme.slice(0, start)}${nextBlock}${readme.slice(end + endMarker.length)}`;

  if (nextReadme === readme) {
    console.log("Selected projects are already up to date.");
    return;
  }

  fs.writeFileSync(readmePath, nextReadme, "utf8");
  console.log("Updated selected projects in README.md.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
