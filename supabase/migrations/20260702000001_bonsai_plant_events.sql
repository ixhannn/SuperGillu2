-- The grove: completing an Ancient tree plants the next one (new species,
-- new DNA). A 'plant' event marks the boundary; both partners derive the
-- same garden from the shared log. Id shape: `${coupleId}_plant_${index}` —
-- deterministic across partners, so whoever plants first wins the race and
-- the other client's replay is an idempotent no-op.

alter table public.bonsai_events
  drop constraint if exists bonsai_events_event_type_check;

alter table public.bonsai_events
  add constraint bonsai_events_event_type_check
  check (event_type in ('water', 'note_open', 'plant'));
