import { parseSourceFile, buildCodeImpactData } from './ast/jsParser';
import { CodeImpactData, ParsedFile } from '@/types/impact';

interface GitHubTreeItem {
  path: string;
  type: string;
  url: string;
  size?: number;
}

export type GitHubErrorCategory =
  | 'invalid_url'
  | 'rate_limit'
  | 'access_denied'
  | 'not_found'
  | 'network'
  | 'unavailable';

export class GitHubFetchError extends Error {
  statusCode: number;
  category: GitHubErrorCategory;

  constructor(message: string, statusCode: number, category: GitHubErrorCategory) {
    super(message);
    this.name = 'GitHubFetchError';
    this.statusCode = statusCode;
    this.category = category;
  }
}

export function extractRepoOwnerAndName(urlOrPath: string): { owner: string; repo: string } | null {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;

  // Clean query strings, fragments, and trailing slashes
  const clean = urlOrPath.trim().split('?')[0].split('#')[0].replace(/\/$/, '');
  if (!clean) return null;

  // 1. Match SSH git@github.com:owner/repo(.git)?
  const sshMatch = clean.match(/^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, '') };
  }

  // 2. Match api.github.com/repos/owner/repo
  const apiMatch = clean.match(/^(?:https?:\/\/)?api\.github\.com\/repos\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
  if (apiMatch) {
    return { owner: apiMatch[1], repo: apiMatch[2].replace(/\.git$/, '') };
  }

  // 3. Match web URL github.com/owner/repo
  const match = clean.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  // 4. Handle direct "owner/repo" format
  const parts = clean.split('/');
  if (parts.length === 2 && !clean.startsWith('http://') && !clean.startsWith('https://')) {
    const owner = parts[0].trim();
    const repo = parts[1].trim().replace(/\.git$/, '');
    if (/^[a-zA-Z0-9_.-]+$/.test(owner) && /^[a-zA-Z0-9_.-]+$/.test(repo)) {
      return { owner, repo };
    }
  }

  return null;
}

export async function fetchAndAnalyzeGitHubRepo(
  repoUrl: string,
  githubToken?: string
): Promise<CodeImpactData> {
  const parsed = extractRepoOwnerAndName(repoUrl);
  if (!parsed) {
    throw new GitHubFetchError(
      `Invalid GitHub repository URL: "${repoUrl}". Expected format: https://github.com/owner/repo`,
      400,
      'invalid_url'
    );
  }

  const { owner, repo } = parsed;

  // Resolve token: user-provided token > server-side GITHUB_TOKEN
  const resolvedToken =
    (githubToken && githubToken.trim()) ||
    (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) ||
    (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) ||
    undefined;

  const authMode = githubToken?.trim()
    ? 'user_token'
    : resolvedToken
    ? 'server_token'
    : 'unauthenticated';

  console.log(`[GitHub Analyze] Initiating analysis for "${owner}/${repo}" (auth_mode=${authMode})`);

  const apiHeaders: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Code-Impact-Mapper-App',
  };

  if (resolvedToken) {
    apiHeaders['Authorization'] = `token ${resolvedToken}`;
  }

  // --------------------------------------------------------------------------
  // Step 1: Inspect Repository Metadata via GitHub API
  // --------------------------------------------------------------------------
  let defaultBranch = 'HEAD';
  let isPrivate = false;

  try {
    const metaUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const metaRes = await fetch(metaUrl, { headers: apiHeaders });
    const remLimit = metaRes.headers.get('x-ratelimit-remaining');
    console.log(`[GitHub Analyze] Repo metadata status for "${owner}/${repo}": ${metaRes.status} (ratelimit_remaining=${remLimit})`);

    if (metaRes.status === 200) {
      const metaData = await metaRes.json();
      defaultBranch = metaData.default_branch || 'HEAD';
      isPrivate = metaData.private || false;

      if (isPrivate && !resolvedToken) {
        throw new GitHubFetchError(
          `Repository "${owner}/${repo}" is private. Please provide a GitHub Personal Access Token with repository read access.`,
          403,
          'access_denied'
        );
      }
    } else if (metaRes.status === 401) {
      throw new GitHubFetchError(
        'GitHub authentication failed: Bad credentials or invalid token. Please verify your GitHub Personal Access Token.',
        401,
        'access_denied'
      );
    } else if (metaRes.status === 403) {
      const text = await metaRes.text();
      if (remLimit === '0' || text.toLowerCase().includes('rate limit') || text.toLowerCase().includes('secondary rate limit')) {
        throw new GitHubFetchError(
          'GitHub API rate limit exceeded. Please provide a GitHub Personal Access Token or try again later.',
          429,
          'rate_limit'
        );
      }
      throw new GitHubFetchError(
        `Access denied to repository "${owner}/${repo}". It may be private or access is restricted by organization policy.`,
        403,
        'access_denied'
      );
    } else if (metaRes.status === 404) {
      // Check if user/org exists
      try {
        const userCheck = await fetch(`https://api.github.com/users/${owner}`, {
          headers: { 'User-Agent': 'Code-Impact-Mapper-App' },
        });
        if (userCheck.status === 404) {
          throw new GitHubFetchError(
            `Repository "${owner}/${repo}" not found on GitHub. GitHub user or organization "${owner}" does not exist.`,
            404,
            'not_found'
          );
        }
      } catch (err) {
        if (err instanceof GitHubFetchError) throw err;
      }

      if (authMode === 'user_token') {
        throw new GitHubFetchError(
          `Repository "${owner}/${repo}" not found or access is denied with the provided token.`,
          404,
          'access_denied'
        );
      }
      throw new GitHubFetchError(
        `Repository "${owner}/${repo}" not found on GitHub. If this is a private repository, please provide a GitHub Personal Access Token.`,
        404,
        'not_found'
      );
    } else if (metaRes.status === 429) {
      throw new GitHubFetchError(
        'GitHub API rate limit exceeded. Please try again later or provide a Personal Access Token.',
        429,
        'rate_limit'
      );
    } else if (metaRes.status >= 500) {
      throw new GitHubFetchError(
        `GitHub API is temporarily unavailable (HTTP ${metaRes.status}). Please try again shortly.`,
        502,
        'unavailable'
      );
    }
  } catch (err: unknown) {
    if (err instanceof GitHubFetchError) throw err;
    console.warn(`[GitHub Analyze] Meta check error:`, err);
    // If network error occurred on fetch
    if (err instanceof TypeError && String(err.message).toLowerCase().includes('fetch')) {
      throw new GitHubFetchError(
        'GitHub connection error: Unable to connect to GitHub. Please check your network connection.',
        504,
        'network'
      );
    }
  }

  // --------------------------------------------------------------------------
  // Step 2: Fetch Repository Git Tree (with fallback refs)
  // --------------------------------------------------------------------------
  const refsToTry = Array.from(new Set([defaultBranch, 'HEAD', 'main', 'master']));
  let items: GitHubTreeItem[] = [];
  let lastTreeStatus = 0;

  for (const ref of refsToTry) {
    try {
      const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
      const treeRes = await fetch(treeUrl, { headers: apiHeaders });
      lastTreeStatus = treeRes.status;

      if (treeRes.ok) {
        const treeData = await treeRes.json();
        items = treeData.tree || [];
        console.log(`[GitHub Analyze] Successfully fetched git tree using ref "${ref}" (${items.length} items)`);
        break;
      } else if (treeRes.status === 403) {
        const remLimit = treeRes.headers.get('x-ratelimit-remaining');
        const text = await treeRes.text();
        if (remLimit === '0' || text.toLowerCase().includes('rate limit')) {
          throw new GitHubFetchError(
            'GitHub API rate limit exceeded. Please provide a GitHub Personal Access Token or try again later.',
            429,
            'rate_limit'
          );
        }
        throw new GitHubFetchError(
          `Access denied to repository "${owner}/${repo}" git tree.`,
          403,
          'access_denied'
        );
      }
    } catch (err: unknown) {
      if (err instanceof GitHubFetchError) throw err;
      console.warn(`[GitHub Analyze] Tree fetch failed for ref "${ref}":`, err);
    }
  }

  if (items.length === 0) {
    if (lastTreeStatus === 404) {
      throw new GitHubFetchError(
        `Could not retrieve file tree for repository "${owner}/${repo}". The repository may be empty or the default branch could not be resolved.`,
        404,
        'not_found'
      );
    }
    throw new GitHubFetchError(
      `Failed to fetch file tree for repository "${owner}/${repo}".`,
      500,
      'unavailable'
    );
  }

  // Filter JS / TS / JSX / TSX files (exclude tests, node_modules, dist)
  const validFiles = items.filter(
    (item) =>
      item.type === 'blob' &&
      /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(item.path) &&
      !item.path.includes('node_modules') &&
      !item.path.includes('.test.') &&
      !item.path.includes('.spec.') &&
      !item.path.includes('dist/') &&
      !item.path.includes('build/') &&
      (item.size || 0) < 300000 // 300KB limit
  );

  if (validFiles.length === 0) {
    throw new GitHubFetchError(
      `No parseable JavaScript or TypeScript source files found in repository "${owner}/${repo}".`,
      400,
      'not_found'
    );
  }

  // Limit to 30 files for fast and reliable analysis
  const filesToFetch = validFiles.slice(0, 30);
  const parsedFiles: ParsedFile[] = [];
  const fileContentsMap: Record<string, string> = {};

  // Plain headers for raw content (DO NOT pass Authorization to raw.githubusercontent.com for public files)
  const rawHeaders: Record<string, string> = {
    'User-Agent': 'Code-Impact-Mapper-App',
  };

  for (const file of filesToFetch) {
    let fileContent: string | null = null;

    // Strategy A: Try raw.githubusercontent.com
    const rawRefs = Array.from(new Set([defaultBranch, 'HEAD', 'main', 'master']));
    for (const ref of rawRefs) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${file.path}`;
        const fileRes = await fetch(rawUrl, { headers: rawHeaders });
        if (fileRes.ok) {
          fileContent = await fileRes.text();
          break;
        }
      } catch {
        // Fallback to next strategy
      }
    }

    // Strategy B: Fallback to GitHub Contents API (works for private repos with token or when raw is delayed)
    if (!fileContent) {
      try {
        const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`;
        const contentsRes = await fetch(contentsUrl, {
          headers: {
            ...apiHeaders,
            'Accept': 'application/vnd.github.v3.raw',
          },
        });
        if (contentsRes.ok) {
          fileContent = await contentsRes.text();
        }
      } catch {
        // Continue to next file
      }
    }

    if (fileContent) {
      fileContentsMap[file.path] = fileContent;
      try {
        const parsedFile = parseSourceFile(file.path, fileContent);
        if (parsedFile.functions.length > 0) {
          parsedFiles.push(parsedFile);
        }
      } catch (err) {
        console.warn(`[GitHub Analyze] Failed to parse ${file.path}:`, err);
      }
    }
  }

  if (parsedFiles.length === 0) {
    throw new GitHubFetchError(
      `Could not extract functions from the repository "${owner}/${repo}". The source files may contain unsupported syntax or no exported functions.`,
      400,
      'not_found'
    );
  }

  console.log(`[GitHub Analyze] Successfully parsed ${parsedFiles.length} files for "${owner}/${repo}"`);
  return buildCodeImpactData(`${owner}/${repo}`, parsedFiles, fileContentsMap);
}

