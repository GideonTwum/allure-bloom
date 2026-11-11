import { Container } from "@/components/layout/container"

export function CatalogueNotice({
  title,
  message,
  heading = "h1",
}: {
  title: string
  message: string
  heading?: "h1" | "h2"
}) {
  const Title = heading
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <Title className="max-w-2xl font-heading text-5xl leading-[0.95] text-espresso sm:text-6xl">
          {title}
        </Title>
        <p role="alert" className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {message}
        </p>
      </Container>
    </section>
  )
}
