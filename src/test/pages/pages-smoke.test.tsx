import { describe, it, expect } from 'vitest';

/**
 * Smoke tests to verify pages can be imported without errors.
 * This is a lightweight check that pages are syntactically correct.
 */
describe('Page Smoke Tests - Import Verification', () => {
  it('should import Index page', async () => {
    const module = await import('@/pages/Index');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import Auth page', async () => {
    const module = await import('@/pages/Auth');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import Dashboard page', async () => {
    const module = await import('@/pages/Dashboard');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import DashboardMain page', async () => {
    const module = await import('@/pages/DashboardMain');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import SIDetail page', async () => {
    const module = await import('@/pages/SIDetail');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import DODetail page', async () => {
    const module = await import('@/pages/DODetail');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import TasksFeed page', async () => {
    const module = await import('@/pages/TasksFeed');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import StrategyCanvas page', async () => {
    const module = await import('@/pages/StrategyCanvas');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import StrategyHome page', async () => {
    const module = await import('@/pages/StrategyHome');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import Profile page', async () => {
    const module = await import('@/pages/Profile');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import Settings page', async () => {
    const module = await import('@/pages/Settings');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  it('should import NotFound page', async () => {
    const module = await import('@/pages/NotFound');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });
});

