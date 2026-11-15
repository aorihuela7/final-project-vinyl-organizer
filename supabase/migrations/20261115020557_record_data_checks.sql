-- Rows written from the browser (records added by hand) are checked like the
-- ones written by the import: links and covers must point to Discogs, and text
-- has sane lengths. NOT VALID: applies to new and updated rows; existing rows
-- came from the Discogs API.
alter table public.records
  add constraint records_discogs_url_check
    check (discogs_url is null or discogs_url ~ '^https://www\.discogs\.com/release/[0-9]+$') not valid,
  add constraint records_cover_url_check
    check (cover_url is null or cover_url ~ '^https://([a-z0-9-]+\.)*discogs\.com/') not valid,
  add constraint records_thumb_url_check
    check (thumb_url is null or thumb_url ~ '^https://([a-z0-9-]+\.)*discogs\.com/') not valid,
  add constraint records_text_lengths_check
    check (
      char_length(artist) <= 1000 and char_length(title) <= 1000
      and (label is null or char_length(label) <= 500)
      and (genre is null or char_length(genre) <= 100)
      and (format_name is null or char_length(format_name) <= 100)
      and cardinality(styles) <= 50 and cardinality(format_descriptions) <= 50
    ) not valid;
