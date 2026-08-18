CREATE TABLE IF NOT EXISTS support_images (
  id uuid PRIMARY KEY,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 30),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  image_data bytea NOT NULL CHECK (octet_length(image_data) BETWEEN 1 AND 2097152),
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_images_sort_idx
  ON support_images (sort_order, created_at);
