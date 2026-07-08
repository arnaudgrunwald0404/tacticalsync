import { describe, it, expect } from 'vitest';
import {
  computeAggregateStatus,
  buildMarkdownFromSteps,
  buildPlanSteps,
  type PlanStep,
} from '@/lib/delegationSteps';

function step(overrides: Partial<PlanStep>): PlanStep {
  return {
    id: 'step-1',
    order: 0,
    tool: 'create_meeting_topic',
    description: 'Do a thing',
    params: {},
    status: 'proposed',
    idempotency_key: 'key-1',
    ...overrides,
  };
}

describe('computeAggregateStatus', () => {
  it('returns null for an empty step array (legacy v1 delegation)', () => {
    expect(computeAggregateStatus([])).toBeNull();
  });

  it('returns seeking_approval when any step is still proposed', () => {
    const steps = [step({ status: 'succeeded' }), step({ id: 's2', status: 'proposed' })];
    expect(computeAggregateStatus(steps)).toBe('seeking_approval');
  });

  it('returns done when every step is succeeded, rejected, or skipped', () => {
    const steps = [step({ status: 'succeeded' }), step({ id: 's2', status: 'rejected' }), step({ id: 's3', status: 'skipped' })];
    expect(computeAggregateStatus(steps)).toBe('done');
  });

  it('returns getting_it_done when a step is approved but not yet run', () => {
    const steps = [step({ status: 'approved' })];
    expect(computeAggregateStatus(steps)).toBe('getting_it_done');
  });

  it('returns getting_it_done (not done) when a step has failed and needs attention', () => {
    // Per plan §5.2: never silently mark the whole delegation done while a step is stuck failed.
    const steps = [step({ status: 'succeeded' }), step({ id: 's2', status: 'failed' })];
    expect(computeAggregateStatus(steps)).toBe('getting_it_done');
  });

  it('returns getting_it_done while a step is running', () => {
    expect(computeAggregateStatus([step({ status: 'running' })])).toBe('getting_it_done');
  });
});

describe('buildMarkdownFromSteps', () => {
  it('renders steps as a numbered list in order, regardless of input order', () => {
    const steps = [
      step({ id: 's2', order: 1, description: 'Second thing' }),
      step({ id: 's1', order: 0, description: 'First thing' }),
    ];
    expect(buildMarkdownFromSteps(steps)).toBe('1. First thing\n2. Second thing');
  });

  it('returns an empty string for no steps', () => {
    expect(buildMarkdownFromSteps([])).toBe('');
  });
});

describe('buildPlanSteps', () => {
  const knownTools = ['create_meeting_topic', 'post_slack_update'] as const;
  const alwaysValid = () => null;
  let counter = 0;
  const genId = () => `id-${counter++}`;

  it('builds proposed steps with generated ids, order, and idempotency keys', () => {
    counter = 0;
    const raw = [
      { tool: 'create_meeting_topic', description: 'Add a topic', params: { series_id: 'abc' } },
      { tool: 'post_slack_update', description: 'Post an update', params: { message: 'hi' } },
    ];
    const { steps, dropped } = buildPlanSteps(raw, [...knownTools], alwaysValid, genId);
    expect(dropped).toEqual([]);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ tool: 'create_meeting_topic', order: 0, status: 'proposed' });
    expect(steps[1]).toMatchObject({ tool: 'post_slack_update', order: 1, status: 'proposed' });
    // Every step gets its own id and idempotency key — never shared across steps or reused.
    const ids = steps.map((s) => s.id);
    const keys = steps.map((s) => s.idempotency_key);
    expect(new Set(ids).size).toBe(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('drops steps naming an unknown tool', () => {
    const { steps, dropped } = buildPlanSteps(
      [{ tool: 'send_carrier_pigeon', params: {} }],
      [...knownTools],
      alwaysValid,
      genId,
    );
    expect(steps).toEqual([]);
    expect(dropped[0]).toContain('unknown tool');
  });

  it('drops steps whose params fail validation, keeping valid ones', () => {
    const validate = (tool: string, params: Record<string, unknown>) =>
      params.ok ? null : 'bad params';
    const { steps, dropped } = buildPlanSteps(
      [
        { tool: 'create_meeting_topic', params: { ok: false } },
        { tool: 'create_meeting_topic', params: { ok: true } },
      ],
      [...knownTools],
      validate,
      genId,
    );
    expect(steps).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });

  it('returns an empty plan with a diagnostic when the response is not an array', () => {
    const { steps, dropped } = buildPlanSteps('not an array', [...knownTools], alwaysValid, genId);
    expect(steps).toEqual([]);
    expect(dropped).toEqual(['response was not an array']);
  });

  it('falls back to a generic description when Claude omits one', () => {
    const { steps } = buildPlanSteps(
      [{ tool: 'create_meeting_topic', params: {} }],
      [...knownTools],
      alwaysValid,
      genId,
    );
    expect(steps[0].description).toBe('Run create_meeting_topic');
  });
});
