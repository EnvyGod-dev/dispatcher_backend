import dayjsLib from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjsLib.extend(utc);
dayjsLib.extend(timezone);
dayjsLib.tz.setDefault('Asia/Ulaanbaatar');

const ubTimezone = 'Asia/Ulaanbaatar';

function changeTimeZone(date: string | Date, timeZone: string) {
  if (typeof date === 'string') {
    return new Date(
      new Date(date).toLocaleString('en-US', {
        timeZone,
      })
    );
  }

  return new Date(
    date.toLocaleString('en-US', {
      timeZone,
    })
  );
}

export const createDateInUbTime = (input: string) => {
  return changeTimeZone(input, ubTimezone);
};

export const newDateInUb = () => {
  return dayjsLib.tz();
};

export const createDate = (input: string) => {
  return dayjsLib.tz(input);
};

export default dayjsLib;
