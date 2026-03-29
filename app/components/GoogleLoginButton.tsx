'use client';

import GoogleIcon from '@mui/icons-material/Google';
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
    <button onClick={handleGoogleLogin} className="btn btn--primary btn--lg">
      <GoogleIcon />
      Sign in with Google
    </button>
  );
}