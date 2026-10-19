import { NextIntlClientProvider } from "next-intl";

import messages from "../messages/en.json";

import type { Preview } from "@storybook/nextjs-vite";

const preview: Preview = {
  // Global intl: every story renders inside the provider, so no story imports
  // `messages` or wraps in `NextIntlClientProvider` itself.
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },

    options: {
      storySort: {
        order: ["Guides", "Primitives", "Components", "Core"],
      },
    },
  },
};

export default preview;
