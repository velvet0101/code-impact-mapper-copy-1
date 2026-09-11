import { NextRequest, NextResponse } from 'next/server';
import { generateAIImpactExplanation } from '@/lib/ai/geminiExplainer';
import { BlastRadiusResult } from '@/types/impact';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blastRadius, apiKey }: { blastRadius: BlastRadiusResult; apiKey?: string } = body;

    if (!blastRadius || !blastRadius.focalNode) {
      return NextResponse.json({ error: 'Invalid blast radius payload' }, { status: 400 });
    }

    const explanation = await generateAIImpactExplanation(blastRadius, apiKey);
    return NextResponse.json(explanation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
