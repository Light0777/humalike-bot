const USER_ID_KEY = "humalike_user_id"
const USERNAME_KEY = "humalike_username"

export function getUserId(): string {
  if (typeof window === "undefined") return ""
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function getStoredUsername(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(USERNAME_KEY) || ""
}

export function storeUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username)
}
