export function nextIndex(current: number, length: number, key: string) {
  if (length === 0) return null
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return (current - 1 + length) % length
  }
  if (key === "Home") return 0
  if (key === "End") return length - 1
  return null
}

export function focusById(id: string) {
  document.getElementById(id)?.focus()
}
