// Supabase project keys: Dashboard -> Project Settings -> API
// The "anon public" key is SAFE to expose (Row Level Security protects data).
// NEVER put the "service_role" key in any frontend file.
const SUPABASE_URL = 'https://bwimgoeyequnwinqrwqr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3aW1nb2V5ZXF1bndpbnFyd3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyODkwNjgsImV4cCI6MjEwNjg2NTA2OH0.gvBE7GwU22tPPtjmr40l0w1ashf9uUJaEfxZf_TwV8g';
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
