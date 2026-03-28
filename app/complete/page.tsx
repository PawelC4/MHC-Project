'use client';
import dynamic from 'next/dynamic';

const CompletePage = dynamic(() => import('../components/CompletePage'), { ssr: false });

export default function Page() {
  return <CompletePage />;
}
