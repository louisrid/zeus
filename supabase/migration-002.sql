-- Migration 002: player photo code + FPL team strength (run once in Supabase SQL Editor)
alter table players add column if not exists code int;
alter table teams add column if not exists strength int;
