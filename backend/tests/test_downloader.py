import pytest
from unittest.mock import patch, MagicMock
import io
import zipfile
from app.analyzer.downloader import (
    parse_github_url,
    download_github_repo,
    get_auth_headers,
    InvalidGitHubURLError,
    GitHubRateLimitError,
    GitHubAccessDeniedError,
    GitHubRepoNotFoundError,
    GitHubConnectionError,
    GitHubAPIUnavailableError,
)

# ==============================================================================
# 1. URL Parsing Tests
# ==============================================================================

def test_parse_github_url_valid_formats():
    valid_urls = [
        ('https://github.com/expressjs/cors', ('expressjs', 'cors')),
        ('https://github.com/expressjs/cors/', ('expressjs', 'cors')),
        ('https://github.com/expressjs/cors.git', ('expressjs', 'cors')),
        ('http://github.com/expressjs/cors', ('expressjs', 'cors')),
        ('github.com/expressjs/cors', ('expressjs', 'cors')),
        ('expressjs/cors', ('expressjs', 'cors')),
        ('git@github.com:expressjs/cors.git', ('expressjs', 'cors')),
        ('git@github.com:expressjs/cors', ('expressjs', 'cors')),
        ('https://github.com/expressjs/cors/tree/master', ('expressjs', 'cors')),
        ('https://github.com/expressjs/cors/blob/master/README.md', ('expressjs', 'cors')),
        ('https://github.com/expressjs/cors?tab=readme', ('expressjs', 'cors')),
        ('https://github.com/expressjs/cors#features', ('expressjs', 'cors')),
        ('https://api.github.com/repos/expressjs/cors', ('expressjs', 'cors')),
    ]
    for url, expected in valid_urls:
        assert parse_github_url(url) == expected, f'Failed for URL: {url}'

def test_parse_github_url_invalid_formats():
    invalid_urls = [
        '',
        '   ',
        'https://gitlab.com/owner/repo',
        'https://bitbucket.org/owner/repo',
        'justastring',
        'https://github.com/',
        'https://github.com/onlyowner',
        'http:///',
    ]
    for url in invalid_urls:
        with pytest.raises(InvalidGitHubURLError):
            parse_github_url(url)


# ==============================================================================
# 2. Auth Headers & Secret Safety Tests
# ==============================================================================

def test_get_auth_headers_safety():
    headers, mode = get_auth_headers(None)
    assert mode == 'unauthenticated'
    assert 'Authorization' not in headers

    headers, mode = get_auth_headers('ghp_secret_token_12345')
    assert mode == 'user_token'
    assert headers['Authorization'] == 'token ghp_secret_token_12345'
    # Ensure token is never stored in mode string
    assert 'secret' not in mode


# ==============================================================================
# 3. Error Classification Tests (Mocked)
# ==============================================================================

def _make_mock_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        z.writestr('root/index.js', 'export function hello() { return 42; }')
    buf.seek(0)
    return buf.getvalue()

@patch('requests.get')
def test_download_public_repo_success(mock_get):
    meta_response = MagicMock()
    meta_response.status_code = 200
    meta_response.json.return_value = {'private': False, 'default_branch': 'master'}
    meta_response.headers = {'x-ratelimit-remaining': '55'}

    zip_response = MagicMock()
    zip_response.status_code = 200
    zip_response.content = _make_mock_zip()

    mock_get.side_effect = [meta_response, zip_response]

    temp_dir, repo_name, source_files, total_files, supported, unsupported = download_github_repo(
        'https://github.com/expressjs/cors'
    )
    assert repo_name == 'expressjs/cors'
    assert len(source_files) == 1
    assert 'index.js' in source_files

@patch('requests.get')
def test_private_or_inaccessible_repo_with_403(mock_get):
    res = MagicMock()
    res.status_code = 403
    res.headers = {'x-ratelimit-remaining': '45'}
    res.text = 'Resource not accessible by personal access token'
    mock_get.return_value = res

    with pytest.raises(GitHubAccessDeniedError) as exc:
        download_github_repo('https://github.com/some-org/private-repo')
    assert 'Access denied' in str(exc.value) or 'private' in str(exc.value)

@patch('requests.get')
def test_rate_limit_403(mock_get):
    res = MagicMock()
    res.status_code = 403
    res.headers = {'x-ratelimit-remaining': '0'}
    res.text = 'API rate limit exceeded for 1.2.3.4'
    mock_get.return_value = res

    with pytest.raises(GitHubRateLimitError) as exc:
        download_github_repo('https://github.com/expressjs/cors')
    assert 'rate limit' in str(exc.value).lower()

@patch('requests.get')
def test_rate_limit_429(mock_get):
    res = MagicMock()
    res.status_code = 429
    res.headers = {}
    res.text = 'Too Many Requests'
    mock_get.return_value = res

    with pytest.raises(GitHubRateLimitError) as exc:
        download_github_repo('https://github.com/expressjs/cors')
    assert 'rate limit' in str(exc.value).lower()

@patch('requests.get')
def test_repo_not_found_404(mock_get):
    # Meta returns 404
    meta_res = MagicMock()
    meta_res.status_code = 404
    meta_res.headers = {'x-ratelimit-remaining': '50'}

    # User check returns 404 (nonexistent owner)
    owner_res = MagicMock()
    owner_res.status_code = 404

    mock_get.side_effect = [meta_res, owner_res]

    with pytest.raises(GitHubRepoNotFoundError) as exc:
        download_github_repo('https://github.com/nonexistent-owner-12345/no-repo')
    assert 'not found on GitHub' in str(exc.value)

@patch('requests.get')
def test_network_connection_error(mock_get):
    import requests
    mock_get.side_effect = requests.exceptions.ConnectionError('Failed to establish a new connection')

    with pytest.raises(GitHubConnectionError) as exc:
        download_github_repo('https://github.com/expressjs/cors')
    assert 'connection error' in str(exc.value).lower()

@patch('requests.get')
def test_network_timeout(mock_get):
    import requests
    mock_get.side_effect = requests.exceptions.Timeout('Connection timed out')

    with pytest.raises(GitHubConnectionError) as exc:
        download_github_repo('https://github.com/expressjs/cors')
    assert 'connection error' in str(exc.value).lower() or 'timed out' in str(exc.value).lower()

@patch('requests.get')
def test_api_unavailable_503(mock_get):
    meta_res = MagicMock()
    meta_res.status_code = 503
    mock_get.return_value = meta_res

    with pytest.raises(GitHubAPIUnavailableError) as exc:
        download_github_repo('https://github.com/expressjs/cors')
    assert 'unavailable' in str(exc.value).lower()


# ==============================================================================
# 4. API Status Code & Error Mapping Tests (FastAPI TestClient)
# ==============================================================================

from fastapi.testclient import TestClient
from app.main import app

api_client = TestClient(app)

def test_api_analyze_missing_url():
    res = api_client.post('/api/repository/analyze', json={'repo_url': ''})
    assert res.status_code == 400
    assert 'required' in res.json()['detail'].lower()

@patch('app.api.repo.download_github_repo')
def test_api_analyze_invalid_url_mapping(mock_dl):
    mock_dl.side_effect = InvalidGitHubURLError("Invalid GitHub repository URL: 'bad'. Expected format: https://github.com/owner/repo")
    res = api_client.post('/api/repository/analyze', json={'repo_url': 'bad'})
    assert res.status_code == 400
    assert 'invalid' in res.json()['detail'].lower()

@patch('app.api.repo.download_github_repo')
def test_api_analyze_not_found_mapping(mock_dl):
    mock_dl.side_effect = GitHubRepoNotFoundError("Repository 'foo/bar' not found on GitHub.")
    res = api_client.post('/api/repository/analyze', json={'repo_url': 'https://github.com/foo/bar'})
    assert res.status_code == 404
    assert 'not found' in res.json()['detail'].lower()

@patch('app.api.repo.download_github_repo')
def test_api_analyze_access_denied_mapping(mock_dl):
    mock_dl.side_effect = GitHubAccessDeniedError("Repository 'foo/private' is private. Please provide a GitHub Personal Access Token.")
    res = api_client.post('/api/repository/analyze', json={'repo_url': 'https://github.com/foo/private'})
    assert res.status_code == 403
    assert 'private' in res.json()['detail'].lower() or 'access denied' in res.json()['detail'].lower()

@patch('app.api.repo.download_github_repo')
def test_api_analyze_rate_limit_mapping(mock_dl):
    mock_dl.side_effect = GitHubRateLimitError("GitHub API rate limit reached. Please provide a GitHub Personal Access Token.")
    res = api_client.post('/api/repository/analyze', json={'repo_url': 'https://github.com/foo/bar'})
    assert res.status_code == 429
    assert 'rate limit' in res.json()['detail'].lower()

@patch('app.api.repo.download_github_repo')
def test_api_analyze_connection_error_mapping(mock_dl):
    mock_dl.side_effect = GitHubConnectionError("GitHub connection error: Request timed out.")
    res = api_client.post('/api/repository/analyze', json={'repo_url': 'https://github.com/foo/bar'})
    assert res.status_code == 504
    assert 'connection error' in res.json()['detail'].lower()

@patch('app.api.repo.download_github_repo')
def test_api_analyze_api_unavailable_mapping(mock_dl):
    mock_dl.side_effect = GitHubAPIUnavailableError("GitHub API is temporarily unavailable (HTTP 503).")
    res = api_client.post('/api/repository/analyze', json={'repo_url': 'https://github.com/foo/bar'})
    assert res.status_code == 502
    assert 'unavailable' in res.json()['detail'].lower()

