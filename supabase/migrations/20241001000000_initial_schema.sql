-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Users table
create table public.users (
  id uuid primary key default uuid_generate_v4(),
  phone_number text unique not null,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  password_hash text not null,
  avatar_url text,
  user_type text not null default 'CUSTOMER' check (user_type in ('CUSTOMER', 'HUSTLER', 'BOTH')),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  
  -- Auth tracking
  last_login_at timestamptz,
  last_activity_at timestamptz,
  
  -- Location
  latitude double precision,
  longitude double precision,
  address text,
  city text,
  state text,
  country text not null default 'Nigeria',
  
  -- Profile
  bio text,
  skills text[],
  rating double precision not null default 0.0,
  total_rating integer not null default 0,
  
  -- Stats
  tasks_completed integer not null default 0,
  tasks_posted integer not null default 0,
  total_earnings integer not null default 0,
  response_time integer not null default 0,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tasks table
create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  category text not null,
  budget integer not null,
  deadline timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  
  -- Location
  latitude double precision,
  longitude double precision,
  address text,
  city text,
  state text,
  
  -- Media
  image_urls text[],
  
  -- Relations
  poster_id uuid not null references public.users(id) on delete cascade,
  hustler_id uuid references public.users(id) on delete set null,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chats
create table public.chats (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid unique not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat members
create table public.chat_members (
  id uuid primary key default uuid_generate_v4(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(chat_id, user_id)
);

-- Messages
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  content text not null,
  type text not null default 'TEXT' check (type in ('TEXT', 'IMAGE', 'SYSTEM')),
  
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  
  -- Media
  image_url text,
  
  created_at timestamptz not null default now()
);

-- Reviews
create table public.reviews (
  id uuid primary key default uuid_generate_v4(),
  rating integer not null check (rating between 1 and 5),
  comment text,
  
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  
  created_at timestamptz not null default now(),
  unique(task_id, author_id)
);

-- Notifications
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  message text not null,
  type text not null,
  is_read boolean not null default false,
  
  user_id uuid not null references public.users(id) on delete cascade,
  
  -- Optional references
  task_id uuid references public.tasks(id) on delete set null,
  chat_id uuid references public.chats(id) on delete set null,
  
  created_at timestamptz not null default now()
);

-- Create indexes for better query performance
create index idx_tasks_poster_id on public.tasks(poster_id);
create index idx_tasks_hustler_id on public.tasks(hustler_id);
create index idx_tasks_status on public.tasks(status);
create index idx_messages_chat_id on public.messages(chat_id);
create index idx_reviews_target_id on public.reviews(target_id);
create index idx_notifications_user_id on public.notifications(user_id);

-- Enable Row Level Security
alter table public.users enable row level security;
alter table public.tasks enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;

-- Create policies for RLS (basic examples, adjust as needed)
-- Users can read their own profile and public profiles
create policy "Users can view their own profile" 
on public.users for select using (auth.uid() = id);

create policy "Users can view public profiles"
on public.users for select using (true);

-- Users can update their own profile
create policy "Users can update their own profile"
on public.users for update using (auth.uid() = id);

-- Tasks policies
create policy "Users can view all tasks"
on public.tasks for select using (true);

create policy "Users can create tasks"
on public.tasks for insert with check (auth.uid() = poster_id);

create policy "Users can update their own tasks"
on public.tasks for update using (auth.uid() = poster_id);

-- Add more policies as needed...

-- Create a function to update the updated_at column
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create triggers to update updated_at
create trigger update_users_updated_at
before update on public.users
for each row execute function update_updated_at_column();

create trigger update_tasks_updated_at
before update on public.tasks
for each row execute function update_updated_at_column();

create trigger update_chats_updated_at
before update on public.chats
for each row execute function update_updated_at_column();

-- Create a function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, created_at, updated_at)
  values (new.id, new.email, now(), now());
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable realtime for tables
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
