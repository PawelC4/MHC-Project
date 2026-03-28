import dynamic from 'next/dynamic';

/**
 * Subway Quest is a pure browser app (Geolocation, camera, Leaflet, DOM
 * manipulation). Loading it with { ssr: false } prevents Next.js from
 * attempting to server-render it, where browser APIs aren't available.
 */
const SubwayQuestApp = dynamic(
  () => import('./components/SubwayQuestApp'),
  { ssr: false }
);

export default function Page() {
  return <SubwayQuestApp />;
}
