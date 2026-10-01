-- Lummy Ticket: where a show takes place, so a claim photo's location can be checked against it.
-- Optional: without it the location check is reported as not made, never as failed. Filled in by
-- staff for real shows; the demo seed leaves it empty rather than guess.
alter table public.events
  add column venue_lat double precision check (venue_lat between -90 and 90),
  add column venue_lng double precision check (venue_lng between -180 and 180),
  add constraint events_venue_location_pair check ((venue_lat is null) = (venue_lng is null));
