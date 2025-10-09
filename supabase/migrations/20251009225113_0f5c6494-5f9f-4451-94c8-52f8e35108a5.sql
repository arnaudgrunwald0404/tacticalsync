-- Add Insight personality assessment columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN red_percentage integer DEFAULT 0 CHECK (red_percentage >= 0 AND red_percentage <= 100),
ADD COLUMN blue_percentage integer DEFAULT 0 CHECK (blue_percentage >= 0 AND blue_percentage <= 100),
ADD COLUMN green_percentage integer DEFAULT 0 CHECK (green_percentage >= 0 AND green_percentage <= 100),
ADD COLUMN yellow_percentage integer DEFAULT 0 CHECK (yellow_percentage >= 0 AND yellow_percentage <= 100);