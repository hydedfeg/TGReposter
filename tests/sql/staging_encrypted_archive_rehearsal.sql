-- Synthetic-only data. Never fetch staging, production or user rows.
-- The SQL runs once on the synthetic source, once after restore.
-- CREATE IF NOT EXISTS and fixed inserts let it act as a consistency probe.
CREATE TABLE IF NOT EXISTS public.synthetic_archive_records (
 id integer PRIMARY KEY,
 label text NOT NULL,
 amount numeric(12,2) NOT NULL
);
INSERT INTO public.synthetic_archive_records (id,label,amount)
VALUES
 (1,'synthetic-only-alpha',10.50),
 (2,'synthetic-only-bravo',20.25),
 (3,'synthetic-only-charlie',30.75)
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.synthetic_archive_records) <> 3
    OR (SELECT sum(amount) FROM public.synthetic_archive_records) <> 61.50
    OR (SELECT md5(string_agg(label,',' ORDER BY id))
        FROM public.synthetic_archive_records) <>
       md5('synthetic-only-alpha,synthetic-only-bravo,synthetic-only-charlie')
 THEN
   RAISE EXCEPTION 'Synthetic encrypted archive recovery integrity mismatch';
 END IF;
END $$;
