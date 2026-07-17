-- Enable UUID support
create extension if not exists "pgcrypto";

-- User profiles (linked to Supabase Auth)
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    full_name text,
    role text not null default 'admin'
        check (role in ('super-admin','admin')),
    is_active boolean not null default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Source channels
create table if not exists public.source_channels (
    id uuid primary key default gen_random_uuid(),
    username text unique not null,
    display_name text,
    enabled boolean default true,
    created_at timestamptz default now()
);

-- Filters
create table if not exists public.filters (
    id uuid primary key default gen_random_uuid(),
    positive_keywords text[] default '{}',
    negative_keywords text[] default '{}',
    required_hashtags text[] default '{}',
    case_sensitive boolean default false,
    created_at timestamptz default now()
);

-- Telegram destinations
create table if not exists public.destination_targets (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    channel_id text not null,
    enabled boolean default true,
    created_at timestamptz default now()
);

-- AI configuration
create table if not exists public.ai_settings (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    model text not null,
    updated_at timestamptz default now()
);

-- Curated posts
create table if not exists public.posts (
    id text primary key,
    channel_username text not null,
    original_text text not null,
    edited_text text,
    photo_url text,
    telegram_url text,
    status text not null default 'pending',
    published_at timestamptz,
    created_at timestamptz default now()
);