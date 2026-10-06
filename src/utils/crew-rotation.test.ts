import { describe, expect, it } from 'vitest';
import { addDays, crewCalendar, crewFor, crewWeekFor, crewWeeks } from './crew-rotation';

describe('crew rotation (default rule)', () => {
  it('matches the schedule given by the mine', () => {
    // А: өдөр 09.29–10.05, шөнө 10.06–10.12, 10.13-аас амарна.
    expect(crewFor('2026-09-29', 'day')).toBe('A');
    expect(crewFor('2026-10-05', 'day')).toBe('A');
    expect(crewFor('2026-10-06', 'night')).toBe('A');
    expect(crewFor('2026-10-12', 'night')).toBe('A');
    // Б: өдөр 10.06–10.12, шөнө 10.13–10.19.
    expect(crewFor('2026-10-06', 'day')).toBe('B');
    expect(crewFor('2026-10-12', 'day')).toBe('B');
    expect(crewFor('2026-10-13', 'night')).toBe('B');
    expect(crewFor('2026-10-19', 'night')).toBe('B');
    // В: 10.06-аас амраад 10.20–10.26 өдөр.
    expect(crewFor('2026-10-05', 'night')).toBe('C');
    expect(crewWeekFor('2026-10-06')?.resting).toContain('C');
    expect(crewWeekFor('2026-10-13')?.resting).toContain('C');
    expect(crewFor('2026-10-20', 'day')).toBe('C');
    expect(crewFor('2026-10-26', 'day')).toBe('C');
    // Г: 09.29–10.12 амарна, 10.13–10.19 өдөр, 10.20–10.26 шөнө.
    expect(crewWeekFor('2026-09-29')?.resting).toContain('D');
    expect(crewWeekFor('2026-10-06')?.resting).toContain('D');
    expect(crewFor('2026-10-13', 'day')).toBe('D');
    expect(crewFor('2026-10-19', 'day')).toBe('D');
    expect(crewFor('2026-10-20', 'night')).toBe('D');
    expect(crewFor('2026-10-26', 'night')).toBe('D');
  });

  it('repeats every 4 weeks, also before the anchor', () => {
    for (const date of ['2026-09-29', '2026-10-09', '2026-10-12', '2025-01-01', '2027-06-15']) {
      const later = addDays(date, 28)!;
      expect(crewFor(later, 'day')).toBe(crewFor(date, 'day'));
      expect(crewFor(later, 'night')).toBe(crewFor(date, 'night'));
    }
  });

  it('night crew is the previous week day crew; each crew rests 2 weeks', () => {
    const weeks = crewWeeks('2026-09-01', 12);
    for (let i = 1; i < weeks.length; i += 1) {
      expect(weeks[i]!.night).toBe(weeks[i - 1]!.day);
      expect(weeks[i]!.day).not.toBe(weeks[i]!.night);
      expect(weeks[i]!.resting).toHaveLength(2);
      expect(new Date(`${weeks[i]!.weekStart}T00:00:00Z`).getUTCDay()).toBe(2); // Мягмар
    }
  });

  it('handles invalid input', () => {
    expect(crewFor(null, 'day')).toBeNull();
    expect(crewFor('2026-10-06', null)).toBeNull();
    expect(crewFor('bad', 'day')).toBeNull();
    expect(crewCalendar('2026-10-10', '2026-10-01')).toEqual([]);
    expect(addDays('bad', 1)).toBeNull();
  });

  it('builds a daily calendar', () => {
    expect(crewCalendar('2026-10-05', '2026-10-06')).toEqual([
      { date: '2026-10-05', day: 'A', night: 'C' },
      { date: '2026-10-06', day: 'B', night: 'A' },
    ]);
  });
});
