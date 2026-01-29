"use client";

export default function LoginWithGitHub() {
  const login = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!;
    const redirectUri =
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/github/callback`;

    window.location.href =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=repo read:org`;
  };

  return (
    <button
      onClick={login}
      className="flex h-12 w-full items-center justify-center rounded-full bg-black px-6 text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 md:w-[220px]"
    >
      Login with GitHub
    </button>
  );
}
