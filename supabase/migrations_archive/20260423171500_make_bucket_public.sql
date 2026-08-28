-- Tornar o bucket de assistencia público para que as fotos apareçam na galeria
UPDATE storage.buckets SET public = true WHERE id = 'assistencia-anexos';
