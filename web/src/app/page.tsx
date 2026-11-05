import { HomeClient } from '../components/HomeClient'

// Listings are regenerated at most every 60 s.
export const revalidate = 60

export default function HomePage() {
  return <HomeClient now={new Date().toISOString()} />
}
