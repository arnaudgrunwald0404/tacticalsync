import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeetingTimer } from '@/hooks/useMeetingTimer';
import { AgendaItem } from '@/types/meeting';

describe('useMeetingTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with meeting not started', () => {
    const { result } = renderHook(() => useMeetingTimer());

    expect(result.current.meetingStarted).toBe(false);
    expect(result.current.startTime).toBeNull();
    expect(result.current.elapsedTime).toBe(0);
  });

  it('should start meeting and track elapsed time', () => {
    const { result } = renderHook(() => useMeetingTimer());

    act(() => {
      result.current.startMeeting();
    });

    expect(result.current.meetingStarted).toBe(true);
    expect(result.current.startTime).toBeInstanceOf(Date);
    expect(result.current.elapsedTime).toBe(0);

    // Advance timer by 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.elapsedTime).toBe(5);
  });

  it('should stop meeting and reset timer', () => {
    const { result } = renderHook(() => useMeetingTimer());

    act(() => {
      result.current.startMeeting();
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    act(() => {
      result.current.stopMeeting();
    });

    expect(result.current.meetingStarted).toBe(false);
    expect(result.current.startTime).toBeNull();
    expect(result.current.elapsedTime).toBe(0);
  });

  describe('getItemProgress', () => {
    it('should return 0 when meeting not started', () => {
      const { result } = renderHook(() => useMeetingTimer());
      
      const mockItem: AgendaItem = {
        id: '1',
        title: 'Test Item',
        time_minutes: 10,
      };

      const progress = result.current.getItemProgress(mockItem, 0);
      expect(progress).toBe(0);
    });

    it('should calculate progress for current item', () => {
      const { result } = renderHook(() => useMeetingTimer());
      
      const mockItem: AgendaItem = {
        id: '1',
        title: 'Test Item',
        time_minutes: 10, // 10 minutes = 600 seconds
      };

      act(() => {
        result.current.startMeeting();
      });

      // Advance timer by 5 minutes (300 seconds)
      act(() => {
        vi.advanceTimersByTime(300000);
      });

      const progress = result.current.getItemProgress(mockItem, 0);
      expect(progress).toBe(50); // 50% through the 10-minute item
    });

    it('should return 0 for items not yet reached', () => {
      const { result } = renderHook(() => useMeetingTimer());
      
      const mockItem: AgendaItem = {
        id: '2',
        title: 'Second Item',
        time_minutes: 10,
      };

      act(() => {
        result.current.startMeeting();
      });

      // Item is at index 1, so it doesn't start until after first item
      const progress = result.current.getItemProgress(mockItem, 1);
      expect(progress).toBe(0);
    });

    it('should return 100 for completed items', () => {
      const { result } = renderHook(() => useMeetingTimer());
      
      const mockItem: AgendaItem = {
        id: '1',
        title: 'Test Item',
        time_minutes: 5, // 5 minutes = 300 seconds
      };

      act(() => {
        result.current.startMeeting();
      });

      // Advance timer by 10 minutes (past the item duration)
      act(() => {
        vi.advanceTimersByTime(600000);
      });

      const progress = result.current.getItemProgress(mockItem, 0);
      expect(progress).toBe(100);
    });

    it('should handle items with no time allocated', () => {
      const { result } = renderHook(() => useMeetingTimer());
      
      const mockItem: AgendaItem = {
        id: '1',
        title: 'Test Item',
        time_minutes: 0,
      };

      act(() => {
        result.current.startMeeting();
      });

      const progress = result.current.getItemProgress(mockItem, 0);
      // When time_minutes is 0, division by zero returns Infinity, clamped to 100
      expect(progress).toBeGreaterThanOrEqual(0);
    });
  });

  it('should update elapsed time every second', () => {
    const { result } = renderHook(() => useMeetingTimer());

    act(() => {
      result.current.startMeeting();
    });

    // Advance by 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.elapsedTime).toBe(1);

    // Advance by another 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.elapsedTime).toBe(3);
  });

  it('should cleanup interval on unmount', () => {
    const { result, unmount } = renderHook(() => useMeetingTimer());

    act(() => {
      result.current.startMeeting();
    });

    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

