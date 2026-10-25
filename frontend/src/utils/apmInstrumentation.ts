import guide from './generated/apmGuide.json';

export { default as APM_GUIDE } from './generated/apmGuide.json';
export type InstrumentationBlock = Readonly<{ id: string; title: string; language: string; code: string; filename?: string }>;
export type InstrumentationRuntime = Readonly<{ id: string; label: string; anchor: string; description: string; collector: boolean; blocks: readonly InstrumentationBlock[] }>;

export function instrumentationBlocks(runtime: InstrumentationRuntime): readonly InstrumentationBlock[] {
    return runtime.collector ? [...guide.collector.blocks, ...runtime.blocks] : runtime.blocks;
}

export function instrumentationMarkdown(runtime: InstrumentationRuntime): string {
    const blocks = instrumentationBlocks(runtime).map(block =>
        ['### ' + block.title, block.filename || '', '```' + block.language, block.code, '```'].join('\n'));
    return ['# ' + runtime.label, guide.endpointNotes, guide.shellNotes, runtime.description,
        runtime.collector ? guide.collector.description : '', ...blocks, '## Verify delivery', guide.verification].join('\n\n');
}
