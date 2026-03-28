'use client';
import dynamic from 'next/dynamic';

const AdventurePage = dynamic(() => import('../components/AdventurePage'), { ssr: false });

export default function Page() {
  return <AdventurePage />;
}
