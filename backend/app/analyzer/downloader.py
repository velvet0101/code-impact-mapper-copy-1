import os
import re
import shutil
import tempfile
import logging
import requests
import zipfile
import io
from typing import Tuple, Dict, List, Set, Optional
from app.analyzer.parser import is_supported_file

logger = logging.getLogger("analyzer.downloader")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


# ==============================================================================
# Error Classification Hierarchy
# ==============================================================================

class GitHubError(Exception):
    """Base exception for all GitHub operations."""
    pass

class InvalidGitHubURLError(GitHubError, ValueError):
    """Raised when GitHub URL format is malformed or invalid."""
    pass

class GitHubRateLimitError(GitHubError):
    """Raised when GitHub API rate limit is reached (HTTP 403/429)."""
    pass

class GitHubAccessDeniedError(GitHubError):
    """Raised when repository is private, unauthorized, or access is blocked (HTTP 401/403)."""
    pass

class GitHubRepoNotFoundError(GitHubError):
    """Raised when repository genuinely does not exist on GitHub (HTTP 404)."""
    pass

class GitHubConnectionError(GitHubError):
    """Raised on network timeout, DNS failure, or aborted connection."""
    pass

class GitHubAPIUnavailableError(GitHubError):
    """Raised when GitHub API returns 5xx server errors."""
    pass


# ==============================================================================
# URL Parsing & Normalization
# ==============================================================================

def parse_github_url(url_or_path: str) -> Tuple[str, str]:
    """
    Extract owner and repo name from GitHub URL or shorthand.
    Supports:
    - https://github.com/owner/repo
    - http://github.com/owner/repo
    - github.com/owner/repo
    - git@github.com:owner/repo.git
    - https://api.github.com/repos/owner/repo
    - owner/repo shorthand
    - URLs with trailing .git, trailing slashes, /tree/..., /blob/..., query params, hashes
    """
    if not url_or_path or not isinstance(url_or_path, str):
        raise InvalidGitHubURLError("Repository URL is required. Expected format: https://github.com/owner/repo")

    clean = url_or_path.strip()
    if not clean:
        raise InvalidGitHubURLError("Repository URL cannot be empty. Expected format: https://github.com/owner/repo")

    # Strip query parameters (?...) and hash fragments (#...)
    clean = clean.split('?')[0].split('#')[0].rstrip('/')

    # 1. Match SSH git@github.com:owner/repo(.git)?
    ssh_match = re.match(r'^git@github\.com:([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+?)(?:\.git)?$', clean)
    if ssh_match:
        owner = ssh_match.group(1).strip()
        repo = ssh_match.group(2).strip().replace('.git', '')
        if _is_valid_name(owner) and _is_valid_name(repo):
            return owner, repo

    # 2. Match api.github.com/repos/owner/repo
    api_match = re.match(r'^(?:https?://)?api\.github\.com/repos/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)', clean, re.IGNORECASE)
    if api_match:
        owner = api_match.group(1).strip()
        repo = api_match.group(2).strip().replace('.git', '')
        if _is_valid_name(owner) and _is_valid_name(repo):
            return owner, repo

    # 3. Match web URL github.com/owner/repo (with optional tree/blob paths following)
    web_match = re.search(r'github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)', clean, re.IGNORECASE)
    if web_match:
        owner = web_match.group(1).strip()
        repo = web_match.group(2).strip().replace('.git', '')
        if _is_valid_name(owner) and _is_valid_name(repo):
            return owner, repo

    # 4. Handle direct "owner/repo" format (without http/https)
    parts = clean.split('/')
    if len(parts) == 2 and not clean.startswith(('http://', 'https://')):
        owner = parts[0].strip()
        repo = parts[1].strip().replace('.git', '')
        if _is_valid_name(owner) and _is_valid_name(repo):
            return owner, repo

    raise InvalidGitHubURLError(
        f"Invalid GitHub repository URL: '{url_or_path}'. Expected format: https://github.com/owner/repo"
    )

def _is_valid_name(name: str) -> bool:
    """Validates GitHub username/org or repository name characters."""
    return bool(re.match(r'^[a-zA-Z0-9_.-]+$', name))


# ==============================================================================
# Authentication & Header Helpers (Safe Logging)
# ==============================================================================

def get_auth_headers(user_token: Optional[str] = None) -> Tuple[Dict[str, str], str]:
    """
    Returns (headers, auth_mode) where auth_mode is 'user_token', 'server_token', or 'unauthenticated'.
    NEVER logs or exposes the token value.
    """
    token = user_token.strip() if user_token and user_token.strip() else None
    auth_mode = "user_token" if token else None

    if not token:
        server_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if server_token and server_token.strip():
            token = server_token.strip()
            auth_mode = "server_token"
        else:
            auth_mode = "unauthenticated"

    headers = {
        'User-Agent': 'Code-Impact-Mapper-Backend',
        'Accept': 'application/vnd.github.v3+json',
    }
    if token:
        headers['Authorization'] = f"token {token}"

    return headers, auth_mode


# ==============================================================================
# Downloader Implementation
# ==============================================================================

def download_github_repo(
    repo_url: str, github_token: Optional[str] = None
) -> Tuple[str, str, Dict[str, str], int, int, int]:
    """
    Downloads GitHub repo zip archive into a temporary directory.
    Implements multi-tier fallback for public repos, full error classification,
    and safe diagnostic logging.

    Returns: (temp_dir_path, repo_name, source_files_dict, total_files, supported_count, unsupported_count)
    """
    owner, repo = parse_github_url(repo_url)
    repo_name = f"{owner}/{repo}"

    headers, auth_mode = get_auth_headers(github_token)
    logger.info("Initiating GitHub repo analysis for '%s' (auth_mode=%s)", repo_name, auth_mode)

    # --------------------------------------------------------------------------
    # Step 1: Inspect Repository Metadata via GitHub API
    # --------------------------------------------------------------------------
    meta_url = f"https://api.github.com/repos/{owner}/{repo}"
    meta_res = None
    is_rate_limited = False
    default_branch = "HEAD"
    repo_confirmed_public = False

    try:
        meta_res = requests.get(meta_url, headers=headers, timeout=15)
        rem_limit = meta_res.headers.get("x-ratelimit-remaining", "unknown")
        logger.info(
            "GitHub repos API response for '%s': status=%d, ratelimit_remaining=%s",
            repo_name, meta_res.status_code, rem_limit
        )

        if meta_res.status_code == 200:
            data = meta_res.json()
            is_private = data.get("private", False)
            default_branch = data.get("default_branch", "HEAD")
            repo_confirmed_public = not is_private
            logger.info("Repository '%s' confirmed (is_private=%s, default_branch=%s)", repo_name, is_private, default_branch)

            if is_private and auth_mode == "unauthenticated":
                raise GitHubAccessDeniedError(
                    f"Repository '{repo_name}' is private. Please provide a GitHub Personal Access Token with repository read access."
                )

        elif meta_res.status_code == 401:
            # Bad credentials provided
            if auth_mode == "server_token":
                logger.warning("Server GITHUB_TOKEN has bad credentials. Retrying inspection unauthenticated.")
                headers, auth_mode = {'User-Agent': 'Code-Impact-Mapper-Backend', 'Accept': 'application/vnd.github.v3+json'}, "unauthenticated"
                try:
                    retry_res = requests.get(meta_url, headers=headers, timeout=10)
                    if retry_res.status_code == 200:
                        data = retry_res.json()
                        default_branch = data.get("default_branch", "HEAD")
                        repo_confirmed_public = not data.get("private", False)
                except Exception as e:
                    logger.debug("Unauthenticated retry error: %s", e)
            else:
                raise GitHubAccessDeniedError(
                    "GitHub authentication failed: Bad credentials or invalid token. Please check your GitHub Personal Access Token."
                )

        elif meta_res.status_code == 403:
            rem = meta_res.headers.get("x-ratelimit-remaining", "")
            body_text = meta_res.text.lower()
            if rem == "0" or "rate limit" in body_text or "secondary rate limit" in body_text:
                is_rate_limited = True
                logger.warning("GitHub API rate limit exceeded on metadata call for '%s'", repo_name)
            else:
                raise GitHubAccessDeniedError(
                    f"Access denied to repository '{repo_name}'. It may be private or access is restricted by organization policy."
                )

        elif meta_res.status_code == 429:
            is_rate_limited = True
            logger.warning("GitHub API 429 received for '%s'", repo_name)

        elif meta_res.status_code >= 500:
            logger.warning("GitHub API 5xx (%d) received for '%s'", meta_res.status_code, repo_name)

        elif meta_res.status_code == 404:
            # Check whether the owner exists to separate "repo not found" from "owner not found"
            try:
                owner_check = requests.get(f"https://api.github.com/users/{owner}", headers={'User-Agent': 'Code-Impact-Mapper-Backend'}, timeout=8)
                if owner_check.status_code == 404:
                    raise GitHubRepoNotFoundError(
                        f"Repository '{repo_name}' not found on GitHub. GitHub user or organization '{owner}' does not exist."
                    )
            except (GitHubRepoNotFoundError, GitHubAccessDeniedError):
                raise
            except Exception:
                pass

            if auth_mode == "user_token":
                raise GitHubAccessDeniedError(
                    f"Repository '{repo_name}' not found or access is denied with the provided token. Verify that the repository name is correct and your token has read access."
                )
            else:
                # Could be a non-existent repo or private repo without token.
                # Check codeload public archive before failing.
                pass

    except (GitHubRateLimitError, GitHubAccessDeniedError, GitHubRepoNotFoundError, InvalidGitHubURLError):
        raise
    except requests.exceptions.Timeout:
        logger.error("Timeout connecting to GitHub API for '%s'", repo_name)
        raise GitHubConnectionError(
            f"GitHub connection error: Request timed out while inspecting repository '{repo_name}'. Please check your network connection."
        )
    except requests.exceptions.ConnectionError:
        logger.error("Connection error reaching GitHub API for '%s'", repo_name)
        raise GitHubConnectionError(
            f"GitHub connection error: Unable to connect to GitHub for repository '{repo_name}'. Please check your network connection."
        )
    except Exception as e:
        logger.warning("Unexpected error during repo metadata check: %s", e)

    # --------------------------------------------------------------------------
    # Step 2: Download Archive with Multi-Tier Fallback
    # --------------------------------------------------------------------------
    download_candidates: List[Tuple[str, Dict[str, str], str]] = []

    # If we have an authenticated session and no rate limit, API zipball is preferred
    if not is_rate_limited and auth_mode != "unauthenticated":
        download_candidates.append((
            f"https://api.github.com/repos/{owner}/{repo}/zipball/{default_branch}",
            headers,
            "api_zipball_default_branch"
        ))
        download_candidates.append((
            f"https://api.github.com/repos/{owner}/{repo}/zipball",
            headers,
            "api_zipball_default"
        ))

    # Public CDN candidates (never consume GitHub REST API rate limit!)
    public_headers = {'User-Agent': 'Code-Impact-Mapper-Backend'}
    download_candidates.append((
        f"https://codeload.github.com/{owner}/{repo}/legacy.zip/HEAD",
        public_headers,
        "codeload_legacy_head"
    ))
    if default_branch and default_branch != "HEAD":
        download_candidates.append((
            f"https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{default_branch}",
            public_headers,
            "codeload_branch"
        ))
    download_candidates.append((
        f"https://api.github.com/repos/{owner}/{repo}/zipball",
        headers,
        "api_zipball_fallback"
    ))

    res = None
    last_status = None
    last_error = None

    for download_url, req_headers, strategy_name in download_candidates:
        try:
            logger.info("Attempting archive download for '%s' using strategy '%s'", repo_name, strategy_name)
            candidate_res = requests.get(download_url, headers=req_headers, timeout=30)
            last_status = candidate_res.status_code

            if candidate_res.status_code == 200 and len(candidate_res.content) > 0:
                # Verify valid zip payload
                try:
                    with zipfile.ZipFile(io.BytesIO(candidate_res.content)):
                        res = candidate_res
                        logger.info(
                            "Successfully retrieved archive for '%s' via '%s' (bytes=%d)",
                            repo_name, strategy_name, len(candidate_res.content)
                        )
                        break
                except zipfile.BadZipFile:
                    logger.warning("Downloaded payload from '%s' was not a valid zip file", strategy_name)
                    continue

            elif candidate_res.status_code == 403:
                rem = candidate_res.headers.get("x-ratelimit-remaining", "")
                if rem == "0" or "rate limit" in candidate_res.text.lower():
                    is_rate_limited = True
                    logger.warning("Strategy '%s' hit GitHub rate limit", strategy_name)
                else:
                    last_error = "access_denied"

            elif candidate_res.status_code == 404:
                logger.debug("Strategy '%s' returned 404 for '%s'", strategy_name, repo_name)

        except requests.exceptions.Timeout:
            logger.warning("Strategy '%s' timed out for '%s'", strategy_name, repo_name)
        except requests.exceptions.ConnectionError:
            logger.warning("Strategy '%s' connection error for '%s'", strategy_name, repo_name)
        except Exception as e:
            logger.warning("Strategy '%s' error: %s", strategy_name, e)

    # If archive download failed across all candidates, classify error accurately
    if not res:
        if is_rate_limited:
            raise GitHubRateLimitError(
                f"GitHub API rate limit reached for '{repo_name}'. Please provide a GitHub Personal Access Token in the modal, or try again later."
            )
        elif last_status == 403 or last_error == "access_denied":
            raise GitHubAccessDeniedError(
                f"Access denied to repository '{repo_name}'. The repository is private or requires authorization."
            )
        elif last_status == 404:
            if meta_res and meta_res.status_code == 404:
                raise GitHubRepoNotFoundError(
                    f"Repository '{repo_name}' not found on GitHub. If this is a private repository, please provide a GitHub Personal Access Token."
                )
            raise GitHubRepoNotFoundError(
                f"Repository '{repo_name}' archive could not be found. Please check that the repository name and default branch are valid."
            )
        elif last_status and last_status >= 500:
            raise GitHubAPIUnavailableError(
                f"GitHub API is temporarily unavailable (HTTP {last_status}). Please try again shortly."
            )
        else:
            raise GitHubConnectionError(
                f"Failed to fetch repository archive for '{repo_name}'. Please verify your internet connection and GitHub status."
            )

    # --------------------------------------------------------------------------
    # Step 3: Unpack & Scan Source Files
    # --------------------------------------------------------------------------
    temp_dir = tempfile.mkdtemp(prefix=f"impact_repo_{repo}_")
    source_files: Dict[str, str] = {}
    total_files = 0
    supported_count = 0
    unsupported_count = 0

    try:
        with zipfile.ZipFile(io.BytesIO(res.content)) as z:
            for member in z.infolist():
                path_parts = member.filename.split('/')
                rel_path = "/".join(path_parts[1:])  # Strip top-level zip folder name

                if not rel_path or member.is_dir():
                    continue

                # Ignore non-source or heavy directories
                if any(p in path_parts for p in ['.git', 'node_modules', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv']):
                    continue

                total_files += 1

                if is_supported_file(rel_path):
                    supported_count += 1
                    if member.file_size < 300000:  # 300KB limit per file for static analysis
                        try:
                            content = z.read(member).decode('utf-8', errors='ignore')
                            source_files[rel_path] = content
                        except Exception as e:
                            logger.warning("Skipping file '%s' due to read error: %s", rel_path, e)
                else:
                    unsupported_count += 1

    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise ValueError(f"Failed to extract repository archive for '{repo_name}': {str(e)}")

    if not source_files:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise ValueError(
            f"No parseable JavaScript or TypeScript files found in repository '{repo_name}'. (Total files scanned: {total_files}, Unsupported files: {unsupported_count})"
        )

    logger.info(
        "Successfully unpacked '%s': total_files=%d, supported=%d, unsupported=%d",
        repo_name, total_files, supported_count, unsupported_count
    )

    return temp_dir, repo_name, source_files, total_files, supported_count, unsupported_count


def cleanup_temp_dir(temp_dir: str):
    """Clean up temp directory after analysis."""
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir, ignore_errors=True)

