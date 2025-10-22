import { useCallback, useRef } from 'react';

interface UseDebouncedAutosaveOptions {
  delay?: number;
  onSave: (itemId: string, value: string) => void;
}

export function useDebouncedAutosave({ delay = 2000, onSave }: UseDebouncedAutosaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const currentItemRef = useRef<string>();

  const debouncedSave = useCallback((itemId: string, value: string) => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    currentItemRef.current = itemId;
    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      if (currentItemRef.current === itemId) {
        onSave(itemId, value);
      }
    }, delay);
  }, [delay, onSave]);

  const immediateSave = useCallback((itemId: string, value: string) => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Save immediately
    onSave(itemId, value);
  }, [onSave]);

  return { debouncedSave, immediateSave };
}
