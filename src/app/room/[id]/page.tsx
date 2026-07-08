import { RoomView } from "@/components/room/room-view"

interface RoomPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ username?: string }>
}

export default async function RoomPage({ params, searchParams }: RoomPageProps) {
  const { id } = await params
  const { username } = await searchParams

  return <RoomView roomId={id} username={username || "Anonymous"} />
}
