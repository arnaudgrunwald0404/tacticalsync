import { useState, useEffect } from 'react';
import { MeetingTimerState, AgendaItem } from '@/types/meeting';

export function useMeetingTimer(): MeetingTimerState {
  const [meetingStarted, setMeetingStarted] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (meetingStarted && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [meetingStarted, startTime]);

  const startMeeting = () => {
    setMeetingStarted(true);
    setStartTime(new Date());
    setElapsedTime(0);
  };

  const stopMeeting = () => {
    setMeetingStarted(false);
    setStartTime(null);
    setElapsedTime(0);
  };

  const getItemProgress = (item: AgendaItem, itemIndex: number) => {
    if (!meetingStarted || !startTime) return 0;
    
    // Calculate cumulative time up to this item
    let cumulativeTime = 0;
    for (let i = 0; i < itemIndex; i++) {
      cumulativeTime += item.time_minutes || 0;
    }
    
    const itemStartSeconds = cumulativeTime * 60;
    const itemDurationSeconds = (item.time_minutes || 0) * 60;
    const itemEndSeconds = itemStartSeconds + itemDurationSeconds;
    
    // If we haven't reached this item yet
    if (elapsedTime < itemStartSeconds) return 0;
    
    // If we're past this item
    if (elapsedTime >= itemEndSeconds) return 100;
    
    // Calculate progress within this item
    const progressInItem = ((elapsedTime - itemStartSeconds) / itemDurationSeconds) * 100;
    return Math.max(0, Math.min(100, progressInItem));
  };

  return {
    meetingStarted,
    startTime,
    elapsedTime,
    startMeeting,
    stopMeeting,
    getItemProgress,
  };
}
