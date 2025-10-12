import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, getWeek, format, addDays, addWeeks, addMonths, addQuarters } from 'date-fns';

/**
 * Get the start of the current week (Monday)
 */
export const getMondayStartOfWeek = (date: Date = new Date()): Date => {
  return startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
};

/**
 * Get the end of the current week (Friday)
 * @deprecated Use getSundayEndOfWeek for full week coverage
 */
export const getFridayEndOfWeek = (date: Date = new Date()): Date => {
  const monday = getMondayStartOfWeek(date);
  return addDays(monday, 4); // Monday + 4 days = Friday
};

/**
 * Get the end of the current week (Sunday)
 */
export const getSundayEndOfWeek = (date: Date = new Date()): Date => {
  const monday = getMondayStartOfWeek(date);
  return addDays(monday, 6); // Monday + 6 days = Sunday
};

/**
 * Get the proper start date for a meeting period based on frequency
 */
export const getMeetingStartDate = (frequency: string, referenceDate: Date = new Date()): Date => {
  switch (frequency) {
    case 'daily':
      return new Date(referenceDate);
    
    case 'weekly':
    case 'bi-weekly':
      return getMondayStartOfWeek(referenceDate);
    
    case 'monthly':
      return startOfMonth(referenceDate);
    
    case 'quarterly':
      return startOfQuarter(referenceDate);
    
    default:
      return getMondayStartOfWeek(referenceDate);
  }
};

/**
 * Get the proper end date for a meeting period based on frequency
 */
export const getMeetingEndDate = (frequency: string, startDate: Date): Date => {
  switch (frequency) {
    case 'daily':
      return startDate;
    
    case 'weekly':
      return getSundayEndOfWeek(startDate);
    
    case 'bi-weekly': {
      const nextWeekStart = addWeeks(startDate, 1);
      return getSundayEndOfWeek(nextWeekStart);
    }
    
    case 'monthly':
      // endOfMonth returns the last day of the current month
      return endOfMonth(startDate);
    
    case 'quarterly':
      // endOfQuarter returns the last day of the current quarter
      return endOfQuarter(startDate);
    
    default:
      return getSundayEndOfWeek(startDate);
  }
};

/**
 * Calculate the next meeting start date based on frequency and current start date
 */
export const getNextMeetingStartDate = (frequency: string, currentStartDate: Date): Date => {
  switch (frequency) {
    case 'daily':
      return addDays(currentStartDate, 1);
    
    case 'weekly':
      return addWeeks(currentStartDate, 1);
    
    case 'bi-weekly':
      return addWeeks(currentStartDate, 2);
    
    case 'monthly':
      return addMonths(currentStartDate, 1);
    
    case 'quarterly':
      return addQuarters(currentStartDate, 1);
    
    default:
      return addWeeks(currentStartDate, 1);
  }
};

/**
 * Get the proper period label for a meeting
 */
export const getMeetingPeriodLabel = (startDate: Date, frequency: string): string => {
  // For monthly meetings, ensure we're working with the first day of the month
  const actualStartDate = frequency === 'monthly' ? startOfMonth(startDate) : startDate;
  const endDate = getMeetingEndDate(frequency, actualStartDate);
  
  let periodType: string;
  let periodNumber: string;
  
  switch (frequency) {
    case 'daily':
      periodType = 'Day';
      periodNumber = format(startDate, 'M/d');
      break;
    
    case 'weekly':
      periodType = 'Week';
      periodNumber = getWeek(startDate).toString();
      break;
    
    case 'bi-weekly':
      periodType = 'Bi-week';
      periodNumber = getWeek(startDate).toString();
      break;
    
    case 'monthly':
      periodType = '';
      periodNumber = format(actualStartDate, 'MMM yyyy');
      break;
    
    case 'quarterly': {
      periodType = 'Quarter';
      const quarter = Math.floor((startDate.getMonth() + 3) / 3);
      periodNumber = `Q${quarter}`;
      break;
    }
    
    default:
      periodType = 'Week';
      periodNumber = getWeek(startDate).toString();
  }
  
  const dateRange = `${format(actualStartDate, 'M/d')} - ${format(endDate, 'M/d')}`;
  
  // For monthly, just show "October 2024 (10/1 - 10/31)"
  if (periodType === '') {
    return `${periodNumber} (${dateRange})`;
  }
  
  return `${periodType} ${periodNumber} (${dateRange})`;
};

/**
 * Get ISO date string for database storage
 */
export const getISODateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};
