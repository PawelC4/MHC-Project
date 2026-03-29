'use client';

import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function GoogleLoginButton() {

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });

    if (error) {
      console.error('Error logging in:', error.message);
      alert('Failed to log in with Google.');
    }
  };

  return (
    <div className="">
      <button
        onClick={handleGoogleLogin}
        className="btn btn--primary flex items-center justify-center gap-3 w-full bg-white text-black hover:bg-gray-100 transition-colors"
      >
        <img
          src="https://www.svgrepo.com/show/355037/google.svg"
          alt="Google Logo"
          width={24}
          height={24}
          className="w-6 h-6 shrink-0"
        />
        Sign in with Google
      </button>
    </div>
  );
}