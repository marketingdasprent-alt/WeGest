-- Remove admin privileges from Marketing user
UPDATE profiles 
SET is_admin = false 
WHERE id = '290a09b7-3e8a-4032-a9e2-d1bc41a75ad7';