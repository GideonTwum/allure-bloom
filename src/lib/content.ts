/**
 * Site copy and stable studio ids. Studio names, phones, and map searches
 * are read from public.branches. Treatment names are read from public.services.
 */

export const navItems = [
  { href: "/", id: "home", label: "Home" },
  { href: "/services", id: "services", label: "Services" },
  { href: "/gallery", id: "gallery", label: "Gallery" },
  { href: "/booking", id: "booking", label: "Booking" },
  { href: "/#contacts", id: "contacts", label: "Contacts" },
] as const

export const footerNav = [
  ...navItems,
  { href: "/about", id: "about", label: "About" },
] as const

export const galleryImages = [
  {
    src: "/editorial/allurebabes2.png",
    alt: "Three women in black tops on a pink background, photographed with long lashes. Studio photograph supplied for the Allure Bloom preview.",
    caption: "Studio photograph · not a client result",
  },
  {
    src: "/editorial/allurebabes3.png",
    alt: "Three women posed closely together, with long lashes visible. Studio photograph supplied for the Allure Bloom preview.",
    caption: "Studio photograph · not a client result",
  },
] as const

export const instagramUrl = "https://www.instagram.com/allure_bloom_/"

export const branchIds = ["accra", "kumasi"] as const

export type BranchId = (typeof branchIds)[number]

export function mapEmbedUrl(query: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
}

export function mapDirectionsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export const bookingTypes = [
  {
    id: "walk-in",
    label: "Walk-in",
    summary: "Visit Accra Studio or Kumasi Studio.",
  },
  {
    id: "home",
    label: "Home Service",
    summary: "Travel coverage is still pending confirmation.",
  },
] as const

export type BookingTypeId = (typeof bookingTypes)[number]["id"]

export const samplePhrases = [
  "Lash studio",
  "Lash services",
  "Sample menu",
  "Nail services",
] as const

export const studyGroups = ["All", "Lashes", "Nails"] as const

export type StudyGroup = (typeof studyGroups)[number]

export type Study = {
  id: string
  title: string
  group: Exclude<StudyGroup, "All">
  caption: string
  wide?: boolean
}

export const studies: Study[] = [
  {
    id: "lash-fan",
    title: "Lash fan",
    group: "Lashes",
    wide: true,
    caption:
      "A fan of tapered strokes in espresso. A stand-in for a future lash photograph.",
  },
  {
    id: "lash-line",
    title: "Lash line",
    group: "Lashes",
    caption:
      "A single lash line, kept long and light. Not a record of a finished appointment.",
  },
  {
    id: "soft-lift",
    title: "Soft lift",
    group: "Lashes",
    caption: "An upward curve. Room for a lash photograph once the portfolio exists.",
  },
  {
    id: "outer-corner",
    title: "Outer corner",
    group: "Lashes",
    caption:
      "Lashes gathered toward the outer corner. A design study, not a client look.",
  },
  {
    id: "quiet-set",
    title: "Quiet set",
    group: "Lashes",
    caption: "A softer, shorter lash study in cream and espresso.",
  },
  {
    id: "nail-note",
    title: "Nail note",
    group: "Nails",
    caption:
      "One quiet nail shape, held smaller on purpose. A complement to the lash work, not the focus.",
  },
]

export const bookingPreviewSteps = [
  { id: "type", title: "Booking type", summary: "Walk-in or home service." },
  { id: "studio", title: "Studio", summary: "Accra or Kumasi for a walk-in." },
  { id: "service", title: "Service", summary: "From the published catalogue." },
  { id: "professional", title: "Professional", summary: "Anyone available." },
  { id: "when", title: "Date and time", summary: "Not checked against a calendar." },
  { id: "review", title: "Review", summary: "Nothing is reserved." },
] as const
