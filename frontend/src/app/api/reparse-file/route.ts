import { NextRequest, NextResponse } from 'next/server';
import { parseSourceFile } from '@/lib/ast/jsParser';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath, code }: { filePath: string; code: string } = body;

    if (!filePath || code === undefined) {
      return NextResponse.json({ error: 'filePath and code are required' }, { status: 400 });
    }

    const parsed = parseSourceFile(filePath, code);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reparse source file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
