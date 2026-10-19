import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  const t = useTranslations("home");
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <p className="mt-4 text-lg">{t("subtitle")}</p>
      <Button className="mt-6">{t("cta")}</Button>
    </main>
  );
}
