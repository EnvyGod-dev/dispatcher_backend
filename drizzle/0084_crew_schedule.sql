-- Ээлжийн (А/Б/В/Г) хуваарийг вебээс гараар оруулах хүснэгт.
-- Хуваарь оруулаагүй өдөрт кодын үндсэн дүрэм (2026-09-29: өдөр А, шөнө В, долоо хоног тутам Мягмарт солигдоно) хэрэглэгдэнэ.

CREATE TABLE IF NOT EXISTS crew_schedule_periods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  day_crew        enum_driver_shift_group NOT NULL,
  night_crew      enum_driver_shift_group NOT NULL,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crew_schedule_periods_dates_check CHECK (end_date >= start_date),
  CONSTRAINT crew_schedule_periods_crews_check CHECK (day_crew <> night_crew)
);

CREATE INDEX IF NOT EXISTS idx_crew_schedule_org_dates
  ON crew_schedule_periods (organization_id, start_date, end_date);

-- 2026-09-29-өөс хойшхи ээлжүүдийн ээлжийг (бригад) хэрэглэгчийн профайлаас биш,
-- хуваарийн үндсэн дүрмээр шинэчилнэ: өдрийн дараалал А, Б, Г, В; шөнө = өмнөх долоо хоногийн өдөр.
UPDATE shifts
SET driver_shift_group = (ARRAY['A', 'B', 'D', 'C']::enum_driver_shift_group[])[
  (((operational_date - DATE '2026-09-29') / 7 + CASE WHEN shift_type = 'night' THEN 3 ELSE 0 END) % 4) + 1
]
WHERE operational_date >= DATE '2026-09-29';
