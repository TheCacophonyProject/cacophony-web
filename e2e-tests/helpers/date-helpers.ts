export const addDays = (startDate: Date, days: number) => {
  const result = new Date(startDate);
  result.setDate(result.getDate() + days);
  return result;
};

export const addMinutes = (startDate: Date, mins: number) => {
  const result = new Date(startDate);
  result.setMinutes(result.getMinutes() + mins);
  return result;
};

export const addSeconds = (startDate: Date, secs: number) => {
  const result = new Date(startDate);
  result.setSeconds(result.getSeconds() + secs);
  return result;
};

export const spreadDays = (startDate: Date, days: number): Date[] => {
  if (addDays(startDate, days).getTime() > new Date().getTime()) {
    // NOTE: We don't allow recordings with far future dates, so we always need to make sure our startDate
    //  for generating these test dates is sufficiently far in the past.
    throw new Error(
      `Cannot generate dates in the future: ${startDate.toISOString()} + ${days} days`,
    );
  }
  const dates = [];
  for (let i = 0; i < days; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
};
