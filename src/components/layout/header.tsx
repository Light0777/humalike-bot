import Link from "next/link"

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between px-6 border-b border-[#ebebeb] bg-white">
      <Link href="/" className="text-lg font-semibold tracking-tight text-[#171717]">
        humalike-bot
      </Link>
      <span className="text-xs text-[#888] font-mono">alpha</span>
    </header>
  )
}
