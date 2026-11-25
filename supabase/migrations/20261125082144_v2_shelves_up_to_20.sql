-- Ale's review (November 25, 2026): shelves up to 20 rows and 20 columns of
-- cubes, and common names instead of a brand.

-- 1. Size. On CD shelves each cube holds two rows of CDs, and each row is a
--    compartment, so a 20-row cube shelf has 40 rows. Columns keep their old
--    database limit of 24; the builder stops at 20.
alter table public.furniture drop constraint furniture_rows_check;
alter table public.furniture add constraint furniture_rows_check check (rows between 1 and 40);
alter table public.compartments drop constraint compartments_position_bounds_check;
alter table public.compartments add constraint compartments_position_bounds_check check ("row" < 40 and col < 24);

-- 2. Names. "Kallax" is a brand: shelves still named after it get the common
--    name, in the language their owner uses (English without a preference).
update public.furniture f
set name = regexp_replace(
  f.name,
  '^Kallax',
  coalesce(
    (select case p.locale when 'es' then 'Estante de cubos' when 'pt' then 'Estante de nichos' end
     from public.user_preferences p
     where p.user_id = f.user_id),
    'Cube shelf'
  )
)
where f.name ~ '^Kallax( |$)';

-- Sizes in names are now width × height, like a tower's "1×5": the low unit
-- (2 rows, 4 columns) is "4×2".
update public.furniture
set name = regexp_replace(name, ' 2×4(?=$|[ ,)])', ' 4×2')
where template = 'low_2x4' and rows = 2 and cols = 4 and name ~ '^(Low unit|Mueble bajo|Móvel baixo) 2×4($|[ ,)])';
