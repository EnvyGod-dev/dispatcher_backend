import { describe, expect, it } from 'vitest';
import { crewCalendar, crewFor, crewWeekFor, crewWeeks } from './crew-rotation';

describe('crew rotation', () => {
  it('matches the agreed example around 2026-10-06', () => {
    // Одоо (Даваа 10-05): өдөр Г, шөнө Б.
    expect(crewFor('2026-10-05', 'day')).toBe('D');
    expect(crewFor('2026-10-05', 'night')).toBe('B');
    // Мягмар (10-06): өдөр В, шөнө Г.
    expect(crewFor('2026-10-06', 'day')).toBe('C');
    expect(crewFor('2026-10-06', 'night')).toBe('D');
    // Дараагийн Мягмар (10-13): Г амарна, А өдөр, В шөнө.
    expect(crewFor('2026-10-13', 'day')).toBe('A');
    expect(crewFor('2026-10-13', 'night')).toBe('C');
    expect(crewWeekFor('2026-10-13')?.resting.sort()).toEqual(['B', 'D']);
    expect(crewFor('2026-10-20', 'day')).toBe('B');
    expect(crewFor('2026-10-20', 'night')).toBe('A');
  });

  it('repeats every 4 weeks, also before the anchor', () => {
    for (const date of ['2026-10-06', '2026-10-09', '2026-10-12', '2025-01-01', '2027-06-15']) {
      const [y, m, d] = date.split('-').map(Number);
      const later = new Date(Date.UTC(y!, m! - 1, d! + 28)).toISOString().slice(0, 10);
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
  });

  it('builds a daily calendar', () => {
    const days = crewCalendar('2026-10-05', '2026-10-06');
    expect(days).toEqual([
      { date: '2026-10-05', day: 'D', night: 'B' },
      { date: '2026-10-06', day: 'C', night: 'D' },
    ]);
  });
});
