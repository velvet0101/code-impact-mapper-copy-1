import { NextRequest, NextResponse } from 'next/server';
import { fetchAndAnalyzeGitHubRepo, GitHubFetchError } from '@/lib/githubFetcher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoUrl, githubToken }: { repoUrl: string; githubToken?: string } = body;

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 });
    }

    const impactData = await fetchAndAnalyzeGitHubRepo(repoUrl, githubToken);
    return NextResponse.json(impactData);
  } catch (err: unknown) {
    if (err instanceof GitHubFetchError) {
      return NextResponse.json(
        { error: err.message, category: err.category },
        { status: err.statusCode }
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to analyze repository';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

